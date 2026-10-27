import { expect, test } from "bun:test"
import type { z } from "zod"
import {
  renderWhatsAppWorkflowActionResult,
  whatsAppWorkflowActionResultContentSchema,
  whatsAppWorkflowActionResultSchema,
} from "./workflow-action-result"
import type { WhatsAppWorkflowActionSource } from "./workflow-action-review"

const source: WhatsAppWorkflowActionSource = {
  version: "workflow-action-v1",
  purpose: "SETUP",
  conversationId: "saved-chat",
  draftId: "draft",
  draftRevision: 7,
  origin: { tenantId: "tenant", storeId: "store" },
  workflowContextHash: null,
  selection: [
    {
      entityId: "entity",
      key: "customer:amina",
      state: "PROPOSED",
      payloadHash: "a".repeat(64),
      commandHash: "b".repeat(64),
    },
  ],
}
const result = {
  version: "workflow-result-v1",
  purpose: "SETUP",
  conversationId: "saved-chat",
  draftId: "draft",
  results: [
    {
      entityId: "entity",
      key: "customer:amina",
      state: "COMMITTED",
      recordId: "private-record-id",
      kind: "CUSTOMER",
      name: "Amina",
    },
  ],
} satisfies z.input<typeof whatsAppWorkflowActionResultSchema>
test("workflow receipts render immutable canonical outcome names, exact selection and safe purpose-aware continuation", () => {
  const body = renderWhatsAppWorkflowActionResult(source, result, {
    trustedAppOrigin: "https://dash.example.test",
    currentScope: source.origin,
  })
  expect(body).toContain("Saved in EwaTrade: 1 selected record")
  expect(body).toContain("Added customer: Amina")
  expect(body).toContain("setupConversation=saved-chat")
  expect(body).not.toContain("private-record-id")
  expect(body).not.toContain(source.selection[0]?.payloadHash ?? "missing")
  expect(body).not.toContain("approval")
  expect(() =>
    renderWhatsAppWorkflowActionResult(source, {
      ...result,
      conversationId: "foreign",
    }),
  ).toThrow("receipt unavailable")
  expect(() =>
    renderWhatsAppWorkflowActionResult(source, {
      ...result,
      results: [{ ...result.results[0], key: "foreign" }],
    }),
  ).toThrow("receipt unavailable")
})
test("cancellation and partial canonical outcomes never claim unselected or failed records were saved", () => {
  const cancelled = {
    ...result,
    results: [
      { entityId: "entity", key: "customer:amina", state: "CANCELLED" },
    ],
  }
  expect(renderWhatsAppWorkflowActionResult(source, cancelled)).toBe(
    "Workflow review cancelled. No records were added by this confirmation.",
  )
  expect(
    renderWhatsAppWorkflowActionResult(source, {
      ...cancelled,
      results: [
        { ...cancelled.results[0], state: "FAILED", errorCode: "SAFE_CODE" },
      ],
    }),
  ).toContain("No selected records were added")
  expect(
    whatsAppWorkflowActionResultSchema.safeParse({
      ...cancelled,
      results: [{ ...cancelled.results[0], recordId: "wrong" }],
    }).success,
  ).toBe(false)
})
test("queued workflow result content has exact proof identity and refuses credentials or model output", () => {
  const content = {
    type: "workflow_action_result",
    reviewId: "review",
    resultRef: result,
  } satisfies z.input<typeof whatsAppWorkflowActionResultContentSchema>
  expect(whatsAppWorkflowActionResultContentSchema.parse(content)).toEqual(
    content,
  )
  expect(
    whatsAppWorkflowActionResultContentSchema.safeParse({
      ...content,
      reviewId: undefined,
    }).success,
  ).toBe(false)
  for (const extra of [
    { approvalToken: "secret" },
    { code: "a".repeat(43) },
    { modelText: "done" },
  ])
    expect(
      whatsAppWorkflowActionResultContentSchema.safeParse({
        ...content,
        ...extra,
      }).success,
    ).toBe(false)
  expect(
    renderWhatsAppWorkflowActionResult(source, {
      ...result,
      results: [
        { ...result.results[0], name: "https://untrusted.example/confirm" },
      ],
    }),
  ).not.toContain("https://untrusted.example")
})
