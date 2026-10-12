import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  assertServiceIntakeSignedScope,
  serviceIntakeSignedScope,
  signedIntakeCheck as check,
} from "./service-intake-signed-rollback-guards"

export function assertCompletionSignedEnvironment(env: NodeJS.ProcessEnv) {
  check(
    env.RUN_D05_QA_SIGNED_ROLLBACK === "1" &&
      env.D05_QA_SIGNED_CASE_SELECTION === "full" &&
      env.APP_ENV === "local" &&
      env.NODE_ENV === "development" &&
      (env.ASSISTANT_APPROVAL_SIGNING_KEY?.length ?? 0) >= 32 &&
      Boolean(env.D05_QA_SESSION_ID && env.D05_QA_RECEIVING_ACCOUNT_ID) &&
      env.D05_QA_CONVERSATION_ID === serviceIntakeSignedScope.conversationId,
    "Coordinator-scheduled full D05 rollback, existing session/account and process-only signing key required",
  )
}

export function assertCompletionSignedScope(
  input: Parameters<typeof assertServiceIntakeSignedScope>[0],
  env: NodeJS.ProcessEnv,
) {
  // Reuse the exact identity guard without setting or invoking any D04 run flag.
  assertServiceIntakeSignedScope(input, {
    D04_QA_CONVERSATION_ID: env.D05_QA_CONVERSATION_ID,
    D04_QA_SESSION_ID: env.D05_QA_SESSION_ID,
  })
}

export function assertCompletionSignedAvailability(
  capabilities: ReadonlyArray<{
    id: string
    mode: string
    action?: string
    rollout: string
    clients: readonly string[]
  }>,
) {
  for (const [id, action] of [
    ["services.work.rework", "service_work_rework"],
    ["services.work.handoff", "service_work_handoff"],
  ] as const) {
    const rows = capabilities.filter((row) => row.id === id)
    check(
      rows.length === 1 &&
        rows[0]?.mode === "write" &&
        rows[0].action === action &&
        rows[0].clients.includes("dashboard") &&
        rows[0].rollout !== "planned",
      `D05 signed prerequisite unavailable: ${id}; no rollout override permitted`,
    )
  }
}

/** Read schema/client feature configuration before any suite timing or DB call. */
export function completionSignedFeatureConfiguration(root: string) {
  const schema = readFileSync(
    resolve(root, "packages/db/prisma/schema.prisma"),
    "utf8",
  )
  const client = readFileSync(
    resolve(root, "packages/db/generated/prisma/internal/class.ts"),
    "utf8",
  )
  const sha = (value: string) =>
    createHash("sha256").update(value).digest("hex")
  return {
    capturedAt: new Date().toISOString(),
    schemaSha256: sha(schema),
    generatedClientSha256: sha(client),
    generator: schema.match(/generator client\s*\{[\s\S]*?\n\}/)?.[0] ?? null,
    generatedPreviewFeatures:
      client.match(/"previewFeatures"\s*:\s*\[[\s\S]*?\]/)?.[0] ?? null,
    relationJoins: client.includes("relationJoins"),
    ownedSchemaOrGenerationChanges: false,
  }
}
