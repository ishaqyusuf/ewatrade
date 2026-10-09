/**
 * Read-only AI Setup Assistant report: usage by business/model, run outcomes,
 * runs still RUNNING, and what the hourly maintenance would clean up next.
 * Prints counts and identifiers only, never message or file content.
 *
 *   bun run assistant:usage-report            # last 7 days
 *   bun run assistant:usage-report -- --days 30
 */
const daysFlag = process.argv.indexOf("--days")
const days = daysFlag > 0 ? Number(process.argv[daysFlag + 1]) : 7
if (!Number.isFinite(days) || days <= 0) {
  console.error("--days must be a positive number.")
  process.exit(1)
}

const { prisma } = await import("../packages/db/src/client")
const {
  ASSISTANT_RUN_ABANDONED_AFTER_MS,
  listExpiredAssistantAttachments,
  summarizeAssistantUsage,
} = await import("../packages/db/src/queries/assistant-operations")

try {
  const now = new Date()
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const [summary, abandoned, expired] = await Promise.all([
    summarizeAssistantUsage(prisma, { since }),
    prisma.assistantRun.count({
      where: {
        status: "RUNNING",
        startedAt: {
          lt: new Date(now.getTime() - ASSISTANT_RUN_ABANDONED_AFTER_MS),
        },
      },
    }),
    listExpiredAssistantAttachments(prisma, { now, limit: 500 }),
  ])
  const totals = summary.usage.reduce(
    (sum, row) => ({
      calls: sum.calls + row.calls,
      inputTokens: sum.inputTokens + row.inputTokens,
      cachedInputTokens: sum.cachedInputTokens + row.cachedInputTokens,
      outputTokens: sum.outputTokens + row.outputTokens,
      audioSeconds: sum.audioSeconds + row.audioSeconds,
      imageCount: sum.imageCount + row.imageCount,
    }),
    {
      calls: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      audioSeconds: 0,
      imageCount: 0,
    },
  )
  console.log(
    JSON.stringify(
      {
        since: since.toISOString(),
        totals,
        byBusinessAndModel: summary.usage,
        runs: summary.runs,
        runningNow: summary.runningNow,
        abandonedRunsToClose: abandoned,
        attachmentsToExpire: expired.length,
      },
      null,
      2,
    ),
  )
} finally {
  await prisma.$disconnect()
}
