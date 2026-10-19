import { expect, test } from "bun:test"
import { whatsAppConnectUrl } from "@ewatrade/assistant/channels/whatsapp"
import {
  canConfirmAssistantWhatsAppLink,
  isAssistantWhatsAppConnectUrl,
  isFreshAssistantWhatsAppLinkStatus,
} from "./link-state"

test("private Connect URL accepts only the intended WhatsApp command and destination shape", () => {
  const url = whatsAppConnectUrl("234800005343", "a".repeat(43))
  expect(isAssistantWhatsAppConnectUrl(url)).toBe(true)
  for (const unsafe of [
    url.replace("wa.me", "wa.me.evil.test"),
    url.replace("https:", "http:"),
    `${url}&other=secret`,
    `${url}#secret`,
    "whatsapp://send?text=Connect",
    "https://wa.me/234800005343?text=123456",
  ])
    expect(isAssistantWhatsAppConnectUrl(unsafe)).toBe(false)
})

test("a retained claimed sender cannot authorize after an error, paused poll or stale cache", () => {
  const ready = {
    isSuccess: true,
    isError: false,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
    dataUpdatedAt: 2000,
  }
  expect(isFreshAssistantWhatsAppLinkStatus(ready, 1000)).toBe(true)
  expect(
    isFreshAssistantWhatsAppLinkStatus(
      { ...ready, isSuccess: false, isError: true },
      1000,
    ),
  ).toBe(false)
  expect(
    isFreshAssistantWhatsAppLinkStatus({ ...ready, isFetching: true }, 1000),
  ).toBe(false)
  expect(
    isFreshAssistantWhatsAppLinkStatus({ ...ready, isPaused: true }, 1000),
  ).toBe(false)
  expect(
    isFreshAssistantWhatsAppLinkStatus(
      { ...ready, isFetchedAfterMount: false },
      1000,
    ),
  ).toBe(false)
  expect(isFreshAssistantWhatsAppLinkStatus(ready, 3000)).toBe(false)
})

test("a claimed sender requires the same live challenge and explicit fresh revision", () => {
  const proof = {
    localId: "challenge",
    remoteId: "challenge",
    state: "awaiting_confirmation",
    revision: 2,
    maskedSender: "+•••5343",
    expiresAt: new Date(2000),
  }
  expect(canConfirmAssistantWhatsAppLink(proof, 1000)).toBe(true)
  expect(canConfirmAssistantWhatsAppLink(proof, 2000)).toBe(false)
  expect(
    canConfirmAssistantWhatsAppLink({ ...proof, remoteId: "old" }, 1000),
  ).toBe(false)
  expect(
    canConfirmAssistantWhatsAppLink({ ...proof, maskedSender: null }, 1000),
  ).toBe(false)
  expect(
    canConfirmAssistantWhatsAppLink(
      { ...proof, state: "awaiting_whatsapp" },
      1000,
    ),
  ).toBe(false)
  expect(
    canConfirmAssistantWhatsAppLink({ ...proof, state: "confirmed" }, 1000),
  ).toBe(false)
})
