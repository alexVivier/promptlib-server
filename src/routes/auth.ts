import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { generateRefreshToken } from '../lib/token.js'
import { authenticate } from '../middleware/auth.js'

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { email: string; displayName: string; password: string }
  }>('/auth/signup', async (request, reply) => {
    const { email, displayName, password } = request.body

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return reply.code(409).send({ error: 'Email already in use' })
    }

    // First user becomes admin automatically
    const userCount = await prisma.user.count()
    const role = userCount === 0 ? 'admin' : 'user'

    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: { email, displayName, passwordHash, role, isActive: role === 'admin' }
    })

    if (!user.isActive) {
      return reply.code(403).send({ error: 'Account pending activation by an administrator' })
    }

    const accessToken = app.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: '15m' }
    )

    const refreshToken = generateRefreshToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await prisma.session.create({
      data: { userId: user.id, refreshToken, expiresAt }
    })

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
      accessToken,
      refreshToken
    }
  })

  app.post<{
    Body: { email: string; password: string }
  }>('/auth/login', async (request, reply) => {
    const { email, password } = request.body

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    if (!user.isActive) {
      return reply.code(403).send({ error: 'Account inactive. Contact an administrator.' })
    }

    const accessToken = app.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: '15m' }
    )

    const refreshToken = generateRefreshToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await prisma.session.create({
      data: { userId: user.id, refreshToken, expiresAt }
    })

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
      accessToken,
      refreshToken
    }
  })

  app.post<{
    Body: { refreshToken: string }
  }>('/auth/refresh', async (request, reply) => {
    const { refreshToken } = request.body

    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true }
    })

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } })
      }
      return reply.code(401).send({ error: 'Invalid or expired refresh token' })
    }

    if (!session.user.isActive) {
      await prisma.session.delete({ where: { id: session.id } })
      return reply.code(403).send({ error: 'Account inactive' })
    }

    // Rotate refresh token
    await prisma.session.delete({ where: { id: session.id } })

    const newAccessToken = app.jwt.sign(
      { sub: session.user.id, email: session.user.email },
      { expiresIn: '15m' }
    )

    const newRefreshToken = generateRefreshToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await prisma.session.create({
      data: { userId: session.user.id, refreshToken: newRefreshToken, expiresAt }
    })

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    }
  })

  app.post<{
    Body: { refreshToken: string }
  }>('/auth/logout', async (request, reply) => {
    const { refreshToken } = request.body

    await prisma.session.deleteMany({ where: { refreshToken } })
    return reply.code(204).send()
  })

  app.get('/auth/me', { preHandler: [authenticate] }, async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, email: true, displayName: true, role: true }
    })
    return { user }
  })
}
