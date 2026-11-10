import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { stageAssistantWhatsAppOutboxInTransaction } from "./outbox"
const inbox = {
  id: "inbox",
  phoneNumberId: "number",
  expiresAt: new Date(Date.now() + 60_000),
}
const run = {
  id: "run",
  assistantMessageId: "message",
  assistantMessage: { parts: [{ type: "text", text: "A saved answer." }] },
}
const content = "Old immutable saved answer."
function row() {
  return {
    inboxId: inbox.id,
    phoneNumberId: inbox.phoneNumberId,
    responseRevision: 1,
    chunkIndex: 0,
    chunkCount: 1,
    runId: run.id,
    messageId: run.assistantMessageId,
    rendererVersion: "whatsapp-reply-v3",
    renderKind: "reply",
    authorityDigest: "authority",
    content,
    contentDigest: createHash("sha256").update(content).digest("hex"),
    state: "UNKNOWN",
  }
}
function harness(rows: ReturnType<typeof row>[]) {
  let writes = 0
  return {
    db: {
      assistantWhatsAppOutbox: {
        findMany: async () => rows,
        createMany: async () => {
          writes++
          return { count: 1 }
        },
      },
    } as unknown as Prisma.TransactionClient,
    writes: () => writes,
  }
}
test("renderer upgrade preserves ordinary staged bytes and UNKNOWN outcomes without writes", async () => {
  for (const version of [
    "whatsapp-reply-v1",
    "whatsapp-reply-v2",
    "whatsapp-reply-v3",
  ]) {
    const prior = { ...row(), rendererVersion: version }
    const h = harness([prior])
    expect(
      await stageAssistantWhatsAppOutboxInTransaction(
        h.db,
        inbox,
        run,
        "authority",
        "Shop · Main",
      ),
    ).toEqual({ staged: 1, kind: "reply" })
    expect(h.writes()).toBe(0)
    expect(prior.state).toBe("UNKNOWN")
    expect(prior.content).toBe(content)
  }
})
test("legacy recovery rejects modified provenance, integrity and missing chunks", async () => {
  for (const patch of [
    { runId: "other" },
    { messageId: "other" },
    { authorityDigest: "changed" },
    { phoneNumberId: "other" },
    { content: "tampered" },
    { chunkCount: 2 },
    { chunkIndex: 1 },
    { renderKind: "action_review" },
    { rendererVersion: "unknown" },
  ]) {
    const h = harness([{ ...row(), ...patch }])
    await expect(
      stageAssistantWhatsAppOutboxInTransaction(
        h.db,
        inbox,
        run,
        "authority",
        "Shop · Main",
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(h.writes()).toBe(0)
  }
})
