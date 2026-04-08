import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  editorFontSize: number
  autoSaveDelay: number
  language: 'fr' | 'en' | 'es' | 'pt' | 'de'
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  editorFontSize: 14,
  autoSaveDelay: 500,
  language: 'fr'
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate)

  // Get settings
  app.get('/settings', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { settings: true }
    })

    return { ...DEFAULT_SETTINGS, ...(user?.settings as Partial<AppSettings> | null) }
  })

  // Update settings
  app.put<{
    Body: Partial<AppSettings>
  }>('/settings', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { settings: true }
    })

    const currentSettings = { ...DEFAULT_SETTINGS, ...(user?.settings as Partial<AppSettings> | null) }
    const newSettings = { ...currentSettings, ...request.body }

    await prisma.user.update({
      where: { id: request.user.sub },
      data: { settings: newSettings }
    })

    return newSettings
  })
}
