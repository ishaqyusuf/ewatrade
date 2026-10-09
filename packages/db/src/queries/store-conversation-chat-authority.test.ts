import { expect, test } from "bun:test"
import {
  assertAccountStoreConversationChatAuthority,
  assertStoreConversationChatRecipient,
  rejectGuestStoreConversationFreeFormChat,
} from "./store-conversation-chat-authority"
import {
  sendAccountStoreConversationText,
  sendGuestStoreConversationText,
} from "./store-conversations-guest"
import { replyToStoreConversation } from "./store-conversations-staff"

const publicToken = "public-entry-token-that-is-at-least-32-characters"
const message = {
  clientOperationId: "launch-scope-operation",
  conversationId: "conversation",
  publicToken,
  text: "Ordinary text",
}

test.each(["UNDECLARED", "AGE_13_TO_15", "AGE_16_TO_17", null])(
  "%s accounts cannot submit free-form text or staff replies",
  async (ageBand) => {
    let writes = 0
    const db = {
      user: { findUnique: async () => (ageBand ? { ageBand } : null) },
      $transaction: async () => writes++,
    }
    await expect(
      assertAccountStoreConversationChatAuthority(db as never, "account"),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    await expect(
      sendAccountStoreConversationText(db as never, {
        ...message,
        accountUserId: "account",
        channel: "web",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    await expect(
      replyToStoreConversation(db as never, {
        ...message,
        actorUserId: "staff",
        expectedAssignmentRevision: 0,
        expectedLastMessageSequence: 0,
        tenantId: "tenant",
        storeId: "store",
      }),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    expect(writes).toBe(0)
  },
)

test("guest sends are refused without moderation, credential enumeration or writes", async () => {
  expect(() => rejectGuestStoreConversationFreeFormChat()).toThrow(
    "18 or older",
  )
  await expect(
    sendGuestStoreConversationText({} as never, {
      ...message,
      credentialToken: "guest",
    }),
  ).rejects.toMatchObject({ code: "NOT_READY" })
})

test("adult account is admitted but its declaration is reread in the write transaction", async () => {
  const reads: string[] = []
  const db = {
    user: {
      findUnique: async () => {
        reads.push("root-adult")
        return { ageBand: "ADULT" }
      },
    },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        user: {
          findUnique: async () => {
            reads.push("tx-teen")
            return { ageBand: "AGE_16_TO_17" }
          },
        },
      }),
  }
  await expect(
    sendAccountStoreConversationText(db as never, {
      ...message,
      accountUserId: "account",
      channel: "web",
    }),
  ).rejects.toMatchObject({ code: "NOT_READY" })
  expect(reads).toEqual(["root-adult", "tx-teen"])
})

test("staff recipient gate binds active account access to all three scope keys", async () => {
  let access: { accountUserId: string } | null = { accountUserId: "customer" }
  let ageBand = "ADULT"
  const scope = {
    conversationId: "conversation",
    storeId: "store",
    tenantId: "tenant",
  }
  const db = {
    storeConversationAccountAccess: {
      findFirst: async (query: unknown) => {
        expect(query).toEqual({
          select: { accountUserId: true },
          where: { ...scope, status: "ACTIVE", revokedAt: null },
        })
        return access
      },
    },
    user: {
      findUnique: async (query: unknown) => {
        expect(query).toEqual({
          select: { ageBand: true },
          where: { id: "customer" },
        })
        return { ageBand }
      },
    },
  }
  await expect(
    assertStoreConversationChatRecipient(
      db as never,
      { ...scope, text: "must not enter Prisma query" } as never,
    ),
  ).resolves.toBeUndefined()
  ageBand = "AGE_13_TO_15"
  await expect(
    assertStoreConversationChatRecipient(db as never, scope),
  ).rejects.toMatchObject({ code: "NOT_READY" })
  access = null
  await expect(
    assertStoreConversationChatRecipient(db as never, scope),
  ).rejects.toMatchObject({ code: "NOT_READY" })
})

test("Guest voice upload cannot create a moderation bypass before credential reads", async () => {
  const { resolveGuestStoreConversationAttachmentUpload } = await import(
    "./store-conversation-attachments"
  )
  await expect(
    resolveGuestStoreConversationAttachmentUpload({} as never, {
      channel: "mobile",
      conversationId: "conversation",
      credentialToken: "guest",
      publicToken,
      privateMediaProviderReady: true,
      target: { kind: "new_commerce_inquiry" },
      file: {
        attachmentCount: 1,
        byteSize: 128,
        kind: "audio",
        mimeType: "audio/mp4",
        signatureMimeType: "audio/mp4",
      },
    }),
  ).rejects.toMatchObject({ code: "NOT_READY" })
})
