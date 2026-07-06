import type { DbClient } from "./types"

export type SessionUser = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  displayName: string | null
  avatarUrl: string | null
  isPlatformAdmin: boolean
}

export type AuthSession = {
  user: SessionUser
  sessionId: string
  expiresAt: Date
}

export async function getSessionByToken(
  db: DbClient,
  input: { token: string | null | undefined },
): Promise<AuthSession | null> {
  if (!input.token) return null

  const session = await db.session.findUnique({
    where: { token: input.token },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatarUrl: true,
          isPlatformAdmin: true,
        },
      },
    },
  })

  if (!session || session.expiresAt < new Date()) return null

  return {
    user: session.user,
    sessionId: session.id,
    expiresAt: session.expiresAt,
  }
}
