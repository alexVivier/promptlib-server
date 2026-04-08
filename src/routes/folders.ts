import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

export async function folderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate)

  // List all folders
  app.get('/folders', async (request) => {
    const folders = await prisma.folder.findMany({
      where: { ownerId: request.user.sub },
      select: { id: true, path: true, context: true },
      orderBy: { path: 'asc' }
    })
    return folders
  })

  // Create folder
  app.post<{
    Body: { path: string; context?: string }
  }>('/folders', async (request, reply) => {
    const { path, context } = request.body
    const userId = request.user.sub

    const existing = await prisma.folder.findUnique({
      where: { ownerId_path: { ownerId: userId, path } }
    })

    if (existing) {
      return reply.code(409).send({ error: 'Folder already exists' })
    }

    const folder = await prisma.folder.create({
      data: { path, context: context ?? '', ownerId: userId }
    })

    return { id: folder.id, path: folder.path, context: folder.context }
  })

  // Update folder (rename or update context)
  app.patch<{
    Params: { id: string }
    Body: { path?: string; context?: string }
  }>('/folders/:id', async (request, reply) => {
    const folder = await prisma.folder.findFirst({
      where: { id: request.params.id, ownerId: request.user.sub }
    })

    if (!folder) {
      return reply.code(404).send({ error: 'Folder not found' })
    }

    const { path, context } = request.body

    const updated = await prisma.folder.update({
      where: { id: request.params.id },
      data: {
        ...(path !== undefined && { path }),
        ...(context !== undefined && { context })
      }
    })

    return { id: updated.id, path: updated.path, context: updated.context }
  })

  // Delete folder
  app.delete<{ Params: { id: string } }>('/folders/:id', async (request, reply) => {
    const folder = await prisma.folder.findFirst({
      where: { id: request.params.id, ownerId: request.user.sub }
    })

    if (!folder) {
      return reply.code(404).send({ error: 'Folder not found' })
    }

    // Move prompts in this folder to root (folderId = null)
    await prisma.prompt.updateMany({
      where: { folderId: folder.id },
      data: { folderId: null }
    })

    await prisma.folder.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })

  // Get folder context
  app.get<{ Params: { id: string } }>('/folders/:id/context', async (request, reply) => {
    const folder = await prisma.folder.findFirst({
      where: { id: request.params.id, ownerId: request.user.sub }
    })

    if (!folder) {
      return reply.code(404).send({ error: 'Folder not found' })
    }

    return { context: folder.context }
  })

  // Set folder context
  app.put<{
    Params: { id: string }
    Body: { context: string }
  }>('/folders/:id/context', async (request, reply) => {
    const folder = await prisma.folder.findFirst({
      where: { id: request.params.id, ownerId: request.user.sub }
    })

    if (!folder) {
      return reply.code(404).send({ error: 'Folder not found' })
    }

    const updated = await prisma.folder.update({
      where: { id: request.params.id },
      data: { context: request.body.context }
    })

    return { context: updated.context }
  })
}
