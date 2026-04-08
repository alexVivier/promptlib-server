import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']

export async function imageRoutes(app: FastifyInstance): Promise<void> {
  // Upload image (authenticated)
  app.post<{ Querystring: { promptId: string } }>(
    '/images',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { promptId } = request.query

      // Verify prompt ownership
      const prompt = await prisma.prompt.findFirst({
        where: { id: promptId, ownerId: request.user.sub }
      })

      if (!prompt) {
        return reply.code(404).send({ error: 'Prompt not found' })
      }

      const file = await request.file()
      if (!file) {
        return reply.code(400).send({ error: 'No file uploaded' })
      }

      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return reply.code(400).send({ error: 'Invalid image type' })
      }

      const buffer = await file.toBuffer()
      if (buffer.length > MAX_IMAGE_SIZE) {
        return reply.code(400).send({ error: 'Image too large (max 10MB)' })
      }

      const imageData = Uint8Array.from(buffer)

      const image = await prisma.image.create({
        data: {
          promptId,
          filename: file.filename || 'image',
          mimeType: file.mimetype,
          data: imageData,
          size: buffer.length
        }
      })

      return { id: image.id, url: `/api/images/${image.id}` }
    }
  )

  // Serve image (public via ID, no auth needed for rendering in editor)
  app.get<{ Params: { id: string } }>('/images/:id', async (request, reply) => {
    const image = await prisma.image.findUnique({
      where: { id: request.params.id }
    })

    if (!image) {
      return reply.code(404).send({ error: 'Image not found' })
    }

    return reply
      .header('Content-Type', image.mimeType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(image.data)
  })
}
