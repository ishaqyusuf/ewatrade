import { expect, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import {
  createAssistantAttachmentStorage,
  resolveAssistantAttachmentStorage,
} from "@ewatrade/private-media/assistant-attachments"
import {
  type AssistantMaintenanceDeps,
  assistantMaintenanceHandler,
  defaultAssistantMaintenanceDeps,
} from "./assistant-maintenance"

test("retention keeps the original QA bytes/attribution on failure and verifies deletion before clearing", async () => {
  const root = await mkdtemp("/private/tmp/ewatrade-maintenance-media-")
  const previous = {
    APP_ENV: process.env.APP_ENV,
    LOCAL_PRIVATE_OBJECTS_DIR: process.env.LOCAL_PRIVATE_OBJECTS_DIR,
  }
  try {
    Object.assign(process.env, {
      APP_ENV: "local",
      LOCAL_PRIVATE_OBJECTS_DIR: root,
    })
    const bytes = new TextEncoder().encode("Synthetic original WhatsApp file")
    const target = {
      tenantId: randomUUID(),
      conversationId: randomUUID(),
      attachmentId: randomUUID(),
      contentDigest: createHash("sha256").update(bytes).digest("hex"),
      contentType: "text/plain",
      sizeBytes: bytes.length,
    }
    const config = resolveAssistantAttachmentStorage("QA")
    const storage = createAssistantAttachmentStorage(config, "QA")
    const staged = await storage.stage({ target, bytes })
    const row = {
      ...target,
      id: target.attachmentId,
      fileName: "synthetic.txt",
      messageId: "saved-message",
      storageProvider: config.provider,
      storageStoreId: config.storeId,
      storagePath: staged.storagePath,
      dataClassification: "QA" as const,
    }
    const removeBytes = defaultAssistantMaintenanceDeps().removeBytes
    for (const changed of [
      { storageStoreId: "wrong-store" },
      { storageProvider: "wrong-provider" },
      { storagePath: "assistant/attachments/wrong-file.txt" },
    ]) {
      await expect(removeBytes({ ...row, ...changed })).rejects.toMatchObject({
        code: "INVALID_OBJECT",
      })
      expect(await storage.read({ target })).toEqual(bytes)
    }
    let expired = false
    const deps: AssistantMaintenanceDeps = {
      now: () => new Date(),
      failAbandonedRuns: async () => ({ failed: 0 }),
      listExpired: async () => [row],
      removeBytes: async () => {
        throw Error("Synthetic removal failure")
      },
      expire: async () => {
        // The canonical row may be cleared only after the actual object disappeared.
        await expect(storage.read({ target })).rejects.toMatchObject({
          code: "OBJECT_NOT_FOUND",
        })
        expired = true
        return "cleared"
      },
    }
    expect(await assistantMaintenanceHandler(deps)).toMatchObject({
      kept: 1,
      cleared: 0,
    })
    expect(expired).toBe(false)
    expect(await storage.read({ target })).toEqual(bytes)
    deps.removeBytes = removeBytes
    expect(await assistantMaintenanceHandler(deps)).toMatchObject({
      kept: 0,
      cleared: 1,
    })
    expect(expired).toBe(true)
    await removeBytes(row)
    await expect(storage.read({ target })).rejects.toMatchObject({
      code: "OBJECT_NOT_FOUND",
    })
  } finally {
    for (const key of ["APP_ENV", "LOCAL_PRIVATE_OBJECTS_DIR"] as const) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    await rm(root, { recursive: true, force: true })
  }
})
