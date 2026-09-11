import { prisma } from "@ewatrade/db/client"
import {
  listPendingStoreConversationMediaSafetyWork,
  preparePendingStoreConversationMediaSafetyWork,
} from "@ewatrade/db/queries"
import { logger, schedules, task } from "@trigger.dev/sdk/v3"

import { prescriptionMediaSafety } from "./prescription-media-safety"
import { serviceCommerceMediaSafety } from "./service-commerce-media-safety"

const PAGE_LIMIT = 100
const MAX_PAGES_PER_WORKER = 5
const ENQUEUE_BATCH_SIZE = 10

type PendingMediaSafetyWork =
  | {
      kind: "generic"
      mediaAssetId: string
      storeId: string
      tenantId: string
    }
  | {
      kind: "prescription"
      requestId: string
      storeId: string
      tenantId: string
    }

type Dependencies = {
  enqueue(work: PendingMediaSafetyWork): Promise<unknown>
  list(input: { cursor?: string; limit: number }): Promise<{
    items: PendingMediaSafetyWork[]
    nextCursor: string | null
  }>
  prepare(
    work: Extract<PendingMediaSafetyWork, { kind: "generic" }>,
  ): Promise<Extract<PendingMediaSafetyWork, { kind: "generic" }>>
}

function defaultDependencies(): Dependencies {
  return {
    enqueue: (work) =>
      work.kind === "generic"
        ? serviceCommerceMediaSafety.trigger({
            mediaAssetId: work.mediaAssetId,
            storeId: work.storeId,
            tenantId: work.tenantId,
          })
        : prescriptionMediaSafety.trigger({ requestId: work.requestId }),
    list: (input) => listPendingStoreConversationMediaSafetyWork(prisma, input),
    prepare: (work) =>
      preparePendingStoreConversationMediaSafetyWork(prisma, work),
  }
}

export class StoreConversationMediaSafetyRecoveryError extends Error {
  constructor(
    readonly result: { failed: number; queued: number; scanned: number },
  ) {
    super(
      "Some pending Store Conversation media safety work could not be queued.",
    )
    this.name = "StoreConversationMediaSafetyRecoveryError"
  }
}

async function enqueueBounded(
  items: PendingMediaSafetyWork[],
  dependencies: Dependencies,
) {
  let failed = 0
  let queued = 0
  for (let offset = 0; offset < items.length; offset += ENQUEUE_BATCH_SIZE) {
    const results = await Promise.allSettled(
      items.slice(offset, offset + ENQUEUE_BATCH_SIZE).map(async (work) => {
        const prepared =
          work.kind === "generic" ? await dependencies.prepare(work) : work
        return dependencies.enqueue(prepared)
      }),
    )
    for (const result of results) {
      if (result.status === "fulfilled") queued += 1
      else failed += 1
    }
  }
  return { failed, queued }
}

export async function runStoreConversationMediaSafetyRecovery(
  input: { cursor?: string } = {},
  dependencies: Dependencies = defaultDependencies(),
) {
  let cursor = input.cursor
  let failed = 0
  let queued = 0
  let scanned = 0
  let nextCursor: string | null = null

  for (let pageNumber = 0; pageNumber < MAX_PAGES_PER_WORKER; pageNumber += 1) {
    const page = await dependencies.list({
      ...(cursor ? { cursor } : {}),
      limit: PAGE_LIMIT,
    })
    scanned += page.items.length
    const enqueueResult = await enqueueBounded(page.items, dependencies)
    failed += enqueueResult.failed
    queued += enqueueResult.queued
    nextCursor = page.nextCursor
    if (failed > 0 || !nextCursor) break
    cursor = nextCursor
  }

  const result = { failed, nextCursor, queued, scanned }
  if (failed > 0) {
    throw new StoreConversationMediaSafetyRecoveryError({
      failed,
      queued,
      scanned,
    })
  }
  return result
}

export const storeConversationMediaSafetyRecoveryWorker = task({
  id: "store-conversations.media-safety-recovery-worker",
  maxDuration: 120,
  run: async (input: { cursor?: string }) => {
    const result = await runStoreConversationMediaSafetyRecovery(input)
    logger.info("Queued pending Store Conversation media safety work", {
      failed: result.failed,
      hasContinuation: Boolean(result.nextCursor),
      queued: result.queued,
      scanned: result.scanned,
    })
    if (result.nextCursor) {
      await storeConversationMediaSafetyRecoveryWorker.trigger({
        cursor: result.nextCursor,
      })
    }
    return result
  },
})

export const storeConversationMediaSafetyRecovery = schedules.task({
  cron: "*/5 * * * *",
  id: "store-conversations.media-safety-recovery",
  maxDuration: 60,
  run: async () => {
    await storeConversationMediaSafetyRecoveryWorker.trigger({})
    return { queuedWorker: true }
  },
})
