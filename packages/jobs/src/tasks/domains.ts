import { schedules, task } from "@trigger.dev/sdk/v3"

import {
  type DomainConnectionVerificationPayload,
  domainConnectionVerificationHandler,
} from "../handlers/domain-connection-verification"
import { domainReconciliationHandler } from "../handlers/domain-reconciliation"
import {
  type DomainRegistrationPayload,
  domainRegistrationHandler,
} from "../handlers/domain-registration"

export const domainRegistration = task({
  id: "domains.registration",
  maxDuration: 180,
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 3 },
  run: async (input: DomainRegistrationPayload) => {
    await domainRegistrationHandler(input, 1)
  },
})

export const domainConnectionVerification = task({
  id: "domains.connection.verify",
  maxDuration: 120,
  queue: { concurrencyLimit: 10 },
  retry: {
    factor: 2,
    maxAttempts: 8,
    maxTimeoutInMs: 300_000,
    minTimeoutInMs: 30_000,
  },
  run: async (input: DomainConnectionVerificationPayload) => {
    await domainConnectionVerificationHandler(input, 1)
  },
})

export const domainReconciliation = schedules.task({
  cron: "*/15 * * * *",
  id: "domains.reconcile",
  maxDuration: 300,
  run: async () => {
    return domainReconciliationHandler({ limit: 100 }, 1)
  },
})
