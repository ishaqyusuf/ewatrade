import { expect, test } from "bun:test"
import {
  assistantResponseLoginDestination,
  resolveAssistantResponseLink,
} from "./assistant-response-link"
const dashboard = "https://dash.example"
test("trusted HTTPS and Expo-relative response URLs retain exact focus", () => {
  expect(
    resolveAssistantResponseLink(
      `${dashboard}/open/assistant-response/msg_1`,
      dashboard,
    ),
  ).toBe("/assistant-response?messageId=msg_1")
  expect(
    resolveAssistantResponseLink("/open/assistant-response/msg_1", dashboard),
  ).toBe("/assistant-response?messageId=msg_1")
  expect(
    resolveAssistantResponseLink(
      "https://dash.example/base/open/assistant-response/msg_1",
      `${dashboard}/base`,
    ),
  ).toBe("/assistant-response?messageId=msg_1")
})
test("foreign origins, credentials, malformed identities and extra navigation are rejected", () => {
  for (const url of [
    "https://foreign.example/open/assistant-response/msg_1",
    "https://user@dash.example/open/assistant-response/msg_1",
    "http://dash.example/open/assistant-response/msg_1",
    "//dash.example/open/assistant-response/msg_1",
    "/open/assistant-response/msg_1?next=https://foreign.example",
    "/open/assistant-response/msg_1#secret",
    "/open/assistant-response/%2fprivate",
    "/open/assistant-response/../msg_1",
    "ewatrade://foreign/assistant-response/msg_1",
  ])
    expect(resolveAssistantResponseLink(url, dashboard)).toBeNull()
})
test("login continuations allow only the exact response route", () => {
  expect(
    assistantResponseLoginDestination("/assistant-response?messageId=msg_1"),
  ).toBe("/assistant-response?messageId=msg_1")
  for (const value of [
    undefined,
    "/assistant-response?messageId=msg_1&next=evil",
    "https://dash.example/assistant-response?messageId=msg_1",
    "/assistant-response?messageId=../x",
    ["/assistant-response?messageId=msg_1"],
  ])
    expect(assistantResponseLoginDestination(value)).toBeUndefined()
})

test("custom schemes stay in the configured build environment", () => {
  expect(
    resolveAssistantResponseLink(
      "ewatrade-dev://open/assistant-response/msg_1",
      dashboard,
      "ewatrade-dev",
    ),
  ).toBe("/assistant-response?messageId=msg_1")
  expect(
    resolveAssistantResponseLink(
      "ewatrade://open/assistant-response/msg_1",
      dashboard,
      "ewatrade-dev",
    ),
  ).toBeNull()
  expect(
    resolveAssistantResponseLink(
      "ewatrade-dev://open/assistant-response/msg_1",
      dashboard,
    ),
  ).toBeNull()
})
