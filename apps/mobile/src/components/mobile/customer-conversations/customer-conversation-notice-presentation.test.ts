import { describe, expect, test } from "bun:test"

import { projectCustomerConversationNotice } from "./customer-conversation-notice-presentation"

describe("projectCustomerConversationNotice", () => {
  test("presents a foreground Store response as a compact success notice", () => {
    expect(
      projectCustomerConversationNotice({
        message: "New response from the Store. Sound alert is enabled.",
        soundEnabled: true,
        storeName: "Luma Pharmacy",
      }),
    ).toEqual({
      detail: "Sound alert is on",
      dismissLabel: "Dismiss new response notice",
      icon: "CheckCircle2",
      title: "New response from Luma Pharmacy",
      tone: "success",
    })
  })

  test("keeps reconnect recovery truthful and generic notices unchanged", () => {
    expect(
      projectCustomerConversationNotice({
        message: "Reconnecting. Messages already shown remain available.",
        soundEnabled: false,
        storeName: "Luma Pharmacy",
      }),
    ).toEqual({
      detail: "Messages already shown remain available.",
      dismissLabel: "Dismiss reconnecting notice",
      icon: "RefreshCw",
      title: "Reconnecting",
      tone: "muted",
    })

    expect(
      projectCustomerConversationNotice({
        message: "Write your message below to continue with the Store.",
        soundEnabled: false,
        storeName: "Luma Pharmacy",
      }),
    ).toEqual({
      detail: "Write your message below to continue with the Store.",
      dismissLabel: "Dismiss conversation notice",
      icon: "Info",
      title: null,
      tone: "warning",
    })
  })
})
