import { afterEach, beforeEach, expect, test } from "bun:test"
import type { TRPCContext } from "../init"
import { assistantChannelsRouter } from "./assistant-channels"

const keys = [
  "ASSISTANT_WHATSAPP_ENABLED",
  "ASSISTANT_WHATSAPP_PILOT_USER_IDS",
  "ASSISTANT_WHATSAPP_PILOT_TENANT_IDS",
  "ASSISTANT_WHATSAPP_DISPLAY_NUMBER",
  "WHATSAPP_OTP_PHONE_NUMBER_ID",
  "WHATSAPP_OTP_ACCESS_TOKEN",
] as const
let previous: Record<string, string | undefined>
beforeEach(() => {
  previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  Object.assign(process.env, {
    ASSISTANT_WHATSAPP_ENABLED: "true",
    ASSISTANT_WHATSAPP_PILOT_USER_IDS: "picker-user",
    ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: "picker-tenant",
    ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "2348000000000",
    WHATSAPP_OTP_PHONE_NUMBER_ID: "90000000000001",
    WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-never-sent",
  })
})
afterEach(() => {
  for (const key of keys) {
    if (previous[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = previous[key]
  }
})

function fixture() {
  const reads: Array<{ table: string; input: unknown }> = []
  const ctx = {
    db: {
      session: {
        findFirst: async (input: unknown) => {
          reads.push({ table: "session", input })
          return { id: "real-picker-session" }
        },
      },
      assistantWhatsAppIdentity: {
        findFirst: async (input: unknown) => {
          reads.push({ table: "identity", input })
          return { id: "owned-identity", generation: 1, selectionGeneration: 2 }
        },
      },
      assistantWhatsAppGrant: {
        findMany: async (input: unknown) => {
          reads.push({ table: "grant", input })
          return []
        },
      },
    },
    session: {
      user: { id: "picker-user", email: "synthetic@example.test" },
      session: { id: "real-picker-session" },
    },
    requestHeaders: new Headers(),
    tenantContext: null,
    tenantId: null,
    tenantSlug: null,
    qaSessionScope: null,
  } as unknown as TRPCContext
  return { ctx, reads, caller: assistantChannelsRouter.createCaller(ctx) }
}

test("scoped availability and every link stage require enrollment of the actual selected Tenant", async () => {
  const { ctx, reads } = fixture()
  const caller = assistantChannelsRouter.createCaller({
    ...ctx,
    tenantContext: {
      tenant: {
        id: "picker-tenant",
        qaPurgeStartedAt: null,
        dataClassification: "QA",
      },
      membership: { id: "picker-membership", role: "OWNER" },
      activeStore: { id: "picker-store" },
    },
  } as unknown as TRPCContext)
  expect(await caller.availability()).toEqual({ enabled: true })
  for (const enrollment of ["", "another-tenant", "picker-user"]) {
    process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = enrollment
    expect(await caller.availability()).toEqual({ enabled: false })
    await expect(caller.createWhatsAppLink({})).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(
      caller.whatsAppLink({ linkId: "owned-pending-link" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      caller.confirmWhatsAppLink({
        linkId: "owned-pending-link",
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  }
  expect(reads).toHaveLength(0)
  process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = "picker-tenant"
  process.env.ASSISTANT_WHATSAPP_PILOT_USER_IDS = "another-user"
  expect(await caller.availability()).toEqual({ enabled: false })
  expect(reads).toHaveLength(0)
})

test("personal picker uses the real browser actor without a currently selected Tenant", async () => {
  const { caller, reads } = fixture()
  expect(
    await caller.whatsAppBusinesses({ identityId: "owned-identity" }),
  ).toEqual({
    identityId: "owned-identity",
    identityGeneration: 1,
    selectionGeneration: 2,
    choices: [],
    nextCursor: undefined,
  })
  expect(reads[0]).toMatchObject({
    table: "session",
    input: { where: { id: "real-picker-session", userId: "picker-user" } },
  })
  expect(reads[1]).toMatchObject({
    table: "identity",
    input: {
      where: {
        userId: "picker-user",
        phoneNumberId: "90000000000001",
        revokedAt: null,
      },
    },
  })
  expect(reads[2]).toMatchObject({
    table: "grant",
    input: { where: { identityId: "owned-identity" }, take: 11 },
  })
})

test("personal picker refuses missing, forged linked and pinned-QA identities before repository access", async () => {
  const { ctx, reads } = fixture()
  for (const session of [
    null,
    { user: { id: "picker-user" }, session: null },
  ]) {
    const caller = assistantChannelsRouter.createCaller({
      ...ctx,
      session,
    } as TRPCContext)
    await expect(
      caller.whatsAppBusinesses({ identityId: "owned-identity" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  }
  const pinned = assistantChannelsRouter.createCaller({
    ...ctx,
    qaSessionScope: { tenantId: "pinned", storeId: "pinned" },
  } as TRPCContext)
  await expect(
    pinned.whatsAppBusinesses({ identityId: "owned-identity" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(reads).toHaveLength(0)
})

test("personal picker preserves current enable and pilot gates and rejects actor fields", async () => {
  const { caller, reads } = fixture()
  process.env.ASSISTANT_WHATSAPP_ENABLED = "false"
  await expect(
    caller.whatsAppBusinesses({ identityId: "owned-identity" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  process.env.ASSISTANT_WHATSAPP_ENABLED = "true"
  process.env.ASSISTANT_WHATSAPP_PILOT_USER_IDS = "another-user"
  await expect(
    caller.whatsAppBusinesses({ identityId: "owned-identity" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  process.env.ASSISTANT_WHATSAPP_PILOT_USER_IDS = "picker-user"
  const forged = { identityId: "owned-identity", userId: "another-user" }
  await expect(caller.whatsAppBusinesses(forged)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  })
  expect(reads).toHaveLength(0)
})

test("connection discovery remains personal when rollout, pilot and endpoint configuration are removed", async () => {
  const { caller, reads } = fixture()
  process.env.ASSISTANT_WHATSAPP_ENABLED = "false"
  for (const key of keys.filter((key) => key !== "ASSISTANT_WHATSAPP_ENABLED"))
    Reflect.deleteProperty(process.env, key)
  expect(await caller.whatsAppConnections()).toEqual([])
  expect(reads[0]).toMatchObject({
    table: "session",
    input: {
      where: {
        id: "real-picker-session",
        userId: "picker-user",
        qaAuthorizationId: null,
        NOT: { token: { startsWith: "qas_" } },
      },
    },
  })
  expect(reads[1]).toMatchObject({
    table: "grant",
    input: {
      where: {
        identity: { userId: "picker-user" },
      },
      take: 20,
    },
  })
  await caller.whatsAppConnections({ cursor: "older-owned-page" })
  expect(reads[3]).toMatchObject({
    table: "grant",
    input: {
      where: {
        id: { lt: "older-owned-page" },
        identity: { userId: "picker-user" },
      },
      orderBy: { id: "desc" },
    },
  })
})

test("personal lifecycle endpoints reject forged/linked and pinned QA sessions before repository access", async () => {
  const { ctx, reads } = fixture()
  for (const session of [
    null,
    { user: { id: "picker-user" }, session: null },
  ]) {
    const caller = assistantChannelsRouter.createCaller({
      ...ctx,
      session,
    } as TRPCContext)
    await expect(caller.whatsAppConnections()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
    await expect(
      caller.revokeWhatsApp({ grantId: "owned-grant" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  }
  const pinned = assistantChannelsRouter.createCaller({
    ...ctx,
    qaSessionScope: { tenantId: "pinned", storeId: "pinned" },
  } as TRPCContext)
  await expect(pinned.whatsAppConnections()).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  await expect(
    pinned.revokeWhatsApp({ grantId: "owned-grant" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(reads).toHaveLength(0)
})

test("revoke works without business context/config and derives ownership from the real session", async () => {
  const { ctx } = fixture()
  for (const key of keys) Reflect.deleteProperty(process.env, key)
  const reads: unknown[] = []
  const writes: unknown[] = []
  const identity = {
    id: "owned-identity",
    userId: "picker-user",
    phoneNumberId: "old-endpoint",
    activeBindingId: null,
  }
  const grant = {
    id: "owned-grant",
    tenantId: "former-business",
    identityId: identity.id,
    revokedAt: null,
    identity,
  }
  const tx = {
    $queryRaw: async () => [],
    session: { findFirst: async () => ({ id: "real-picker-session" }) },
    assistantWhatsAppGrant: {
      findFirst: async (input: unknown) => {
        reads.push(input)
        return grant
      },
      update: async (input: unknown) => {
        writes.push(input)
        return grant
      },
    },
    assistantWhatsAppIdentity: { update: async () => identity },
    assistantWhatsAppInbox: { findMany: async () => [] },
    assistantWhatsAppBinding: { findMany: async () => [] },
    assistantWhatsAppOutbox: { findMany: async () => [] },
    assistantWhatsAppLink: { updateMany: async () => ({ count: 0 }) },
  }
  const caller = assistantChannelsRouter.createCaller({
    ...ctx,
    db: {
      $transaction: async (
        operation: (client: typeof tx) => Promise<unknown>,
      ) => operation(tx),
    },
  } as unknown as TRPCContext)
  expect(await caller.revokeWhatsApp({ grantId: "owned-grant" })).toEqual({
    revoked: true,
  })
  expect(reads).toEqual([
    {
      where: { id: "owned-grant", identity: { userId: "picker-user" } },
      include: { identity: true },
    },
  ])
  expect(writes).toHaveLength(1)
  await expect(
    caller.revokeWhatsApp({ grantId: "owned-grant", userId: "forged" } as {
      grantId: string
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
})
