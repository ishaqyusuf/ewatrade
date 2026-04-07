import { prisma } from "@ewatrade/db"
import { cookies } from "next/headers"

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

export async function getServerSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("ewt-session")?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { token },
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

export function getUserInitials(
  user: Pick<SessionUser, "firstName" | "lastName" | "displayName" | "email">,
): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
  }
  if (user.displayName) {
    const parts = user.displayName.trim().split(" ")
    const first = parts[0] ?? ""
    const last = parts.length >= 2 ? (parts[parts.length - 1] ?? "") : ""
    if (parts.length >= 2 && first && last)
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    return first.slice(0, 2).toUpperCase()
  }
  return user.email.slice(0, 2).toUpperCase()
}
