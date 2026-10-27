import { expect, test } from "bun:test"
import {
  runManualPaymentAlertJobs,
  runManualPaymentPolicyChange,
} from "./manual-payment-alert-jobs"

test("provider-disabled sweep still processes in-app notices without queuing external delivery", async () => {
  const events: string[] = []
  const result = await runManualPaymentAlertJobs({
    externalDeliveryEnabled: false,
    queuePolicyChange: async () => {
      const notice = await runManualPaymentPolicyChange(
        {},
        {
          claim: async () => ({ revision: 2, claimId: "claim" }),
          process: async ({ revision, limit }) => {
            expect({ revision, limit }).toEqual({ revision: 2, limit: 5 })
            events.push("in-app")
            return { completed: true, notices: 1 }
          },
          continue: async () => {
            events.push("continue")
          },
        },
      )
      expect(notice).toEqual({ completed: true, notices: 1 })
      return true
    },
    queueExternalAlerts: async () => {
      events.push("external")
      return 1
    },
  })
  expect(result).toEqual({ enabled: false, policyPending: true, queued: 0 })
  expect(events).toEqual(["in-app"])
})

test("enabled delivery retains the policy-before-dispatch order and queue count", async () => {
  const events: string[] = []
  expect(
    await runManualPaymentAlertJobs({
      externalDeliveryEnabled: true,
      queuePolicyChange: async () => {
        events.push("policy")
        return false
      },
      queueExternalAlerts: async () => {
        events.push("external")
        return 3
      },
    }),
  ).toEqual({ policyPending: false, queued: 3 })
  expect(events).toEqual(["policy", "external"])
})

test("policy continuation keeps the same claim and bounds each invocation to three pages", async () => {
  const claim = { revision: 4, claimId: "existing-claim" }
  const pages: Array<typeof claim & { limit: number }> = []
  const continuations: Array<typeof claim> = []
  const result = await runManualPaymentPolicyChange(claim, {
    claim: async () => {
      throw new Error("Must not replace an existing claim")
    },
    process: async (input) => {
      pages.push(input)
      return { completed: false }
    },
    continue: async (input) => {
      continuations.push(input)
    },
  })
  expect(result).toEqual({ continued: true, revision: 4 })
  expect(pages).toEqual(Array(3).fill({ ...claim, limit: 5 }))
  expect(continuations).toEqual([claim])
})

test("no claimed policy does no page work or continuation", async () => {
  for (const claim of [null, { revision: 1, claimId: null }]) {
    expect(
      await runManualPaymentPolicyChange(
        {},
        {
          claim: async () => claim,
          process: async () => {
            throw new Error("No claim")
          },
          continue: async () => {
            throw new Error("No claim")
          },
        },
      ),
    ).toEqual({ skipped: true })
  }
})
