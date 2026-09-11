import { describe, expect, test } from "bun:test"

import {
  buildCustomerConversationTimelineItems,
  resolveCustomerConversationHeaderStatus,
  resolveCustomerMessageMeta,
} from "./customer-conversation-detail-presentation"

describe("resolveCustomerConversationHeaderStatus", () => {
  test("summarizes the server-projected active request state", () => {
    expect(
      resolveCustomerConversationHeaderStatus([], { hasMessages: false }),
    ).toBe("New conversation")
    expect(resolveCustomerConversationHeaderStatus([])).toBe(
      "Store conversation",
    )
    expect(
      resolveCustomerConversationHeaderStatus(
        [{ lifecycle: "terminal", status: "converted" }],
        { hasMessages: false },
      ),
    ).toBe("Store conversation")
    expect(
      resolveCustomerConversationHeaderStatus([
        { lifecycle: "active", status: "ready_for_pickup" },
      ]),
    ).toBe("Ready for pickup")
    expect(
      resolveCustomerConversationHeaderStatus([
        { lifecycle: "active", status: "received" },
        { lifecycle: "active", status: "ready_to_quote" },
        { lifecycle: "terminal", status: "converted" },
      ]),
    ).toBe("2 active requests")
  })
})

describe("resolveCustomerMessageMeta", () => {
  test("keeps transport noise out of ẸwáTrade messages and labels WhatsApp", () => {
    const occurredAt = new Date("2026-08-25T08:42:00.000Z")
    expect(
      resolveCustomerMessageMeta({
        authorKind: "customer",
        channel: "mobile",
        locale: "en-US",
        occurredAt,
        storeName: "Luma Pharmacy",
        timeZone: "UTC",
      }),
    ).toBe("8:42 AM")
    expect(
      resolveCustomerMessageMeta({
        authorKind: "store_attendant",
        channel: "mobile",
        locale: "en-US",
        occurredAt,
        storeName: "Luma Pharmacy",
        timeZone: "UTC",
      }),
    ).toBe("Luma Pharmacy · 8:42 AM")
    expect(
      resolveCustomerMessageMeta({
        authorKind: "store_attendant",
        channel: "whatsapp",
        locale: "en-US",
        occurredAt,
        storeName: "Luma Pharmacy",
        timeZone: "UTC",
        whatsAppObservationStatus: "delivered",
      }),
    ).toBe("Luma Pharmacy · Delivered · 8:42 AM")
    expect(
      resolveCustomerMessageMeta({
        authorKind: "customer",
        channel: "whatsapp",
        locale: "en-US",
        occurredAt,
        storeName: "Luma Pharmacy",
        timeZone: "UTC",
        whatsAppObservationStatus: "received",
      }),
    ).toBe("Received · 8:42 AM")
  })
})

describe("buildCustomerConversationTimelineItems", () => {
  test("inserts compact calendar labels without reordering messages", () => {
    const items = buildCustomerConversationTimelineItems({
      locale: "en-US",
      messages: [
        {
          channel: "mobile",
          id: "older",
          occurredAt: new Date("2026-08-24T18:00:00.000Z"),
        },
        {
          channel: "web",
          id: "newer",
          occurredAt: new Date("2026-08-25T08:00:00.000Z"),
        },
      ],
      now: new Date("2026-08-25T12:00:00.000Z"),
      timeZone: "UTC",
    })
    expect(items).toEqual([
      { id: "day:2026-08-24", kind: "day", label: "Yesterday" },
      { id: "message:older", kind: "message", messageId: "older" },
      { id: "day:2026-08-25", kind: "day", label: "Today" },
      { id: "message:newer", kind: "message", messageId: "newer" },
    ])
  })

  test("groups observed WhatsApp runs without changing message order", () => {
    const items = buildCustomerConversationTimelineItems({
      locale: "en-US",
      messages: [
        {
          channel: "mobile",
          id: "ewatrade-before",
          occurredAt: new Date("2026-08-25T08:42:00.000Z"),
        },
        {
          channel: "whatsapp",
          id: "whatsapp-inbound",
          occurredAt: new Date("2026-08-25T08:52:00.000Z"),
        },
        {
          channel: "whatsapp",
          id: "whatsapp-outbound",
          occurredAt: new Date("2026-08-25T08:54:00.000Z"),
        },
        {
          channel: "web",
          id: "ewatrade-after",
          occurredAt: new Date("2026-08-25T08:58:00.000Z"),
        },
      ],
      now: new Date("2026-08-25T12:00:00.000Z"),
      timeZone: "UTC",
    })

    expect(items).toEqual([
      { id: "day:2026-08-25", kind: "day", label: "Today" },
      {
        id: "message:ewatrade-before",
        kind: "message",
        messageId: "ewatrade-before",
      },
      {
        detail: "Only activity ẸwáTrade observed is shown",
        id: "channel:whatsapp:whatsapp-inbound",
        kind: "channel",
        label: "Observed on WhatsApp",
        source: "whatsapp",
      },
      {
        id: "message:whatsapp-inbound",
        kind: "message",
        messageId: "whatsapp-inbound",
      },
      {
        id: "message:whatsapp-outbound",
        kind: "message",
        messageId: "whatsapp-outbound",
      },
      {
        detail: null,
        id: "channel:ewatrade:ewatrade-after",
        kind: "channel",
        label: "Back in ẸwáTrade",
        source: "ewatrade",
      },
      {
        id: "message:ewatrade-after",
        kind: "message",
        messageId: "ewatrade-after",
      },
    ])
  })

  test("keeps channel transitions explicit across calendar boundaries", () => {
    const items = buildCustomerConversationTimelineItems({
      locale: "en-US",
      messages: [
        {
          channel: "whatsapp",
          id: "whatsapp-before-midnight",
          occurredAt: new Date("2026-08-24T23:58:00.000Z"),
        },
        {
          channel: "mobile",
          id: "ewatrade-after-midnight",
          occurredAt: new Date("2026-08-25T00:02:00.000Z"),
        },
      ],
      now: new Date("2026-08-25T12:00:00.000Z"),
      timeZone: "UTC",
    })

    expect(items).toContainEqual({
      detail: null,
      id: "channel:ewatrade:ewatrade-after-midnight",
      kind: "channel",
      label: "Back in ẸwáTrade",
      source: "ewatrade",
    })
  })
})
