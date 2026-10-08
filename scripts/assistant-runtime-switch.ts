/**
 * Operator switch for the AI Setup Assistant's model, without a redeploy.
 *
 *   bun run assistant:runtime status
 *   bun run assistant:runtime off   # live businesses get "assistant unavailable";
 *                                   # setup lists stay editable and addable,
 *                                   # openings fall back to the fixed template
 *   bun run assistant:runtime on    # back on with the current provider/model
 *
 * The whole feature (chat, list and entry points) is controlled separately by
 * ASSISTANT_SETUP_ENABLED, which needs a redeploy. QA businesses always use the
 * provider-free rehearsal model and are not affected by this switch.
 */
import {
  ASSISTANT_RUNTIME_CONFIGURATION_KEY,
  DEFAULT_ASSISTANT_RUNTIME,
  resolveAssistantRuntimeConfiguration,
} from "../packages/ai/src/runtime-config"

const { prisma } = await import("../packages/db/src/client")

const command = process.argv[2]
if (!["status", "on", "off"].includes(command ?? "")) {
  console.error("Usage: assistant:runtime status | on | off")
  process.exit(1)
}

try {
  const row = await prisma.systemConfiguration.findUnique({
    where: { key: ASSISTANT_RUNTIME_CONFIGURATION_KEY },
    select: { value: true },
  })
  if (command !== "status") {
    const current = resolveAssistantRuntimeConfiguration(row?.value ?? null)
    const stored = (row?.value ?? {}) as { provider?: string; model?: string }
    const value = {
      enabled: command === "on",
      provider:
        current?.provider ??
        stored.provider ??
        DEFAULT_ASSISTANT_RUNTIME.provider,
      model: current?.model ?? stored.model ?? DEFAULT_ASSISTANT_RUNTIME.model,
    }
    await prisma.systemConfiguration.upsert({
      where: { key: ASSISTANT_RUNTIME_CONFIGURATION_KEY },
      create: { key: ASSISTANT_RUNTIME_CONFIGURATION_KEY, value },
      update: { value, revision: { increment: 1 } },
    })
  }
  const after = await prisma.systemConfiguration.findUnique({
    where: { key: ASSISTANT_RUNTIME_CONFIGURATION_KEY },
    select: { value: true, updatedAt: true },
  })
  const effective = resolveAssistantRuntimeConfiguration(after?.value ?? null)
  console.log(
    JSON.stringify(
      {
        stored: after?.value ?? null,
        storedAt: after?.updatedAt ?? null,
        effective:
          effective ?? "OFF (live businesses get assistant unavailable)",
      },
      null,
      2,
    ),
  )
} finally {
  await prisma.$disconnect()
}
