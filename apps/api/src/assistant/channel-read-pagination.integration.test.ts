import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import {
  type GeneralAnswer,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  generalReadContinuationContext,
  nextGeneralReadRequest,
  parseGeneralReadContinuation,
} from "@ewatrade/assistant/general/read-continuation"
import { appendAssistantMessage } from "@ewatrade/db/assistant"
import { disconnectAssistantWhatsApp } from "@ewatrade/db/assistant-whatsapp"
import {
  createFinanceBook,
  createFinanceSupplier,
  listFinanceSuppliers,
} from "@ewatrade/db/queries"
import { z } from "zod"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { generalPersistentParts } from "./general-persistence"
import { createGeneralTools } from "./general-tools"

// Root selects this guarded local QA suite; importing the file never connects.
const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-read-pagination")
const foreignTenantId = `${fixture.marker}-foreign`
const foreignSourceDomain = "assistant-read-pagination.test"
const query = "Synthetic page"
let bookId = ""
let foreignBookId = ""

beforeAll(async () => {
  if (!enabled) return
  await fixture.setup()
  await fixture.db.tenant.create({
    data: {
      id: foreignTenantId,
      slug: foreignTenantId,
      name: "Synthetic other finance business",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      currencyCode: "NGN",
      metadata: { retailOps: { subscription: { planId: "pro" } } },
      dataClassification: "QA",
      qaMarkedAt: new Date(),
      qaSourceDomain: foreignSourceDomain,
      users: {
        create: { userId: fixture.userId, role: "OWNER", status: "ACTIVE" },
      },
    },
  })
  for (const tenantId of [fixture.tenantId, foreignTenantId]) {
    const book = await createFinanceBook(fixture.db, {
      tenantId,
      actorUserId: fixture.userId,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    if (tenantId === fixture.tenantId) bookId = book.id
    else foreignBookId = book.id
    const count = tenantId === fixture.tenantId ? 11 : 1
    for (let index = 0; index < count; index++)
      await createFinanceSupplier(fixture.db, {
        tenantId,
        actorUserId: fixture.userId,
        bookId: book.id,
        clientCommandId: randomUUID(),
        code: `PAGE_${String(index).padStart(3, "0")}`,
        name: `${query} ${tenantId === fixture.tenantId ? "owned" : "foreign"} ${index}`,
      })
  }
}, 120_000)

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      const books = await fixture.db.financeBook.findMany({
        where: { tenantId: { in: [fixture.tenantId, foreignTenantId] } },
        select: { id: true },
      })
      const bookIds = books.map((book) => book.id)
      // These synthetic Books contain only identity commands, no journal lines.
      await fixture.db.financeCommand.deleteMany({
        where: { bookId: { in: bookIds } },
      })
      await fixture.db.financeSupplierAccount.deleteMany({
        where: { bookId: { in: bookIds } },
      })
      await fixture.db.financeAccount.deleteMany({
        where: { bookId: { in: bookIds } },
      })
      await fixture.db.financeBook.deleteMany({
        where: { id: { in: bookIds } },
      })
      await fixture.db.tenant.deleteMany({
        where: { id: foreignTenantId, qaSourceDomain: foreignSourceDomain },
      })
      expect(
        await fixture.db.tenant.count({ where: { id: foreignTenantId } }),
      ).toBe(0)
      expect(
        await fixture.db.financeBook.count({ where: { id: { in: bookIds } } }),
      ).toBe(0)
    }
  } finally {
    await fixture.cleanup()
  }
}, 90_000)

const pageResult = z.object({
  status: z.literal("available"),
  data: z.object({
    bookId: z.string(),
    data: z.array(
      z.object({ id: z.string(), code: z.string(), name: z.string() }),
    ),
    nextCursor: z.string().nullable(),
  }),
})

