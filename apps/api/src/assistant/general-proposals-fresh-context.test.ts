import { expect, spyOn, test } from "bun:test"
import * as privacy from "@ewatrade/db/account-privacy-access"
import type {
  WhatsAppConversationPrincipal,
  WhatsAppInboxLease,
} from "@ewatrade/db/assistant-whatsapp"
import * as legal from "@ewatrade/db/legal-session-access"
import type { Prisma, PrismaClient } from "@ewatrade/db/types"
import * as age from "../../../../packages/db/src/queries/store-conversation-age-authority"
import * as tenants from "../../../../packages/db/src/queries/tenants"
import {
  createLinkedAssistantContext,
  isLinkedAssistantIdentity,
} from "./channel-principal"
import type { GeneralContext } from "./general-context"
import { inFreshGeneralTransaction } from "./general-proposals"

test("fresh linked context reads canonical scope once, rejects revocation and preserves browser admission", async () => {
  const environment = {
    APP_ENV: "local",
    NODE_ENV: "test",
    ASSISTANT_WHATSAPP_ENABLED: "true",
    ASSISTANT_WHATSAPP_READS_ENABLED: "true",
    ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
    ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "2348000000000",
    ASSISTANT_WHATSAPP_PILOT_USER_IDS: "user",
    ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: "tenant",
    ASSISTANT_WHATSAPP_ROLLOUT_MODE: "pilot",
    WHATSAPP_OTP_PHONE_NUMBER_ID: "90000000000010",
    WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-no-provider",
    ASSISTANT_APPROVAL_SIGNING_KEY: "synthetic-fresh-context-key-000000000000",
  }
  const previous = new Map(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, environment)
  type TenantContext = NonNullable<
    Awaited<ReturnType<typeof tenants.getActiveTenantForUser>>
  >
  let role = "OWNER"
  let revoked = false
  let ageEligible = true
  let privacyBlocked = false
  let legalBlocked = false
  let scopeReads = 0
  let ageReads = 0
  let privacyReads = 0
  let legalReads = 0
  let grantReads = 0
  const locks: string[] = []
  const current = () =>
    ({
      tenant: {
        id: "tenant",
        slug: "shop",
        type: "MERCHANT",
        currencyCode: "NGN",
        dataClassification: "QA",
        qaPurgeStartedAt: null,
      },
      membership: { id: "member", role },
      activeStore: { id: "store", status: "ACTIVE", currencyCode: "NGN" },
      stores: [{ id: "store", status: "ACTIVE" }],
      staffAccess: {
        status: "ACTIVE",
        mode: "LEGACY",
        businessRole: role,
        assignments: [],
      },
    }) as unknown as TenantContext
  const scopeSpy = spyOn(tenants, "getActiveTenantForUser").mockImplementation(
    async () => {
      scopeReads++
      return current()
    },
  )
  const ageSpy = spyOn(age, "getCustomerAccountAgeStatus").mockImplementation(
    async () => {
      ageReads++
      return {
        ageBand: "ADULT",
        eligible: ageEligible,
        freeFormChatEligible: ageEligible,
      }
    },
  )
  const privacySpy = spyOn(
    privacy,
    "isAccountPrivacyAccessBlocked",
  ).mockImplementation(async () => {
    privacyReads++
    return privacyBlocked
  })
  const legalSpy = spyOn(
    legal,
    "isLegalSignupSessionBlocked",
  ).mockImplementation(async () => {
    legalReads++
    return legalBlocked
  })
  const tx = {
    $queryRaw: async (text: TemplateStringsArray) => {
      const table =
        /"(AssistantWhatsAppIdentity|AssistantWhatsAppGrant|AssistantWhatsAppInbox|Membership|Store)"/.exec(
          text.join(""),
        )?.[1]
      if (!table) throw Error("Unexpected lock")
      expect(text.join("")).toContain("FOR SHARE")
      locks.push(table)
      return []
    },
    assistantWhatsAppGrant: {
      findFirst: async () => {
        grantReads++
        return revoked
          ? null
          : {
              id: "grant",
              tenantId: "tenant",
              storeId: "store",
              membershipId: "member",
              identity: { id: "identity", userId: "user", generation: 1 },
            }
      },
    },
    assistantWhatsAppBinding: {
      findFirst: async () => ({
        id: "binding",
        purpose: "GENERAL",
        conversation: { id: "chat", purpose: "GENERAL" },
      }),
    },
    assistantWhatsAppInbox: {
      findFirst: async () => ({
        id: "inbox",
        kind: "ACTION",
        bindingId: "binding",
        identityId: null,
        executionAuthorityDigest: null,
      }),
    },
    tenant: { findUnique: async () => ({ slug: "shop" }) },
    user: { findUnique: async () => ({ id: "user" }) },
    session: { findFirst: async () => ({ id: "session" }) },
  }
  const db = {
    ...tx,
    $transaction: async <T>(
      run: (db: Prisma.TransactionClient) => Promise<T>,
      options: unknown,
    ) => {
      expect(options).toMatchObject({
        isolationLevel: "Serializable",
        timeout: 30000,
      })
      return run(tx as unknown as Prisma.TransactionClient)
    },
  } as unknown as PrismaClient
  const principal: WhatsAppConversationPrincipal = {
    kind: "linked_whatsapp",
    phoneNumberId: "90000000000010",
    senderId: "23900000000",
    bindingId: "binding",
    grantId: "grant",
    identityGeneration: 1,
    grantGeneration: 1,
    selectionGeneration: 1,
  }
  const lease: WhatsAppInboxLease = {
    inboxId: "inbox",
    bindingId: "binding",
    owner: "lease",
    generation: 1,
  }
  const reset = () => {
    scopeReads = ageReads = privacyReads = legalReads = grantReads = 0
    locks.length = 0
  }
  try {
    // Real constructor and private symbol; no forged or copied linked principal.
    const ctx = await createLinkedAssistantContext(
      db,
      principal,
      "request",
      lease,
    )
    expect(isLinkedAssistantIdentity(ctx.session)).toBe(true)
    role = "CASHIER" // The outer Owner context must never be reused.
    reset()
    expect(
      await inFreshGeneralTransaction(ctx, async (fresh) => {
        expect(Object.is(fresh.db, tx)).toBe(true)
        return fresh.tenantContext.membership.role
      }),
    ).toBe("CASHIER")
    expect(scopeReads).toBe(1)
    expect([ageReads, privacyReads, legalReads, grantReads]).toEqual([
      1, 1, 1, 1,
    ])
    expect(locks).toEqual([
      "AssistantWhatsAppIdentity",
      "AssistantWhatsAppGrant",
      "AssistantWhatsAppInbox",
      "Membership",
      "Store",
    ])

    revoked = true
    reset()
    let effects = 0
    await expect(
      inFreshGeneralTransaction(ctx, async () => {
        effects++
        return true
      }),
    ).rejects.toThrow()
    expect(effects).toBe(0)
    expect(grantReads).toBe(1)
    expect(scopeReads).toBe(0)
    revoked = false

    const browser = {
      ...ctx,
      session: { user: { id: "user" }, session: { id: "session" } },
      requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    } as unknown as GeneralContext
    reset()
    await inFreshGeneralTransaction(browser, async () => true)
    expect([
      scopeReads,
      ageReads,
      privacyReads,
      legalReads,
      grantReads,
    ]).toEqual([1, 1, 1, 1, 0])
    expect(locks).toEqual(["Membership", "Store"])
    for (const refusal of ["age", "privacy", "legal"] as const) {
      ageEligible = refusal !== "age"
      privacyBlocked = refusal === "privacy"
      legalBlocked = refusal === "legal"
      await expect(
        inFreshGeneralTransaction(browser, async () => {
          effects++
          return true
        }),
      ).rejects.toThrow()
    }
    expect(effects).toBe(0)
  } finally {
    scopeSpy.mockRestore()
    ageSpy.mockRestore()
    privacySpy.mockRestore()
    legalSpy.mockRestore()
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
})
