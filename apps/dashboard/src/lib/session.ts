import { auth } from "@ewatrade/auth"
import { headers } from "next/headers"

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
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) return null

  const user = session.user as typeof session.user & {
    firstName?: string | null
    lastName?: string | null
    displayName?: string | null
    avatarUrl?: string | null
    isPlatformAdmin?: boolean | null
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      displayName: user.displayName ?? user.name ?? null,
      avatarUrl: user.avatarUrl ?? user.image ?? null,
      isPlatformAdmin: user.isPlatformAdmin ?? false,
    },
    sessionId: session.session.id,
    expiresAt: session.session.expiresAt,
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
