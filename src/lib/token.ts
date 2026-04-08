import crypto from 'node:crypto'

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex')
}
