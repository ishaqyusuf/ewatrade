import { describe, expect, test } from "bun:test"
import { createRehearsalMediaAdapters } from "@ewatrade/ai/media"
import {
  type ClaimedSetupAttachment,
  type SetupAttachmentProcessingDeps,
  describeSetupAttachmentError,
  processSetupAttachment,
} from "./attachment-processing"
import { SETUP_REHEARSAL_TRANSCRIPT, setupRehearsalImageRead } from "./vision"

const utf8 = (text: string) => new TextEncoder().encode(text)

function attachment(
  overrides: Partial<ClaimedSetupAttachment> = {},
): ClaimedSetupAttachment {
  return {
    id: "att_1",
    tenantId: "tenant_1",
    conversationId: "conv_1",
    actorUserId: "user_1",
    contentDigest: "a".repeat(64),
    kind: "SPREADSHEET",
    contentType: "text/csv",
    sizeBytes: 64,
    durationMs: null,
    processingAttempts: 1,
    ...overrides,
  }
}

function harness(
  claimed: ClaimedSetupAttachment | null,
  bytes: Uint8Array,
  overrides: Partial<SetupAttachmentProcessingDeps> = {},
) {
  const log = {
    completed: [] as unknown[],
    failed: [] as Array<{ errorCode: string; retryable: boolean }>,
    usage: [] as Array<{ requestClass: string; outcome: string }>,
    reserved: [] as unknown[],
  }
  const deps: SetupAttachmentProcessingDeps = {
    claim: async () => claimed,
    readBytes: async () => bytes,
    media: async () =>
      createRehearsalMediaAdapters({
        transcript: SETUP_REHEARSAL_TRANSCRIPT,
        image: () => setupRehearsalImageRead(),
      }),
    prepareImage: async (input) => ({ bytes: input, mediaType: "image/webp" }),
    reserveMedia: async (_attachment, request) => {
      log.reserved.push(request)
      return true
    },
    recordUsage: async (_attachment, usage) => {
      log.usage.push(usage)
    },
    complete: async (input) => {
      log.completed.push(input)
      return true
    },
    fail: async (input) => {
      log.failed.push(input)
    },
    ...overrides,
  }
  return { deps, log }
}

describe("setup attachment processing", () => {
  test("nothing to claim is a no-op", async () => {
    const { deps, log } = harness(null, new Uint8Array())
    expect(await processSetupAttachment("att_1", deps)).toEqual({
      status: "skipped",
    })
    expect(log.completed).toEqual([])
  })

  test("spreadsheets are parsed without a provider or budget", async () => {
    const { deps, log } = harness(
      attachment(),
      utf8("Item,Price,Stock\nCrate of eggs,4500,20\n"),
    )
    expect((await processSetupAttachment("att_1", deps)).status).toBe("ready")
    expect(log.reserved).toEqual([])
    expect(log.completed[0]).toMatchObject({
      transcript: null,
      extraction: {
        type: "table",
        columns: ["Item", "Price", "Stock"],
        rows: [["Crate of eggs", "4500", "20"]],
      },
    })
    expect(log.usage[0]?.requestClass).toBe("extract")
  })

  test("voice notes reserve audio seconds, then keep the transcript apart", async () => {
    const { deps, log } = harness(
      attachment({
        kind: "AUDIO",
        contentType: "audio/webm",
        durationMs: 41_500,
        sizeBytes: 300_000,
      }),
      new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
    )
    expect((await processSetupAttachment("att_1", deps)).status).toBe("ready")
    expect(log.reserved).toEqual([{ audioSeconds: 42 }])
    expect(log.completed[0]).toMatchObject({
      transcript: SETUP_REHEARSAL_TRANSCRIPT,
      extraction: { type: "transcript" },
      durationMs: 41_500,
    })
  })

  test("a falsely short voice note is still charged by its size", async () => {
    const { deps, log } = harness(
      attachment({
        kind: "AUDIO",
        contentType: "audio/webm",
        durationMs: 1_000,
        sizeBytes: 6_400_000,
      }),
      new Uint8Array([1]),
    )
    await processSetupAttachment("att_1", deps)
    expect(log.reserved).toEqual([{ audioSeconds: 100 }])
  })

  test("photos are prepared, read and charged one image", async () => {
    let prepared = false
    const { deps, log } = harness(
      attachment({ kind: "IMAGE", contentType: "image/heic" }),
      new Uint8Array([1, 2, 3]),
      {
        prepareImage: async (bytes) => {
          prepared = true
          return { bytes, mediaType: "image/webp" }
        },
      },
    )
    expect((await processSetupAttachment("att_1", deps)).status).toBe("ready")
    expect(prepared).toBe(true)
    expect(log.reserved).toEqual([{ images: 1 }])
    expect(log.completed[0]).toMatchObject({
      extraction: { type: "image", imageKind: "document" },
    })
  })

  test("exhausted media budget refuses without calling a provider", async () => {
    let providerCalls = 0
    const { deps, log } = harness(
      attachment({ kind: "IMAGE", contentType: "image/png" }),
      new Uint8Array([1]),
      {
        reserveMedia: async () => false,
        media: async () => {
          const adapters = createRehearsalMediaAdapters({
            transcript: "",
            image: () => setupRehearsalImageRead(),
          })
          return {
            ...adapters,
            readImage: async (input) => {
              providerCalls += 1
              return adapters.readImage(input)
            },
          }
        },
      },
    )
    expect(await processSetupAttachment("att_1", deps)).toEqual({
      status: "failed",
      errorCode: "BUDGET_EXHAUSTED",
      retryable: false,
    })
    expect(providerCalls).toBe(0)
    expect(log.failed).toHaveLength(1)
  })

  test("unreadable files fail for good; provider outages retry", async () => {
    const corrupt = harness(
      attachment({
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      utf8("not a workbook"),
    )
    expect(await processSetupAttachment("att_1", corrupt.deps)).toEqual({
      status: "failed",
      errorCode: "FILE_UNREADABLE",
      retryable: false,
    })

    const outage = harness(
      attachment({ kind: "AUDIO", contentType: "audio/webm" }),
      new Uint8Array([1]),
      {
        media: async () => ({
          transcribe: async () => {
            throw new Error("provider 503")
          },
          readImage: async () => {
            throw new Error("unused")
          },
        }),
      },
    )
    expect(await processSetupAttachment("att_1", outage.deps)).toEqual({
      status: "failed",
      errorCode: "PROCESSING_UNAVAILABLE",
      retryable: true,
    })
  })

  test("no media provider is explicit, not retried", async () => {
    const { deps } = harness(
      attachment({ kind: "AUDIO", contentType: "audio/ogg" }),
      new Uint8Array([1]),
      { media: async () => null },
    )
    const result = await processSetupAttachment("att_1", deps)
    expect(result).toEqual({
      status: "failed",
      errorCode: "MEDIA_UNAVAILABLE",
      retryable: false,
    })
    expect(describeSetupAttachmentError("MEDIA_UNAVAILABLE")).toContain(
      "Type your list",
    )
  })
})
