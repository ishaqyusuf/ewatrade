import { expect, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import {
  createAssistantAttachmentStorage,
  resolveAssistantAttachmentStorage,
} from "@ewatrade/private-media/assistant-attachments"
import { removeAccountPrivacyPrivateAttachment } from "./private-assistant-media"

test("private erasure removes canonical QA bytes, verifies absence, replays, and refuses another path/store", async () => {
  const root = await mkdtemp("/private/tmp/ewatrade-deletion-media-")
  const previous = {
    APP_ENV: process.env.APP_ENV,
    LOCAL_PRIVATE_OBJECTS_DIR: process.env.LOCAL_PRIVATE_OBJECTS_DIR,
  }
  try {
    Object.assign(process.env, {
      APP_ENV: "local",
      LOCAL_PRIVATE_OBJECTS_DIR: root,
    })
    const bytes = new TextEncoder().encode("Synthetic privacy test only")
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
      storageProvider: config.provider,
      storageStoreId: config.storeId,
      storagePath: staged.storagePath,
      dataClassification: "QA" as const,
    }
    await expect(
      removeAccountPrivacyPrivateAttachment({
        ...row,
        storageStoreId: "store_wrong",
      }),
    ).rejects.toMatchObject({ code: "INVALID_OBJECT" })
    await expect(
      removeAccountPrivacyPrivateAttachment({
        ...row,
        storagePath: "assistant/attachments/another-file.txt",
      }),
    ).rejects.toMatchObject({ code: "INVALID_OBJECT" })
    expect(new TextDecoder().decode(await storage.read({ target }))).toBe(
      "Synthetic privacy test only",
    )
    await removeAccountPrivacyPrivateAttachment(row)
    await expect(storage.read({ target })).rejects.toMatchObject({
      code: "OBJECT_NOT_FOUND",
    })
    await removeAccountPrivacyPrivateAttachment(row)
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
