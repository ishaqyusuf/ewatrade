import { describe, expect, test } from "bun:test"

import {
  buildStoreConversationWhatsAppBridgeMessage,
  buildStoreConversationWhatsAppNavigationUrl,
  executeStoreConversationWhatsAppBridgeNavigation,
  projectStoreConversationWhatsAppAction,
  resolveStoreConversationWhatsAppBridgeClientOperation,
  storeConversationWhatsAppBridgeChoiceLabel,
  storeConversationWhatsAppBridgeRequestKindAction,
} from "./store-conversation-whatsapp-bridge"
import {
  deriveStoreConversationWhatsAppBridgeChoiceToken,
  digestStoreConversationWhatsAppBridgeValue,
  extractStoreConversationWhatsAppBridgeToken,
  isStoreConversationWhatsAppBridgeChoiceCandidate,
  isStoreConversationWhatsAppBridgeMessageCandidate,
  parseStoreConversationWhatsAppBridgeChoiceToken,
  parseStoreConversationWhatsAppBridgeRequestKind,
} from "./store-conversation-whatsapp-bridge-server"

const token = "a".repeat(43)
const secret = "test-secret-with-at-least-thirty-two-characters"

describe("Store Conversation WhatsApp bridge", () => {
  test("builds and extracts only the exact neutral bridge message", () => {
    const message = buildStoreConversationWhatsAppBridgeMessage(token)

    expect(message).toBe(`Continue on EwaTrade: ${token}`)
    expect(extractStoreConversationWhatsAppBridgeToken(message)).toBe(token)
    expect(
      extractStoreConversationWhatsAppBridgeToken(` ${message}`),
    ).toBeNull()
    expect(
      extractStoreConversationWhatsAppBridgeToken(`${message} prescription`),
    ).toBeNull()
    expect(extractStoreConversationWhatsAppBridgeToken("hello")).toBeNull()
    expect(isStoreConversationWhatsAppBridgeMessageCandidate(message)).toBe(
      true,
    )
    expect(
      isStoreConversationWhatsAppBridgeMessageCandidate(
        "Continue on EwaTrade: altered token with spaces",
      ),
    ).toBe(true)
    expect(
      isStoreConversationWhatsAppBridgeChoiceCandidate("ewb1_altered"),
    ).toBe(true)
  })

  test("builds a neutral wa.me URL without product or internal identifiers", () => {
    const navigationUrl = buildStoreConversationWhatsAppNavigationUrl({
      bridgeToken: token,
      displayNumber: "+234 800 000 0000",
    })
    const url = new URL(navigationUrl)

    expect(url.origin).toBe("https://wa.me")
    expect(url.pathname).toBe("/2348000000000")
    expect(url.searchParams.get("text")).toBe(`Continue on EwaTrade: ${token}`)
    expect(navigationUrl).not.toMatch(
      /prescription|request|quote|conversation|customer|tenant|store/i,
    )
  })

  test("rejects invalid navigation numbers", () => {
    expect(() =>
      buildStoreConversationWhatsAppNavigationUrl({
        bridgeToken: token,
        displayNumber: "123",
      }),
    ).toThrow("valid WhatsApp display number")
  })

  test("derives stable, choice-specific opaque capabilities", () => {
    const continueToken = deriveStoreConversationWhatsAppBridgeChoiceToken({
      bridgeId: "bridge_internal_id",
      choice: "continue_current_request",
      revision: 1,
      secret,
    })
    const newRequestToken = deriveStoreConversationWhatsAppBridgeChoiceToken({
      bridgeId: "bridge_internal_id",
      choice: "start_new_request",
      revision: 1,
      secret,
    })

    expect(parseStoreConversationWhatsAppBridgeChoiceToken(continueToken)).toBe(
      continueToken,
    )
    expect(continueToken).not.toBe(newRequestToken)
    expect(continueToken).not.toContain("bridge_internal_id")
    expect(
      digestStoreConversationWhatsAppBridgeValue(continueToken, secret),
    ).toHaveLength(64)
  })

  test("keeps customer choice labels deterministic and explicit", () => {
    expect(
      storeConversationWhatsAppBridgeChoiceLabel("continue_current_request"),
    ).toBe("Continue where I stopped")
    expect(
      storeConversationWhatsAppBridgeChoiceLabel("start_new_request"),
    ).toBe("Start a new request")
  })

  test("uses one explicit typed intake action after Start a new request", () => {
    expect(
      parseStoreConversationWhatsAppBridgeRequestKind("intent:product"),
    ).toBe("commerce_inquiry")
    expect(
      parseStoreConversationWhatsAppBridgeRequestKind("Product request"),
    ).toBeNull()
    expect(
      storeConversationWhatsAppBridgeRequestKindAction("commerce_inquiry"),
    ).toEqual({ id: "intent:product", title: "Product request" })
  })

  test("keeps one caller-staged operation across retry and rotates it across scope", () => {
    let sequence = 0
    const createId = () => `operation-${++sequence}`
    const createToken = () => `${String(++sequence).padStart(43, "a")}`
    const first = resolveStoreConversationWhatsAppBridgeClientOperation({
      createId,
      createToken,
      current: null,
      scope: "guest:entry-1:conversation-1",
    })
    const replay = resolveStoreConversationWhatsAppBridgeClientOperation({
      createId,
      createToken,
      current: first,
      scope: "guest:entry-1:conversation-1",
    })
    const nextScope = resolveStoreConversationWhatsAppBridgeClientOperation({
      createId,
      createToken,
      current: first,
      scope: "guest:entry-2:conversation-2",
    })

    expect(replay).toBe(first)
    expect(nextScope).not.toEqual(first)
    expect(nextScope.scope).toBe("guest:entry-2:conversation-2")
  })

  test("issues before external navigation and never navigates after issue failure", async () => {
    const order: string[] = []
    const operation = {
      bridgeToken: token,
      clientOperationId: "bridge-operation-0001",
      scope: "guest:entry-1:conversation-1",
    }
    const result = await executeStoreConversationWhatsAppBridgeNavigation({
      issue: async (issued) => {
        order.push(`issue:${issued.clientOperationId}`)
        return {
          expiresAt: new Date("2026-08-16T10:00:00Z"),
          navigationUrl: "https://wa.me/2348000000000?text=neutral",
          replayed: false,
        }
      },
      navigate: async (navigationUrl) => {
        order.push(`navigate:${navigationUrl}`)
      },
      operation,
    })

    expect(result.replayed).toBe(false)
    expect(order).toEqual([
      "issue:bridge-operation-0001",
      "navigate:https://wa.me/2348000000000?text=neutral",
    ])

    order.length = 0
    await expect(
      executeStoreConversationWhatsAppBridgeNavigation({
        issue: async () => {
          order.push("issue")
          throw new Error("safe issue failure")
        },
        navigate: async () => {
          order.push("navigate")
        },
        operation,
      }),
    ).rejects.toThrow("safe issue failure")
    expect(order).toEqual(["issue"])
  })

  test("projects truthful primary, secondary and loading CTA states", () => {
    expect(
      projectStoreConversationWhatsAppAction({
        action: "continue_on_whatsapp",
        opening: false,
      }),
    ).toEqual({ label: "Continue on WhatsApp", primary: true })
    expect(
      projectStoreConversationWhatsAppAction({
        action: "reach_store_faster_on_whatsapp",
        opening: false,
      }),
    ).toEqual({ label: "Reach the Store faster on WhatsApp", primary: false })
    expect(
      projectStoreConversationWhatsAppAction({
        action: "continue_on_whatsapp",
        opening: true,
      }),
    ).toEqual({ label: "Preparing WhatsApp…", primary: true })
  })
})
