import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

export async function promptRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate)

  // List all prompts (metadata only)
  app.get('/prompts', async (request) => {
    const prompts = await prisma.prompt.findMany({
      where: { ownerId: request.user.sub },
      select: {
        id: true,
        title: true,
        tags: true,
        folderId: true,
        folder: { select: { path: true } },
        isFavorite: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' }
    })

    return prompts.map((p) => ({
      id: p.id,
      title: p.title,
      tags: p.tags,
      folder: p.folder?.path ?? '/',
      isFavorite: p.isFavorite,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    }))
  })

  // Get full prompt
  app.get<{ Params: { id: string } }>('/prompts/:id', async (request, reply) => {
    const prompt = await prisma.prompt.findFirst({
      where: { id: request.params.id, ownerId: request.user.sub },
      include: { folder: { select: { path: true } } }
    })

    if (!prompt) {
      return reply.code(404).send({ error: 'Prompt not found' })
    }

    return {
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      tags: prompt.tags,
      folder: prompt.folder?.path ?? '/',
      isFavorite: prompt.isFavorite,
      createdAt: prompt.createdAt.toISOString(),
      updatedAt: prompt.updatedAt.toISOString()
    }
  })

  // Create prompt
  app.post<{
    Body: { title?: string; content?: string; tags?: string[]; folder?: string; isFavorite?: boolean }
  }>('/prompts', async (request) => {
    const { title, content, tags, folder, isFavorite } = request.body
    const userId = request.user.sub

    let folderId: string | null = null
    if (folder && folder !== '/') {
      const f = await prisma.folder.findUnique({
        where: { ownerId_path: { ownerId: userId, path: folder } }
      })
      folderId = f?.id ?? null
    }

    const prompt = await prisma.prompt.create({
      data: {
        title: title ?? 'Sans titre',
        content: content ?? '',
        tags: tags ?? [],
        folderId,
        isFavorite: isFavorite ?? false,
        ownerId: userId
      },
      include: { folder: { select: { path: true } } }
    })

    return {
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      tags: prompt.tags,
      folder: prompt.folder?.path ?? '/',
      isFavorite: prompt.isFavorite,
      createdAt: prompt.createdAt.toISOString(),
      updatedAt: prompt.updatedAt.toISOString()
    }
  })

  // Update prompt metadata
  app.patch<{
    Params: { id: string }
    Body: { title?: string; content?: string; tags?: string[]; folder?: string; isFavorite?: boolean }
  }>('/prompts/:id', async (request, reply) => {
    const existing = await prisma.prompt.findFirst({
      where: { id: request.params.id, ownerId: request.user.sub }
    })

    if (!existing) {
      return reply.code(404).send({ error: 'Prompt not found' })
    }

    const { title, content, tags, folder, isFavorite } = request.body
    const userId = request.user.sub

    let folderId: string | null | undefined = undefined
    if (folder !== undefined) {
      if (folder === '/') {
        folderId = null
      } else {
        const f = await prisma.folder.findUnique({
          where: { ownerId_path: { ownerId: userId, path: folder } }
        })
        folderId = f?.id ?? null
      }
    }

    const prompt = await prisma.prompt.update({
      where: { id: request.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(tags !== undefined && { tags }),
        ...(folderId !== undefined && { folderId }),
        ...(isFavorite !== undefined && { isFavorite })
      },
      include: { folder: { select: { path: true } } }
    })

    return {
      id: prompt.id,
      title: prompt.title,
      content: prompt.content,
      tags: prompt.tags,
      folder: prompt.folder?.path ?? '/',
      isFavorite: prompt.isFavorite,
      createdAt: prompt.createdAt.toISOString(),
      updatedAt: prompt.updatedAt.toISOString()
    }
  })

  // Delete prompt
  app.delete<{ Params: { id: string } }>('/prompts/:id', async (request, reply) => {
    const existing = await prisma.prompt.findFirst({
      where: { id: request.params.id, ownerId: request.user.sub }
    })

    if (!existing) {
      return reply.code(404).send({ error: 'Prompt not found' })
    }

    await prisma.prompt.delete({ where: { id: request.params.id } })
    return reply.code(204).send()
  })

  // Search prompts
  app.get<{ Querystring: { q: string } }>('/prompts/search', async (request) => {
    const { q } = request.query
    const userId = request.user.sub

    const prompts = await prisma.prompt.findMany({
      where: {
        ownerId: userId,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { content: { contains: q, mode: 'insensitive' } },
          { tags: { has: q } }
        ]
      },
      select: {
        id: true,
        title: true,
        content: true,
        tags: true,
        folder: { select: { path: true } }
      },
      take: 50
    })

    return prompts.map((p) => {
      const idx = p.content.toLowerCase().indexOf(q.toLowerCase())
      const start = Math.max(0, idx - 40)
      const end = Math.min(p.content.length, idx + q.length + 40)
      const snippet = idx >= 0 ? '...' + p.content.slice(start, end) + '...' : p.content.slice(0, 80)

      return {
        id: p.id,
        title: p.title,
        folder: p.folder?.path ?? '/',
        tags: p.tags,
        snippet
      }
    })
  })

  // Get all tags
  app.get('/prompts/tags', async (request) => {
    const prompts = await prisma.prompt.findMany({
      where: { ownerId: request.user.sub },
      select: { tags: true }
    })

    const tagSet = new Set<string>()
    for (const p of prompts) {
      for (const tag of p.tags) {
        tagSet.add(tag)
      }
    }

    return Array.from(tagSet).sort()
  })
}
