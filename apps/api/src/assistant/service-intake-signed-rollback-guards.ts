export const serviceIntakeSignedScope = {
  database: "ewatrade_qa_v1",
  tenantId: "cmuzedcda000hbw9kd6e50z8u",
  storeId: "cmuzedcow000jbw9kluarpxfs",
  userId: "cmuzedc7e000gbw9ky1dioc9f",
  conversationId: "cmv4i45w70000eb9kl7jkfa3e",
  email: "video.20261008-video-v1.web.bakery@ishaq.qa.test",
} as const

export function signedIntakeCheck(
  value: unknown,
  message: string,
): asserts value {
  if (!value) throw Error(message)
}

export function assertServiceIntakeSignedEnvironment(env: NodeJS.ProcessEnv) {
  signedIntakeCheck(
    env.RUN_D04_QA_ROLLBACK === "1" &&
      env.RUN_D04_QA_SIGNED_ROLLBACK === "1" &&
      env.APP_ENV === "local" &&
      env.NODE_ENV === "development" &&
      (env.ASSISTANT_APPROVAL_SIGNING_KEY?.length ?? 0) >= 32 &&
      Boolean(env.D04_QA_CONVERSATION_ID && env.D04_QA_SESSION_ID),
    "Scheduled local signed rollback, explicit saved chat/session and process-only key required",
  )
}

export function assertServiceIntakeSignedScope(
  input: {
    database: string
    tenantId: string
    storeId: string
    userId: string
    conversationId: string
    sessionId: string
  },
  env: NodeJS.ProcessEnv,
) {
  for (const key of ["database", "tenantId", "storeId", "userId"] as const)
    signedIntakeCheck(
      input[key] === serviceIntakeSignedScope[key],
      "Exact owned QA scope required",
    )
  signedIntakeCheck(
    input.conversationId === serviceIntakeSignedScope.conversationId &&
      input.conversationId === env.D04_QA_CONVERSATION_ID &&
      input.sessionId === env.D04_QA_SESSION_ID,
    "Exact coordinator-reviewed saved chat/session required",
  )
}

export function assertServiceIntakeSignedBounds(options: {
  maxWait?: number
  timeout?: number
  isolationLevel?: string
}) {
  signedIntakeCheck(
    options.maxWait === 10_000 &&
      options.timeout === 30_000 &&
      options.isolationLevel === "Serializable",
    "Signed GENERAL transaction limits changed",
  )
}

/** Re-enter real fresh-auth GENERAL callbacks on a caller-owned transaction; never nest. */
export function serviceIntakeSignedTransactionBridge<T extends object>(tx: T) {
  return new Proxy(tx, {
    get(owner, key) {
      if (key === "$transaction")
        return async <Result>(
          operation: (tx: T) => Promise<Result>,
          options: Parameters<typeof assertServiceIntakeSignedBounds>[0],
        ) => {
          assertServiceIntakeSignedBounds(options)
          return operation(tx)
        }
      const value = Reflect.get(owner, key)
      return typeof value === "function" ? value.bind(owner) : value
    },
  })
}
