import { describe, expect, test } from "bun:test"

import { createCallerFactory } from "../../init"
import { serviceCommerceCustomerConversationsRouter } from "./customer-conversations"

const createCaller = createCallerFactory(
  serviceCommerceCustomerConversationsRouter,
)
const publicToken = "public-token-123456789012345678901234"
const transferToken = "transfer-token-1234567890123456789012"
const bridgeToken = "b".repeat(43)

function caller(input?: {
  credential?: string
  db?: unknown
  installation?: string
  qaSessionScope?: { membershipId: string; storeId: string; tenantId: string }
  session?: unknown
}) {
  return createCaller({
    customerConversationCredential: input?.credential ?? null,
    customerConversationInstallation: input?.installation ?? null,
    db: input?.db ?? {},
    qaSessionScope: input?.qaSessionScope ?? null,
    session: input?.session ?? null,
  } as never)
}

describe("mobile customer conversation transport", () => {
  test.each(["ADULT", "UNDECLARED"] as const)(
    "QA startup can read the selected Account's %s age band",
    async (ageBand) => {
      const reads: unknown[] = []
      const client = caller({
        qaSessionScope: {
          membershipId: "qa-membership",
          storeId: "qa-store",
          tenantId: "qa-tenant",
        },
        session: { user: { id: "qa-admin" } },
        db: {
          user: {
            findUnique: async (input: unknown) => {
              reads.push(input)
              return { ageBand }
            },
          },
        },
      })

      await expect(client.accountAgeStatus()).resolves.toEqual({
        ageBand,
        eligible: ageBand === "ADULT",
        freeFormChatEligible: ageBand === "ADULT",
      })
      expect(reads).toEqual([
        { select: { ageBand: true }, where: { id: "qa-admin" } },
      ])
    },
  )

  test("undeclared QA Account can save its own age range and continue startup", async () => {
    let ageBand = "UNDECLARED"
    const client = caller({
      qaSessionScope: {
        membershipId: "qa-membership",
        storeId: "qa-store",
        tenantId: "qa-tenant",
      },
      session: { user: { id: "qa-admin" } },
      db: {
        user: {
          findUnique: async () => ({ ageBand }),
          updateMany: async (input: {
            data: { ageBand: string }
            where: { id: string; ageBand: string }
          }) => {
            expect(input.where).toEqual({
              id: "qa-admin",
              ageBand: "UNDECLARED",
            })
            ageBand = input.data.ageBand
            return { count: 1 }
          },
        },
      },
    })

    await expect(client.accountAgeStatus()).resolves.toEqual({
      ageBand: "UNDECLARED",
      eligible: false,
      freeFormChatEligible: false,
    })
    await expect(
      client.accountDeclareAgeBand({ ageBand: "ADULT" }),
    ).resolves.toMatchObject({ ageBand: "ADULT" })
    await expect(client.accountAgeStatus()).resolves.toEqual({
      ageBand: "ADULT",
      eligible: true,
      freeFormChatEligible: true,
    })
  })

  test("legacy undeclared Account cannot link Guest conversations before age entry", async () => {
    let ageReads = 0
    const input = {
      clientOperationId: "account-link-operation-1",
      confirmed: true as const,
      conversationIds: ["conversation_1"],
    }
    await expect(
      caller({
        db: {
          user: {
            findUnique: async () => {
              ageReads += 1
              return { ageBand: "UNDECLARED" }
            },
          },
        },
        session: { user: { id: "legacy_account_1" } },
      }).linkMobileStoreConversationsToAccount(input),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    expect(ageReads).toBe(1)
    await expect(
      caller({
        db: { user: { findUnique: async () => ({ ageBand: "AGE_13_TO_15" }) } },
        session: { user: { id: "teen_account_1" } },
      }).linkMobileStoreConversationsToAccount(input),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("requires eligible age before a new mobile Guest bootstrap", async () => {
    const newInstallation = caller({ installation: "i".repeat(32) })
    await expect(
      newInstallation.mobileBootstrapStoreConversation({ publicToken }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    await expect(
      newInstallation.mobileBootstrapStoreConversation({
        ageBand: "UNDER_13" as never,
        publicToken,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  test("age status is scoped to the Account or bound Guest credential", async () => {
    await expect(caller().accountAgeStatus()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
    await expect(
      caller({
        session: { user: { id: "teen" } },
        db: {
          user: { findUnique: async () => ({ ageBand: "AGE_13_TO_15" }) },
        },
      }).accountAgeStatus(),
    ).resolves.toMatchObject({ ageBand: "AGE_13_TO_15", eligible: true })
    await expect(caller().mobileGuestAgeStatus()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })

  test("age declaration stays on the authenticated Account or bound Guest", async () => {
    await expect(
      caller().accountDeclareAgeBand({ ageBand: "ADULT" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      caller({ credential: "c".repeat(32) }).mobileGuestDeclareAgeBand({
        ageBand: "ADULT",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    await expect(
      caller({ session: { user: { id: "customer" } } }).accountDeclareAgeBand({
        ageBand: "UNDECLARED" as never,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const db = {
      user: { updateMany: async () => ({ count: 1 }) },
    }
    await expect(
      caller({
        db,
        session: { user: { id: "customer" } },
      }).accountDeclareAgeBand({
        ageBand: "ADULT",
      }),
    ).resolves.toMatchObject({ ageBand: "ADULT" })
  })

  test("report and block require the Guest device capability or linked Customer session", async () => {
    const base = {
      clientOperationId: "safety-operation-0001",
      conversationId: "conversation_1",
      publicToken,
    }
    await expect(
      caller().mobileReportStoreConversation({ ...base, reason: "harassment" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      caller({ credential: "c".repeat(32) }).mobileBlockStoreConversation(base),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    await expect(
      caller().accountBlockStoreConversation(base),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(caller().safetyReports({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
    await expect(
      caller({
        db: { user: { findUnique: async () => ({ ageBand: "ADULT" }) } },
        session: { user: { id: "platform_1" } },
      }).safetyReports({
        cursor: { createdAt: "not-a-date", id: "report_1" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
  test("keeps WhatsApp bridge issuance behind the exact Customer principal", async () => {
    const input = {
      bridgeToken,
      clientOperationId: "bridge-operation-0001",
      conversationId: "conversation_1",
      publicToken,
    }

    await expect(
      caller().mobileIssueStoreConversationWhatsAppBridge(input),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(
      caller({
        credential: "c".repeat(32),
      }).mobileIssueStoreConversationWhatsAppBridge(input),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    await expect(
      caller().accountIssueStoreConversationWhatsAppBridge(input),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("uses an authenticated Customer Account without requiring a Tenant membership", async () => {
    const db = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(db),
      storeConversationAccountAccess: { findMany: async () => [] },
      user: {
        findUnique: async () => ({
          ageBand: "ADULT",
          id: "customer_account_1",
        }),
      },
    }

    await expect(
      caller({
        db,
        session: { user: { id: "customer_account_1" } },
      }).accountStoreConversations({}),
    ).resolves.toEqual({ items: [], nextCursor: null })
  })

  test("legacy undeclared Account cannot read conversation list", async () => {
    let contentReads = 0
    const db = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(db),
      storeConversationAccountAccess: {
        findMany: async () => {
          contentReads += 1
          return []
        },
      },
      user: {
        findUnique: async () => ({
          ageBand: "UNDECLARED",
          id: "legacy_account_1",
        }),
      },
    }
    await expect(
      caller({
        db,
        session: { user: { id: "legacy_account_1" } },
      }).accountStoreConversations({}),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
    expect(contentReads).toBe(0)
  })

  test("does not enumerate guest conversations from authentication alone", async () => {
    await expect(
      caller({
        db: { user: { findUnique: async () => ({ ageBand: "ADULT" }) } },
        session: { user: { id: "customer_account_1" } },
      }).mobileStoreConversationAccountCandidates({}),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("undeclared Account cannot read candidate, device, action or safety-review data", async () => {
    let ageReads = 0
    const client = caller({
      db: {
        user: {
          findUnique: async () => {
            ageReads += 1
            return { ageBand: "UNDECLARED" }
          },
        },
      },
      session: { user: { id: "legacy_account_1" } },
    })
    for (const read of [
      () => client.safetyReports({}),
      () => client.mobileStoreConversationAccountCandidates({}),
      () => client.mobileStoreConversationAccountDevices({}),
      () =>
        client.accountPreviewStoreConversationAction({
          conversationId: "conversation_1",
          messageId: "message_1",
          publicToken,
        }),
    ]) {
      await expect(read()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      })
    }
    expect(ageReads).toBe(4)
  })

  test("declared teen platform reviewer retains the safety queue", async () => {
    let reportReads = 0
    const client = caller({
      db: {
        user: {
          findUnique: async () => ({
            ageBand: "AGE_16_TO_17",
            isPlatformAdmin: true,
          }),
        },
        storeConversationCustomerReport: {
          count: async () => 0,
          findMany: async () => {
            reportReads += 1
            return []
          },
        },
      },
      session: { user: { id: "teen-reviewer" } },
    })

    expect(await client.safetyReports({})).toMatchObject({
      reports: [],
      pendingCount: 0,
    })
    expect(reportReads).toBe(1)
  })

  test("does not accept a Business session as a customer credential", async () => {
    await expect(
      caller({
        session: { user: { id: "business_user" } },
      }).mobileStoreConversations({}),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("requires the installation proof before claiming a transfer", async () => {
    await expect(
      caller().claimStoreConversationTransfer({ publicToken, transferToken }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  test("rejects malformed customer header capabilities before a DB read", async () => {
    await expect(
      caller({ credential: "short" }).mobileStoreConversationTimeline({
        conversationId: "conversation_1",
        publicToken,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("requires both Customer credential and installation for realtime progress", async () => {
    await expect(
      caller({
        credential: "c".repeat(32),
      }).mobileStoreConversationMessagesAfter({
        afterSequence: 3,
        conversationId: "conversation_1",
        publicToken,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })

    await expect(
      caller({
        installation: "i".repeat(32),
      }).acknowledgeMobileStoreConversationProgress({
        clientOperationId: "read-acknowledgement-0001",
        conversationId: "conversation_1",
        deliveredThroughSequence: 4,
        publicToken,
        readThroughSequence: 4,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })
})
