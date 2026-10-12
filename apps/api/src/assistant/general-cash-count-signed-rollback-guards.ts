export const g02RollbackScope = {
  database: "ewatrade_qa_v1",
  tenantId: "cmuzedcda000hbw9kd6e50z8u",
  storeId: "cmuzedcow000jbw9kluarpxfs",
  userId: "cmuzedc7e000gbw9ky1dioc9f",
  conversationId: "cmv4i45w70000eb9kl7jkfa3e",
  email: "video.20261008-video-v1.web.bakery@ishaq.qa.test",
} as const

export function rollbackCheck(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

export function assertG02RollbackEnvironment(env: NodeJS.ProcessEnv) {
  rollbackCheck(
    env.RUN_G02_SIGNED_PROPOSAL_ROLLBACK === "1" &&
      env.APP_ENV === "local" &&
      env.NODE_ENV === "development" &&
      (env.ASSISTANT_APPROVAL_SIGNING_KEY?.length ?? 0) >= 32,
    "Explicit scheduled local rollback and process-only signing key required",
  )
}

export function assertG02RollbackScope(input: {
  database: string
  tenantId: string
  storeId: string
  userId: string
  conversationId: string
}) {
  for (const key of [
    "database",
    "tenantId",
    "storeId",
    "userId",
    "conversationId",
  ] as const)
    rollbackCheck(
      input[key] === g02RollbackScope[key],
      "Exact saved QA scope required",
    )
}

export function assertG02RollbackTransactionOptions(options: {
  maxWait?: number
  timeout?: number
  isolationLevel?: string
}) {
  rollbackCheck(
    options.maxWait === 10_000 &&
      options.timeout === 30_000 &&
      options.isolationLevel === "Serializable",
    "Real confirmation must retain bounded Serializable transaction options",
  )
}
