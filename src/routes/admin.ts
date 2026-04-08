import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticate(request, reply)
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { role: true }
  })
  if (user?.role !== 'admin') {
    reply.code(403).send({ error: 'Admin access required' })
  }
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  // List all users
  app.get('/admin/users', async () => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    })
    return users
  })

  // Activate a user
  app.post<{ Params: { id: string } }>('/admin/users/:id/activate', async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.params.id } })
    if (!user) return reply.code(404).send({ error: 'User not found' })

    const updated = await prisma.user.update({
      where: { id: request.params.id },
      data: { isActive: true },
      select: { id: true, email: true, displayName: true, role: true, isActive: true }
    })
    return updated
  })

  // Deactivate a user
  app.post<{ Params: { id: string } }>('/admin/users/:id/deactivate', async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.params.id } })
    if (!user) return reply.code(404).send({ error: 'User not found' })

    // Cannot deactivate yourself
    if (user.id === request.user.sub) {
      return reply.code(400).send({ error: 'Cannot deactivate yourself' })
    }

    // Deactivate user and delete all their sessions
    await prisma.session.deleteMany({ where: { userId: user.id } })
    const updated = await prisma.user.update({
      where: { id: request.params.id },
      data: { isActive: false },
      select: { id: true, email: true, displayName: true, role: true, isActive: true }
    })
    return updated
  })

  // Change user role
  app.post<{
    Params: { id: string }
    Body: { role: string }
  }>('/admin/users/:id/role', async (request, reply) => {
    const { role } = request.body
    if (role !== 'admin' && role !== 'user') {
      return reply.code(400).send({ error: 'Invalid role' })
    }

    const user = await prisma.user.findUnique({ where: { id: request.params.id } })
    if (!user) return reply.code(404).send({ error: 'User not found' })

    if (user.id === request.user.sub && role !== 'admin') {
      return reply.code(400).send({ error: 'Cannot remove your own admin role' })
    }

    const updated = await prisma.user.update({
      where: { id: request.params.id },
      data: { role },
      select: { id: true, email: true, displayName: true, role: true, isActive: true }
    })
    return updated
  })
}
