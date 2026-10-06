import { beforeEach, expect, mock, test } from "bun:test"

let signedIn = true
let tenantId = "business-a"
let savedValue: string | undefined
const writes: unknown[][] = []
mock.module("server-only", () => ({}))
mock.module("../lib/session", () => ({
  getServerSession: async () => (signedIn ? { user: { id: "user-a" } } : null),
}))
mock.module("../lib/tenant", () => ({
  getActiveTenant: async () => ({ tenant: { id: tenantId } }),
}))
mock.module("next/headers", () => ({
  cookies: async () => ({
    get: () => (savedValue === undefined ? undefined : { value: savedValue }),
    set: (...args: unknown[]) => {
      writes.push(args)
    },
  }),
}))

const { updateDirectoryViewAction } = await import(
  "./update-directory-view-action"
)
const { getTableSettingsScope } = await import("../utils/columns")
const scope = getTableSettingsScope("user-a", "business-a")
const input = { pageId: "staff", scope, view: "table" } as const
beforeEach(() => {
  signedIn = true
  tenantId = "business-a"
  savedValue = undefined
  writes.length = 0
})

test("saves only a scoped view cookie with the existing preference lifetime", async () => {
  expect(await updateDirectoryViewAction(input)).toEqual({ error: null })
  expect(writes).toEqual([
    [
      `directory-view-${scope}-staff`,
      "table",
      { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 },
    ],
  ])
})
test("requires authentication and refuses a stale active business", async () => {
  signedIn = false
  expect((await updateDirectoryViewAction(input)).error).toContain("Sign in")
  signedIn = true
  tenantId = "business-b"
  expect((await updateDirectoryViewAction(input)).error).toContain(
    "active business changed",
  )
  expect(writes).toHaveLength(0)
})
test("rejects another user's scope and malformed input before writing", async () => {
  expect(
    (
      await updateDirectoryViewAction({
        ...input,
        scope: getTableSettingsScope("user-b", "business-a"),
      })
    ).error,
  ).toContain("active business changed")
  expect(
    (await updateDirectoryViewAction({ ...input, scope: "invalid" })).error,
  ).toContain("Invalid")
  expect(writes).toHaveLength(0)
})

test("server reader preserves absent preference and validates saved cookies", async () => {
  const { getInitialDirectoryView } = await import("../utils/directory-views")
  const identity = { userId: "user-a", tenantId: "business-a" }
  expect(await getInitialDirectoryView("staff", identity)).toEqual({
    scope,
    view: null,
  })
  savedValue = "cards"
  expect(await getInitialDirectoryView("staff", identity)).toEqual({
    scope,
    view: "cards",
  })
  savedValue = "invalid"
  expect(await getInitialDirectoryView("staff", identity)).toEqual({
    scope,
    view: null,
  })
})