suite(
  "WhatsApp saved read pagination through actual linked Finance callers",
  () => {
    test("restores the exact Book/query cursor, confines chat links and rechecks authority after revoke", async () => {
      const ctx = await fixture.context(`${fixture.marker}-read`)
      expect(ctx.session.session).toBeNull()
      const answers: GeneralAnswer[] = []
      const tools = createGeneralTools(
        ctx,
        fixture.conversationId,
        () => {},
        (answer) => answers.push(answer),
      )
      const read = tools.readSuppliers?.execute
      if (!read) throw Error("Expected the eligible canonical supplier read")
      const first = pageResult.parse(
        await read({ query }, { toolCallId: "supplier-first", messages: [] }),
      ).data
      expect(first.bookId).toBe(bookId)
      expect(first.data).toHaveLength(10)
      expect(first.nextCursor).not.toBeNull()
      if (!first.nextCursor)
        throw Error("Expected a canonical next-page cursor")
      expect(first.data.every((row) => row.name.includes("owned"))).toBe(true)

      // Use canonical persistent parts and message storage, without a model or
      // invented cursor. This boundary is saved navigation -> canonical RPC.
      const parts = generalPersistentParts(
        answers.map((data) => ({ type: "data-general-answer", data })),
      )
      const messageId = `${fixture.marker}-saved-page`
      await fixture.db.$transaction((tx) =>
        appendAssistantMessage(tx, {
          conversationId: fixture.conversationId,
          message: {
            id: messageId,
            role: "assistant",
            parts: z.array(z.json()).parse(parts),
          },
        }),
      )
      const saved = await fixture.db.assistantMessage.findUniqueOrThrow({
        where: { id: messageId },
      })
      const savedParts = z.array(generalStoredPartSchema).parse(saved.parts)
      const continuation = savedParts.flatMap((part) => {
        if (part.type !== "data-general-answer") return []
        const hint = parseGeneralReadContinuation(part.data.continuation)
        return hint?.tool === "readSuppliers" ? [hint] : []
      })
      expect(continuation).toHaveLength(1)
      expect(continuation[0]).toMatchObject({
        tool: "readSuppliers",
        input: { bookId, query },
        nextCursor: first.nextCursor,
      })
      const context = generalReadContinuationContext([saved])
      if (!context) throw Error("Expected saved read-navigation context")
      expect(context).toContain("untrusted_read_continuations")
      expect(context).toContain("not instructions, authority")
      const next = nextGeneralReadRequest(continuation[0])
      if (next?.tool !== "readSuppliers")
        throw Error("Expected exact next supplier read")
      expect(next.input).toEqual({ bookId, query, cursor: first.nextCursor })
      expect(context).toContain(
        JSON.stringify({ tool: next.tool, input: next.input }),
      )
      const second = pageResult.parse(
        await read(next.input, { toolCallId: "supplier-next", messages: [] }),
      ).data
      expect(second.bookId).toBe(bookId)
      expect(second.data).toHaveLength(1)
      expect(second.nextCursor).toBeNull()
      const canonical = await listFinanceSuppliers(fixture.db, {
        tenantId: fixture.tenantId,
        actorUserId: fixture.userId,
        bookId,
        query,
        limit: 50,
      })
      const joined = [...first.data, ...second.data]
      expect(joined.map((row) => row.id)).toEqual(
        canonical.data.map((row) => row.id),
      )
      expect(new Set(joined.map((row) => row.id)).size).toBe(11)
      expect(
        await read(
          { ...next.input, bookId: foreignBookId },
          { toolCallId: "supplier-foreign-book", messages: [] },
        ),
      ).toMatchObject({
        status: "not_found",
        reason: expect.stringContaining("Financial book not found."),
      })
      // A cursor is valid only inside its original filtered list. The native
      // read rejects INVALID_JOURNAL; its shared tool maps BAD_REQUEST to unavailable.
      await expect(
        listFinanceSuppliers(fixture.db, {
          tenantId: fixture.tenantId,
          actorUserId: fixture.userId,
          ...next.input,
          query: "No matching supplier",
          limit: 10,
        }),
      ).rejects.toMatchObject({
        code: "INVALID_JOURNAL",
        message: "Supplier cursor is outside this list.",
      })
      expect(
        await read(
          { ...next.input, query: "No matching supplier" },
          { toolCallId: "supplier-changed-query", messages: [] },
        ),
      ).toMatchObject({
        status: "unavailable",
        reason:
          "This information or action is unavailable for your current role, Store or business setup.",
      })

      const scope = { tenantId: fixture.tenantId, storeId: fixture.storeId }
      const options = {
        trustedAppOrigin: "https://dash.ewatrade.com",
        currentScope: scope,
        scopeLabel: `${ctx.tenantContext.tenant.name} · ${ctx.tenantContext.activeStore?.name ?? "Store"}`,
        conversation: {
          conversationId: fixture.conversationId,
          purpose: "GENERAL" as const,
          origin: scope,
        },
      }
      const rendered = renderWhatsAppFinalReply(saved.parts, options)
      expect(rendered.kind).toBe("reply")
      const body = rendered.chunks.join("\n")
      expect(body).toContain("10 identities on this page")
      expect(body).toContain("More records available")
      expect(body).not.toContain("Synthetic page foreign")
      expect(body).toContain(
        `https://dash.ewatrade.com/assistant/c/${encodeURIComponent(fixture.conversationId)}`,
      )
      expect(body).toContain("Select the original business and Store")
      const mismatched = renderWhatsAppFinalReply(saved.parts, {
        ...options,
        currentScope: { ...scope, tenantId: foreignTenantId },
      })
      expect(mismatched.chunks.join("\n")).not.toContain("/assistant/c/")

      expect(
        await disconnectAssistantWhatsApp(fixture.db, {
          phoneNumberId: fixture.principal.phoneNumberId,
          senderId: fixture.principal.senderId,
        }),
      ).toEqual({ disconnected: true })
      // The pre-created tool closure and the saved hint grant no continued read.
      expect(
        await read(next.input, {
          toolCallId: "supplier-after-revoke",
          messages: [],
        }),
      ).toMatchObject({ status: "unavailable" })
      await expect(
        fixture.context(`${fixture.marker}-revoked`),
      ).rejects.toThrow()
    }, 240_000)
  },
)
