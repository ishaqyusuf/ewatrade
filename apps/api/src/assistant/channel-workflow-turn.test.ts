import { expect, test } from "bun:test"
import {
  assertChannelProductVoiceInput,
  assertChannelWorkflowConversation,
} from "./channel-workflow-turn"
import {
  createWorkflowAssistantTurn,
  workflowTurnInputSchema,
} from "./workflow-turn"
import { WorkflowTurnError } from "./workflow-turn-contract"

const expected = {
  conversationId: "setup",
  userId: "owner",
  tenantId: "tenant",
  storeId: "store",
  purpose: "SETUP" as const,
}
const conversation = {
  id: "setup",
  ownerUserId: "owner",
  tenantId: "tenant",
  storeId: "store",
  purpose: "SETUP",
  status: "ACTIVE",
  setupDraft: { id: "draft" },
}
test("linked workflow scope never reuses another owner, purpose, Store, closed chat or missing draft", () => {
  expect(() =>
    assertChannelWorkflowConversation(conversation, expected),
  ).not.toThrow()
  for (const patch of [
    { id: "other" },
    { ownerUserId: "other" },
    { tenantId: "other" },
    { storeId: "other" },
    { purpose: "GENERAL" },
    { purpose: "PRODUCT_CREATE" },
    { status: "COMPLETED" },
    { setupDraft: null },
  ])
    expect(() =>
      assertChannelWorkflowConversation(
        { ...conversation, ...patch },
        expected,
      ),
    ).toThrow(WorkflowTurnError)
})

test("Product voice uses the canonical chosen text and original audio provenance, including a corrected transcript", () => {
  const admitted = {
    conversationId: "product",
    requestId: "voice-choice-request",
    userMessageId: "voice-choice-message",
  }
  for (const text of ["Add tea at 100 per Piece", "Change tea price to 125"])
    expect(() =>
      assertChannelProductVoiceInput(
        workflowTurnInputSchema.parse({
          conversationId: admitted.conversationId,
          requestId: admitted.requestId,
          message: {
            id: admitted.userMessageId,
            role: "user",
            parts: [
              { type: "text", text },
              {
                type: "data-setup-attachment",
                data: { attachmentId: "original-reviewed-audio" },
              },
            ],
          },
        }),
        admitted,
        { state: "ready", attachmentId: "original-reviewed-audio", text },
      ),
    ).not.toThrow()
})

test("a claimed audio ID alone cannot promote Product files or bypass the exact admitted review or speech-execution refusal", () => {
  const admitted = {
    conversationId: "product",
    requestId: "voice-choice-request",
    userMessageId: "voice-choice-message",
  }
  const input = workflowTurnInputSchema.parse({
    conversationId: admitted.conversationId,
    requestId: admitted.requestId,
    message: {
      id: admitted.userMessageId,
      role: "user",
      parts: [
        { type: "text", text: "Add tea at 100 per Piece" },
        {
          type: "data-setup-attachment",
          data: { attachmentId: "original-reviewed-audio" },
        },
      ],
    },
  })
  const selected = {
    state: "ready" as const,
    attachmentId: "original-reviewed-audio",
    text: "Add tea at 100 per Piece",
  }
  for (const changed of [
    { ...input, conversationId: "different-product" },
    { ...input, requestId: "different-request" },
    { ...input, message: { ...input.message, id: "different-message" } },
    {
      ...input,
      message: {
        ...input.message,
        parts: [{ type: "text", text: selected.text }],
      },
    },
    {
      ...input,
      message: {
        ...input.message,
        parts: [
          { type: "text", text: selected.text },
          {
            type: "data-setup-attachment",
            data: { attachmentId: "a-photo-or-file" },
          },
        ],
      },
    },
    {
      ...input,
      message: {
        ...input.message,
        parts: [...input.message.parts, ...input.message.parts],
      },
    },
  ])
    expect(() =>
      assertChannelProductVoiceInput(
        workflowTurnInputSchema.parse(changed),
        admitted,
        selected,
      ),
    ).toThrow(WorkflowTurnError)
  for (const unavailable of [
    { state: "cancelled" as const },
    { state: "already_consumed" as const },
  ])
    expect(() =>
      assertChannelProductVoiceInput(input, admitted, unavailable),
    ).toThrow(WorkflowTurnError)
  expect(() =>
    assertChannelProductVoiceInput(input, admitted, {
      ...selected,
      text: "Different original transcript",
    }),
  ).toThrow(WorkflowTurnError)
  const approvalText = "Confirm this product"
  expect(() =>
    assertChannelProductVoiceInput(
      workflowTurnInputSchema.parse({
        ...input,
        message: {
          ...input.message,
          parts: [
            { type: "text", text: approvalText },
            {
              type: "data-setup-attachment",
              data: { attachmentId: selected.attachmentId },
            },
          ],
        },
      }),
      admitted,
      { ...selected, text: approvalText },
    ),
  ).toThrow(WorkflowTurnError)
})

test("shared workflow runner refuses GENERAL or mismatched selected purpose before model/budget access", async () => {
  let modelCalls = 0
  const deps = {
    scope: {
      tenantId: "tenant",
      storeId: "store",
      userId: "owner",
      dataClassification: "QA" as const,
    },
    repository: {
      readConversation: async () => ({ ...conversation, purpose: "GENERAL" }),
    },
    resolveModel: async () => {
      modelCalls++
      return null
    },
  }
  const input = {
    conversationId: "setup",
    requestId: "request-123",
    message: {
      id: "message",
      role: "user",
      parts: [{ type: "text", text: "add all" }],
    },
  }
  await expect(
    createWorkflowAssistantTurn(deps as never, input),
  ).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" })
  await expect(
    createWorkflowAssistantTurn(
      {
        ...deps,
        repository: { readConversation: async () => conversation },
      } as never,
      input,
      { purpose: "PRODUCT_CREATE" },
    ),
  ).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" })
  expect(modelCalls).toBe(0)
})
