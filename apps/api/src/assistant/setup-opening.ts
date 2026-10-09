import { ASSISTANT_RUNTIME_CONFIGURATION_KEY } from "@ewatrade/ai/runtime-config"
import { summarizeSetupAreas } from "@ewatrade/assistant/setup/areas"
import { summarizeSetupFollowUp } from "@ewatrade/assistant/setup/follow-up"
import {
  cleanSetupOpening,
  setupOpeningFallback,
  setupOpeningInstructions,
  setupWelcomeBackFallback,
  setupWelcomeBackInstructions,
} from "@ewatrade/assistant/setup/opening"
import {
  type AssistantScope,
  assistantBudgetScopeKey,
  readSetupDraft,
  recordAssistantMessageUsage,
} from "@ewatrade/db/assistant"
import { generateText } from "ai"
import type { TRPCContext } from "../trpc/init"
import {
  type ResolvedAssistantModel,
  resolveSetupAssistantModel,
} from "./model-resolution"
import { loadSetupBusinessContext } from "./setup-context"

type Db = TRPCContext["db"]

export const SETUP_OPENING_TIMEOUT_MS = 8_000
/** A reload inside this window is the same visit; after it, a new one. */
export const SETUP_VISIT_GAP_MS = 30 * 60 * 1000

export function resolveSetupModelForScope(
  db: Db,
  scope: { dataClassification: "LIVE" | "QA" },
) {
  return resolveSetupAssistantModel({
    dataClassification: scope.dataClassification,
    readRuntimeConfiguration: async () =>
      (
        await db.systemConfiguration.findUnique({
          where: { key: ASSISTANT_RUNTIME_CONFIGURATION_KEY },
          select: { value: true },
        })
      )?.value,
  })
}

export type SetupMessageDraft = {
  text: string
  source: "model" | "fallback"
  provider: string
  modelId: string
  durationMs: number
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
}

/**
 * One bounded model call for the opening or welcome-back message. Explicit
 * development rehearsal, no provider, a slow provider or an unusable answer
 * fall back to deterministic text, so starting setup never waits on or fails with AI.
 */
export async function writeSetupMessage(input: {
  model: ResolvedAssistantModel | null
  instructions: string
  fallback: string
  timeoutMs?: number
  generate?: typeof generateText
  now?: () => number
}): Promise<SetupMessageDraft> {
  const now = input.now ?? Date.now
  const startedAt = now()
  const fallback = (provider: string, modelId: string): SetupMessageDraft => ({
    text: input.fallback,
    source: "fallback",
    provider,
    modelId,
    durationMs: now() - startedAt,
  })
  const model = input.model
  if (!model || model.rehearsal)
    return fallback(
      model?.provider ?? "ewatrade",
      model?.modelId ?? "setup-template-v1",
    )
  try {
    const result = await (input.generate ?? generateText)({
      model: model.model,
      system: input.instructions,
      prompt: "Write the message now.",
      maxOutputTokens: 600,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(
        input.timeoutMs ?? SETUP_OPENING_TIMEOUT_MS,
      ),
      providerOptions: model.providerOptions as never,
    })
    const text = cleanSetupOpening(result.text)
    return text
      ? {
          text,
          source: "model",
          provider: model.provider,
          modelId: model.modelId,
          durationMs: now() - startedAt,
          usage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
          },
        }
      : fallback(model.provider, model.modelId)
  } catch {
    return fallback(model.provider, model.modelId)
  }
}

export async function recordSetupMessageUsage(
  db: Db,
  scope: AssistantScope,
  requestClass: "opening" | "welcome",
  draft: SetupMessageDraft,
) {
  await recordAssistantMessageUsage(db, {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    provider: draft.provider,
    model: draft.modelId,
    requestClass,
    outcome: draft.source === "model" ? "success" : "fallback",
    ...draft.usage,
    durationMs: draft.durationMs,
    budgetScopeKey: assistantBudgetScopeKey(scope.tenantId, "SETUP"),
  }).catch(() => {
    // Usage is bookkeeping; it never blocks the owner's setup.
  })
}

/** The assistant's first message for a new setup conversation. */
export async function composeSetupOpening(
  db: Db,
  scope: AssistantScope & { dataClassification: "LIVE" | "QA" },
) {
  const [{ context, firstName }, model] = await Promise.all([
    loadSetupBusinessContext(db, scope),
    resolveSetupModelForScope(db, scope),
  ])
  const draft = await writeSetupMessage({
    model,
    instructions: setupOpeningInstructions(context, firstName),
    fallback: setupOpeningFallback(context, firstName),
  })
  await recordSetupMessageUsage(db, scope, "opening", draft)
  return draft.text
}

/** "Welcome back, how can I help today?" with what is still unfinished. */
export async function composeSetupWelcome(
  db: Db,
  scope: AssistantScope & { dataClassification: "LIVE" | "QA" },
  draftId: string,
) {
  const [{ context, firstName }, model, setupDraft] = await Promise.all([
    loadSetupBusinessContext(db, scope),
    resolveSetupModelForScope(db, scope),
    readSetupDraft(db, draftId),
  ])
  const progress = summarizeSetupAreas(setupDraft.areas, setupDraft.entities)
  const followUp = summarizeSetupFollowUp(setupDraft.entities)
  const draft = await writeSetupMessage({
    model,
    instructions: setupWelcomeBackInstructions(
      context,
      firstName,
      progress,
      followUp,
    ),
    fallback: setupWelcomeBackFallback(context, firstName, progress, followUp),
  })
  await recordSetupMessageUsage(db, scope, "welcome", draft)
  return draft.text
}
