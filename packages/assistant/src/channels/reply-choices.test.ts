import { expect, test } from "bun:test"
import { generalAnswerSchema } from "../general/contracts"
import { renderWhatsAppFinalReply } from "./render"
import {
  parseWhatsAppReplyChoiceIntent,
  whatsAppChatChoicesSchema,
  whatsAppChatQuestionSchema,
  whatsAppReplyChoiceButtons,
  whatsAppSavedReplyChoices,
} from "./reply-choices"

const choices = [
  { title: "Two bags", text: "I mean two 50kg bags." },
  { title: "Something else", text: "I meant a different inventory unit." },
]
test("reply choices contain bounded plaintext, never scope, URLs, secrets or confirmation proofs", () => {
  expect(whatsAppChatChoicesSchema.safeParse(choices).success).toBe(true)
  for (const command of [
    "Confirm",
    "Save",
    "Approve",
    "Proceed",
    "Cancel",
    "CONNECT",
    "REGISTER",
    "DISCONNECT",
    "STOP",
    "UNSUBSCRIBE",
    "Menu",
    "Help",
    "New chat",
    "Switch",
    "Switch Store",
  ])
    expect(
      whatsAppChatChoicesSchema.safeParse([{ title: "Choose", text: command }])
        .success,
    ).toBe(false)
  expect(
    whatsAppChatQuestionSchema.safeParse({
      question: "Did you mean two 50kg bags?",
      choices,
    }).success,
  ).toBe(true)
  for (const question of [
    "Send your password",
    "What is your OTP?",
    "Enter the verification code",
    "Provide an API key",
    "Open https://foreign.example",
    "Which\nunit?",
  ])
    expect(
      whatsAppChatQuestionSchema.safeParse({ question, choices }).success,
    ).toBe(false)
  for (const invalid of [
    [{ title: "Bad", text: "my password is secret" }],
    [{ title: "Bad", text: "https://foreign.example" }],
    [{ title: "Bad", text: `Confirm ${"a".repeat(43)}` }],
    [{ title: "Bad", text: "Reply", actorUserId: "admin" }],
    Array.from({ length: 4 }, () => choices[0]),
  ])
    expect(whatsAppChatChoicesSchema.safeParse(invalid).success).toBe(false)
  expect(whatsAppReplyChoiceButtons("saved-outbox", choices)).toEqual([
    { id: "wa-reply:saved-outbox:1", title: "Two bags" },
    { id: "wa-reply:saved-outbox:2", title: "Something else" },
  ])
})
test("native and typed choices require exact provider reply and bounded saved index", () => {
  expect(
    parseWhatsAppReplyChoiceIntent({
      quickActionId: "wa-reply:saved-outbox:2",
      replyToMessageId: "wamid.saved",
    }),
  ).toEqual({
    kind: "reply_choice",
    sourceOutboxId: "saved-outbox",
    index: 2,
    replyToMessageId: "wamid.saved",
  })
  expect(
    parseWhatsAppReplyChoiceIntent({
      quickActionId: "wa-reply:saved-outbox:4",
      replyToMessageId: "wamid.saved",
    }),
  ).toEqual({ kind: "invalid_reply_choice" })
  expect(
    parseWhatsAppReplyChoiceIntent({
      quickActionId: "wa-reply:saved-outbox:1",
    }),
  ).toEqual({ kind: "invalid_reply_choice" })
  expect(
    parseWhatsAppReplyChoiceIntent({
      text: "Choice 1",
      replyToMessageId: "wamid.saved",
    }),
  ).toMatchObject({ kind: "reply_choice", index: 1 })
  expect(parseWhatsAppReplyChoiceIntent({ text: "1" })).toBeNull()
  expect(parseWhatsAppReplyChoiceIntent({ text: "Choice 1" })).toBeNull()
})
test("one saved canonical answer owns native choices and quoted fallback remains visible", () => {
  const data = generalAnswerSchema.parse({
    id: "question",
    title: "Which unit?",
    value: "Choose a unit",
    scope: "Current Store",
    asOf: "2026-10-21T12:00:00.000Z",
    detail: "Please confirm what you meant.",
    chatChoices: choices,
  })
  const parts = [{ type: "data-general-answer", data }]
  expect(whatsAppSavedReplyChoices(parts)).toEqual(choices)
  expect(whatsAppSavedReplyChoices([...parts, ...parts])).toBeUndefined()
  expect(whatsAppSavedReplyChoices([{ type: "text", data }])).toBeUndefined()
  const rendered = renderWhatsAppFinalReply(parts)
  expect(rendered.chunks.join("\n")).toContain("1. Two bags")
  expect(rendered.chunks.join("\n")).toContain("Choice 1")
})
