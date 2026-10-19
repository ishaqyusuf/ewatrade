import { expect, test } from "bun:test"
import type { Session } from "@ewatrade/auth"
import { requireFreshAssistantExportSession } from "./assistant-export-session"

const now = new Date("2026-10-15T12:00:00.000Z")
const signedIn: Session = {
  user: {
    id: "own-account",
    name: "Synthetic account",
    email: "export@example.test",
    emailVerified: true,
    isPlatformAdmin: false,
    image: null,
    createdAt: now,
    updatedAt: now,
  },
  session: {
    id: "real-session",
    userId: "own-account",
    token: "synthetic-session-token",
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: new Date(now.getTime() - 60_000),
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  },
}

function harness() {
  let stored: Record<string, unknown> | null = {
    ...signedIn.session,
    qaAuthorizationId: null,
    qaTenantId: null,
    qaMembershipId: null,
    qaStoreId: null,
  }
  let privacy: string | null = null
  let sessionReads = 0
  const ctx = {
    session: signedIn,
    qaSessionScope: null,
    isInternalRequest: false,
    db: {
      session: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          sessionReads += 1
          if (!stored) return null
          for (const [key, value] of Object.entries(where)) {
            if (key === "expiresAt") {
              if (
                new Date(String(stored.expiresAt)).getTime() <=
                (value as { gt: Date }).gt.getTime()
              )
                return null
            } else if (stored[key] !== value) return null
          }
          return { userId: stored.userId, createdAt: stored.createdAt }
        },
      },
      accountPrivacyRequest: {
        findUnique: async ({ where }: { where: { requestKey: string } }) => {
          expect(where.requestKey).toBe("account-deletion:own-account")
          return privacy ? { status: privacy } : null
        },
      },
    },
  } as unknown as Parameters<typeof requireFreshAssistantExportSession>[0]
  return {
    ctx,
    setSession(value: Record<string, unknown> | null) {
      stored = value
    },
    original: stored,
    setPrivacy(value: string) {
      privacy = value
    },
    reads: () => sessionReads,
  }
}

test("export rechecks the real persisted account session and refuses expiry, replacement and synthetic scopes", async () => {
  const fixture = harness()
  expect(await requireFreshAssistantExportSession(fixture.ctx, now)).toBe(
    "own-account",
  )
  for (const patch of [
    { token: "replaced-token" },
    { userId: "another-account" },
    { expiresAt: now },
    { createdAt: new Date(now.getTime() - 15 * 60_000 - 1) },
    { createdAt: new Date(now.getTime() + 1) },
    { qaStoreId: "qa-store" },
  ]) {
    fixture.setSession({ ...fixture.original, ...patch })
    await expect(
      requireFreshAssistantExportSession(fixture.ctx, now),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  }
  fixture.setSession(null)
  await expect(
    requireFreshAssistantExportSession(fixture.ctx, now),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  fixture.ctx.session = null
  const before = fixture.reads()
  await expect(
    requireFreshAssistantExportSession(fixture.ctx, now),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  expect(fixture.reads()).toBe(before)
  fixture.ctx.session = signedIn
  fixture.ctx.isInternalRequest = true
  await expect(
    requireFreshAssistantExportSession(fixture.ctx, now),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(fixture.reads()).toBe(before)
})

test("account deletion blocks repeated export checks independently of channel or processing feature flags", async () => {
  const fixture = harness()
  expect(await requireFreshAssistantExportSession(fixture.ctx, now)).toBe(
    "own-account",
  )
  for (const status of ["PROCESSING", "COMPLETED"]) {
    fixture.setPrivacy(status)
    await expect(
      requireFreshAssistantExportSession(fixture.ctx, now),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
})
