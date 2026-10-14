import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { TRPCError } from "@trpc/server"
import {
  generalStoreSettingsAnswer,
  generalStoreSettingsInput,
  settleSection,
} from "./general-store-settings"

const planError = Object.assign(
  new Error("Order reminders are on paid plans. Upgrade to use them."),
  { code: "PLAN_FEATURE_UNAVAILABLE" },
)

test("each section keeps its own refusal; nothing refused looks like a default", () => {
  expect(settleSection({ status: "fulfilled", value: 1 })).toEqual({
    status: "available",
    value: 1,
  })
  // A plan refusal, directly or wrapped by tRPC, is reported as such.
  expect(
    settleSection({ status: "rejected", reason: planError }),
  ).toMatchObject({ status: "not_on_plan" })
  expect(
    settleSection({
      status: "rejected",
      reason: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: planError,
      }),
    }),
  ).toMatchObject({ status: "not_on_plan" })
  expect(
    settleSection({
      status: "rejected",
      reason: new TRPCError({
        code: "FORBIDDEN",
        message: "Only Owners and Admins can manage Order reminders.",
      }),
    }),
  ).toMatchObject({ status: "not_permitted" })
  // Unexpected failures never leak their message.
  expect(
    settleSection({ status: "rejected", reason: new Error("db password=x") }),
  ).toEqual({
    status: "unavailable",
    reason: "This setting could not be read.",
  })
})

const settings = {
  storeId: "store-a",
  storeName: "Wuse",
  receipts: {
    status: "available" as const,
    value: {
      business: {
        showCustomerName: true,
        showPaymentBreakdown: true,
        thankYouNote: "Thank you for shopping with us.",
      },
      override: {
        showCustomerName: false,
        showPaymentBreakdown: true,
        thankYouNote: "See you soon",
      },
      effective: {
        showCustomerName: false,
        showPaymentBreakdown: true,
        thankYouNote: "See you soon",
      },
      source: "store" as const,
      storeId: "store-a",
      storeName: "Wuse",
      currencyCode: "NGN",
      businessName: "Amina Stores",
    },
  },
  reminders: {
    status: "available" as const,
    value: {
      enabled: true,
      dayBeforeEnabled: true,
      sameDayEnabled: false,
      storeId: "store-a",
      updatedAt: null,
    },
  },
  visibility: {
    status: "available" as const,
    value: {
      id: "store-a",
      name: "Wuse",
      salesRepOrderVisibility: "OWN_SALES" as const,
    },
  },
}

test("the card states the effective settings and where they come from", () => {
  const answer = generalStoreSettingsAnswer(
    settings as never,
    "2026-10-12T12:00:00.000Z",
  )
  expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
  expect(answer.value).toBe("Wuse")
  expect(answer.detail.split("\n")).toEqual([
    'Receipts (this Store\'s own settings): customer name no, payment breakdown yes, note "See you soon".',
    "Order reminders: on (day before yes, same day no) — never changed, using defaults.",
    "Sales reps see only orders they created.",
    "Changes are made from Settings; the assistant only reads them here.",
  ])
})

test("refused parts say why instead of showing values", () => {
  const answer = generalStoreSettingsAnswer({
    ...settings,
    reminders: { status: "not_on_plan", reason: "Upgrade" },
    visibility: { status: "not_permitted", reason: "Owner/Admin" },
  } as never)
  expect(answer.detail).toContain("Order reminders: not included in your plan.")
  expect(answer.detail).toContain(
    "Sales rep order visibility: Owner/Admin only.",
  )
  expect(answer.detail).not.toContain("never changed")
})

test("settings read takes no model-chosen scope and stays planned", () => {
  expect(generalStoreSettingsInput.safeParse({}).success).toBe(true)
  for (const input of [{ storeId: "other" }, { tenantId: "foreign" }])
    expect(generalStoreSettingsInput.safeParse(input).success).toBe(false)
  expect(
    capabilityManifest.find((entry) => entry.id === "settings.store.read"),
  ).toMatchObject({
    mode: "read",
    tool: "readStoreSettings",
    rollout: "planned",
    clients: ["dashboard", "mobile"],
    procedures: [
      "orders.receiptSettings",
      "orders.reminderSettings",
      "stores.orderVisibility",
    ],
  })
})
