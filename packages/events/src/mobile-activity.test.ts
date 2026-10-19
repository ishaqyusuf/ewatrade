import { describe, expect, test } from "bun:test"
import { eventMetadataSchema } from "./event-metadata"
import {
  type MobileActivityInput,
  mobileActivityEvent,
} from "./mobile-activity"

const signals: MobileActivityInput[] = [
  { name: "mobile_sale_started", properties: { category: "quick_sale" } },
  {
    name: "mobile_sale_step_viewed",
    properties: { action: "review", category: "mixed" },
  },
  {
    name: "mobile_sale_submitted",
    properties: { category: "catalog", item_count: 2 },
  },
  {
    name: "mobile_sale_result",
    properties: { category: "catalog", status: "saved" },
  },
  {
    name: "mobile_payment_account_selected",
    properties: { category: "bank_transfer" },
  },
  {
    name: "mobile_stock_reviewed",
    properties: { action: "receipt", category: "shared" },
  },
  {
    name: "mobile_stock_result",
    properties: { action: "count", status: "recorded" },
  },
  {
    name: "mobile_attachment_restricted",
    properties: { category: "service", action: "video" },
  },
  { name: "mobile_upgrade_prompt_action", properties: { action: "ask_owner" } },
  {
    name: "mobile_sync_result",
    properties: { status: "completed", item_count: 4, duration_ms: 800 },
  },
  {
    name: "mobile_offline_review_result",
    properties: { action: "approve", status: "applied" },
  },
]

describe("fixed mobile business activity vocabulary", () => {
  test("all eleven families fit the existing metadata wire contract", () => {
    expect(new Set(signals.map((signal) => signal.name)).size).toBe(11)
    for (const signal of signals) {
      const event = mobileActivityEvent(signal)
      expect(event?.name).toBe(signal.name)
      expect(event?.properties.surface).toBe("mobile")
      expect(eventMetadataSchema.safeParse(event?.properties).success).toBe(
        true,
      )
    }
  })

  test("every family rejects private extras instead of sending a form or partial projection", () => {
    for (const signal of signals) {
      for (const key of [
        "description",
        "amountMinor",
        "moneyAccountId",
        "customerPhone",
        "commandId",
        "url",
        "error",
      ]) {
        expect(
          mobileActivityEvent({
            ...signal,
            properties: { ...signal.properties, [key]: "private value" },
          }),
        ).toBeNull()
      }
      expect(
        mobileActivityEvent({ ...signal, orderId: "private-id" }),
      ).toBeNull()
    }
  })

  test("arbitrary names, strings and numeric payloads are rejected", () => {
    for (const input of [
      { name: "mobile_customer_private_name", properties: {} },
      {
        name: "mobile_stock_reviewed",
        properties: { action: "receipt", category: "private product name" },
      },
      {
        name: "mobile_payment_account_selected",
        properties: { category: "My private bank" },
      },
      {
        name: "mobile_sale_step_viewed",
        properties: { action: "/order/private-id", category: "catalog" },
      },
      {
        name: "mobile_sync_result",
        properties: { status: "completed", item_count: -1, duration_ms: 1 },
      },
      {
        name: "mobile_sync_result",
        properties: {
          status: "completed",
          item_count: 1,
          duration_ms: Number.POSITIVE_INFINITY,
        },
      },
    ])
      expect(mobileActivityEvent(input)).toBeNull()
  })

  test("queued, review-required and uncertain sale results never claim confirmed success", () => {
    for (const status of ["queued", "review_required", "failed", "unknown"]) {
      expect(
        mobileActivityEvent({
          name: "mobile_sale_result",
          properties: { category: "quick_sale", status },
        })?.properties,
      ).toMatchObject({ status, success: false })
    }
    expect(mobileActivityEvent(signals[3])?.properties).toMatchObject({
      status: "saved",
      success: true,
    })
    expect(mobileActivityEvent(signals[0])?.properties).not.toHaveProperty(
      "success",
    )
  })
})
