import { FastifyInstance } from 'fastify'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { prisma } from '../lib/prisma.js'
import type { WebSocket } from 'ws'

const MSG_SYNC = 0
const MSG_AWARENESS = 1

interface DocState {
  doc: Y.Doc
  awareness: awarenessProtocol.Awareness
  connections: Set<WebSocket>
  persistTimer: ReturnType<typeof setTimeout> | null
  cleanupTimer: ReturnType<typeof setTimeout> | null
}

const docs = new Map<string, DocState>()

const PERSIST_DEBOUNCE = 2000
const CLEANUP_DELAY = 30000

async function getOrCreateDoc(promptId: string): Promise<DocState> {
  const existing = docs.get(promptId)
  if (existing) {
    if (existing.cleanupTimer) {
      clearTimeout(existing.cleanupTimer)
      existing.cleanupTimer = null
    }
    return existing
  }

  const doc = new Y.Doc()
  const awareness = new awarenessProtocol.Awareness(doc)

  // Load persisted state from DB
  const prompt = await prisma.prompt.findUnique({
    where: { id: promptId },
    select: { yjsState: true, content: true }
  })

  if (prompt?.yjsState) {
    Y.applyUpdate(doc, new Uint8Array(prompt.yjsState))
  } else if (prompt?.content) {
    // Initialize Y.Text from existing content
    const ytext = doc.getText('content')
    ytext.insert(0, prompt.content)
  }

  const state: DocState = {
    doc,
    awareness,
    connections: new Set(),
    persistTimer: null,
    cleanupTimer: null
  }

  // Persist on updates
  doc.on('update', () => {
    if (state.persistTimer) clearTimeout(state.persistTimer)
    state.persistTimer = setTimeout(() => persistDoc(promptId, state), PERSIST_DEBOUNCE)
  })

  docs.set(promptId, state)
  return state
}

async function persistDoc(promptId: string, state: DocState): Promise<void> {
  try {
    const yjsState = Buffer.from(Y.encodeStateAsUpdate(state.doc))
    const content = state.doc.getText('content').toString()

    await prisma.prompt.update({
      where: { id: promptId },
      data: { yjsState, content }
    })
  } catch (error) {
    console.error(`Failed to persist doc ${promptId}:`, error)
  }
}

function scheduleCleanup(promptId: string, state: DocState): void {
  state.cleanupTimer = setTimeout(() => {
    // Final persist before cleanup
    persistDoc(promptId, state).then(() => {
      state.awareness.destroy()
      state.doc.destroy()
      docs.delete(promptId)
    })
  }, CLEANUP_DELAY)
}

function broadcastToOthers(state: DocState, sender: WebSocket, message: Uint8Array): void {
  const data = Buffer.from(message)
  for (const conn of state.connections) {
    if (conn !== sender && conn.readyState === 1) {
      conn.send(data)
    }
  }
}

function broadcastToAll(state: DocState, message: Uint8Array): void {
  const data = Buffer.from(message)
  for (const conn of state.connections) {
    if (conn.readyState === 1) {
      conn.send(data)
    }
  }
}

export async function yjsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { promptId: string }
    Querystring: { token: string }
  }>('/yjs/:promptId', { websocket: true }, async (socket, request) => {
    const { promptId } = request.params
    const { token } = request.query

    // Verify JWT
    let userId: string
    try {
      const payload = app.jwt.verify<{ sub: string }>(token)
      userId = payload.sub
    } catch {
      socket.close(4001, 'Unauthorized')
      return
    }

    // Verify prompt access
    const prompt = await prisma.prompt.findFirst({
      where: { id: promptId, ownerId: userId }
    })

    if (!prompt) {
      socket.close(4004, 'Prompt not found')
      return
    }

    const state = await getOrCreateDoc(promptId)
    state.connections.add(socket)

    // Send initial sync step 1
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SYNC)
    syncProtocol.writeSyncStep1(encoder, state.doc)
    socket.send(encoding.toUint8Array(encoder))

    // Send current awareness state
    const awarenessStates = awarenessProtocol.encodeAwarenessUpdate(
      state.awareness,
      Array.from(state.awareness.getStates().keys())
    )
    const awarenessEncoder = encoding.createEncoder()
    encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS)
    encoding.writeVarUint8Array(awarenessEncoder, awarenessStates)
    socket.send(encoding.toUint8Array(awarenessEncoder))

    // Handle incoming messages
    socket.on('message', (data: Buffer) => {
      try {
        const message = new Uint8Array(data)
        const decoder = decoding.createDecoder(message)
        const messageType = decoding.readVarUint(decoder)

        switch (messageType) {
          case MSG_SYNC: {
            const encoder = encoding.createEncoder()
            encoding.writeVarUint(encoder, MSG_SYNC)
            syncProtocol.readSyncMessage(decoder, encoder, state.doc, null)
            if (encoding.length(encoder) > 1) {
              socket.send(encoding.toUint8Array(encoder))
            }
            // Broadcast sync updates to other clients
            broadcastToOthers(state, socket, message)
            break
          }
          case MSG_AWARENESS: {
            const update = decoding.readVarUint8Array(decoder)
            awarenessProtocol.applyAwarenessUpdate(state.awareness, update, socket)
            broadcastToOthers(state, socket, message)
            break
          }
        }
      } catch (error) {
        console.error('Error handling WS message:', error)
      }
    })

    socket.on('close', () => {
      state.connections.delete(socket)
      awarenessProtocol.removeAwarenessStates(
        state.awareness,
        [state.doc.clientID],
        null
      )

      if (state.connections.size === 0) {
        scheduleCleanup(promptId, state)
      }
    })
  })
}
