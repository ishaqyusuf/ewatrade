import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  advanceAccountPrivacyWorkflow,
  getAccountPrivacyWorkflow,
  nextAccountPrivacyWorkflowStep,
} from "./account-privacy-workflow"

const domains = [
  "MEMBERSHIP",
  "IDENTITY_ACCESS",
  "CONVERSATIONS",
  "PRESCRIPTIONS",
  "COMMERCIAL_RECORDS",
  "SOFTWARE_SUBSCRIPTIONS",
]
const snapshot = {
  status: "PROCESSING",
  accessStatus: "REVOKED",
  domains,
  analyticsEvents: 0,
  conversationAccessRemains: false,
}
test("a received request goes to review rather than erasure", () => {
  expect(
    nextAccountPrivacyWorkflowStep({ ...snapshot, status: "RECEIVED" }),
  ).toBe("BEGIN_REVIEW")
  expect(
    nextAccountPrivacyWorkflowStep({ ...snapshot, accessStatus: "FAILED" }),
  ).toBe("REVOKE_ACCESS")
})
test("positive linked access is removed before identity certification", () => {
  expect(
    nextAccountPrivacyWorkflowStep({
      ...snapshot,
      domains: ["MEMBERSHIP"],
      conversationAccessRemains: true,
    }),
  ).toBe("REVOKE_CONVERSATION_ACCESS")
})
test("analytics, provider review, profile and delivery remain ordered", () => {
  expect(
    nextAccountPrivacyWorkflowStep({ ...snapshot, analyticsEvents: 1 }),
  ).toBe("ERASE_ANALYTICS")
  expect(nextAccountPrivacyWorkflowStep(snapshot)).toBe(
    "REVIEW_EXTERNAL_PROCESSORS",
  )
  expect(
    nextAccountPrivacyWorkflowStep({
      ...snapshot,
      domains: [...domains, "EXTERNAL_PROCESSORS"],
    }),
  ).toBe("MINIMIZE_PROFILE")
  expect(
    nextAccountPrivacyWorkflowStep({
      ...snapshot,
      domains: [...domains, "EXTERNAL_PROCESSORS", "ACCOUNT_PROFILE"],
    }),
  ).toBe("DELIVER_OUTCOME")
  expect(
    nextAccountPrivacyWorkflowStep({
      ...snapshot,
      domains: [
        ...domains,
        "EXTERNAL_PROCESSORS",
        "ACCOUNT_PROFILE",
        "OUTCOME_NOTICE",
      ],
    }),
  ).toBe("COMPLETE")
})
const providers = {
  revokeApple: async () => {
    throw Error("provider must not be called")
  },
  revokeAppleAccess: async () => {
    throw Error("provider must not be called")
  },
  revokeGoogle: async () => {
    throw Error("provider must not be called")
  },
}
function database(
  input: {
    admin?: boolean
    subject?: string
    status?: string
    count?: number
  } = {},
) {
  return {
    user: {
      findUnique: async () => ({ isPlatformAdmin: input.admin ?? true }),
    },
    accountPrivacyRequest: {
      findUnique: async () => ({
        status: input.status ?? "PROCESSING",
        requestKey: "account-deletion:subject",
        userId: "subject",
        verifiedSubjectUserId: input.subject ?? "subject",
        verifiedAt: new Date(0),
        accessRevocation: { status: "REVOKED" },
        domainOutcomes: domains.map((domain) => ({ domain })),
      }),
    },
    assistantConversation: { count: async () => 0 },
    assistantRun: { count: async () => 0 },
    assistantAttachment: { count: async () => 0 },
    assistantUsageEvent: { count: async () => 0 },
    assistantActionProposal: { count: async () => 0 },
    productAnalyticsEvent: { count: async () => input.count ?? 0 },
    storeConversationAccountAccess: { count: async () => 0 },
    $transaction: () => {
      throw Error("mutation must not be called")
    },
  } as unknown as PrismaClient
}
test("workflow inspection denies nonoperators, self-processing, mismatch and terminal requests", async () => {
  const input = { requestId: "request", operatorUserId: "operator" }
  await expect(
    getAccountPrivacyWorkflow(database({ admin: false }), input),
  ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
  await expect(
    getAccountPrivacyWorkflow(database(), {
      ...input,
      operatorUserId: "subject",
    }),
  ).rejects.toMatchObject({ code: "IDENTITY_REVIEW_REQUIRED" })
  await expect(
    getAccountPrivacyWorkflow(database({ subject: "other" }), input),
  ).rejects.toMatchObject({ code: "IDENTITY_REVIEW_REQUIRED" })
  await expect(
    getAccountPrivacyWorkflow(database({ status: "CANCELLED" }), input),
  ).rejects.toMatchObject({ code: "REQUEST_NOT_PROCESSING" })
  const result = await getAccountPrivacyWorkflow(database(), input)
  expect(Object.keys(result)).not.toContain("verifiedSubjectUserId")
  expect(Object.keys(result)).not.toContain("contactEmail")
})
test("advance refuses disabled and stale work without mutation", async () => {
  const previous = process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED
  try {
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "false"
    const input = {
      requestId: "request",
      operatorUserId: "operator",
      expectedStep: "COMPLETE" as const,
    }
    await expect(
      advanceAccountPrivacyWorkflow(database(), input, providers),
    ).rejects.toMatchObject({ code: "DISABLED" })
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
    await expect(
      advanceAccountPrivacyWorkflow(database(), input, providers),
    ).rejects.toMatchObject({ code: "STALE_STEP" })
    await expect(
      advanceAccountPrivacyWorkflow(
        database(),
        { ...input, expectedStep: "REVIEW_EXTERNAL_PROCESSORS" },
        providers,
      ),
    ).rejects.toMatchObject({ code: "DOMAIN_REVIEW_REQUIRED" })
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "ACCOUNT_PRIVACY_PROCESSING_ENABLED")
    else process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = previous
  }
})

test("private assistant data is processed before conversation outcomes, including residual data after an older ledger", () => {
  expect(
    nextAccountPrivacyWorkflowStep({ ...snapshot, privateAssistantRecords: 2 }),
  ).toBe("ERASE_PRIVATE_ASSISTANT")
})
