import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import { config } from './config.js'
import { authRoutes } from './routes/auth.js'
import { promptRoutes } from './routes/prompts.js'
import { folderRoutes } from './routes/folders.js'
import { imageRoutes } from './routes/images.js'
import { settingsRoutes } from './routes/settings.js'
import { adminRoutes } from './routes/admin.js'
import { yjsRoutes } from './ws/yjs-handler.js'

export async function buildApp() {
  const app = Fastify({
    logger: true
  })

  // Plugins
  await app.register(cors, { origin: config.corsOrigin })
  await app.register(jwt, { secret: config.jwtSecret })
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })
  await app.register(websocket)

  // API routes (prefixed with /api)
  await app.register(
    async (api) => {
      await api.register(authRoutes)
      await api.register(promptRoutes)
      await api.register(folderRoutes)
      await api.register(imageRoutes)
      await api.register(settingsRoutes)
      await api.register(adminRoutes)
    },
    { prefix: '/api' }
  )

  // WebSocket routes (no prefix)
  await app.register(yjsRoutes)

  // Health check
  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
