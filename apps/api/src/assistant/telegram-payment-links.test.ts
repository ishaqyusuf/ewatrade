import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import {
  linkedCapabilityEnabled,
  telegramNativeCapability,
} from "@ewatrade/assistant/channels/policy"

/**
 * Workshop family 18 (payment links) is planned and gated for Telegram. The chat
 * may create or read a link only once the existing release list names it, and it
 * never confirms that money arrived: staff confirm a payment report in signed-in
 * EwaTrade (businessBanking), which no assistant capability reaches.
 */

const paymentLinks = capabilityManifest.filter(({ id }) =>
  id.startsWith("sales.payment_links."),
)

test("payment links stay off in Telegram until the release list names them", () => {
  expect(paymentLinks.map(({ id }) => id)).toEqual([
    "sales.payment_links.read",
    "sales.payment_links.create",
  ])
  for (const capability of paymentLinks) {
    expect(
      linkedCapabilityEnabled(capability, "telegram", {
        ASSISTANT_TELEGRAM_ENABLED: "true",
        ASSISTANT_TELEGRAM_RELEASED_CAPABILITY_IDS: "",
      }),
    ).toBe(false)
    expect(
      linkedCapabilityEnabled(capability, "telegram", {
        ASSISTANT_TELEGRAM_ENABLED: "true",
        ASSISTANT_TELEGRAM_RELEASED_CAPABILITY_IDS: "sales.*,payment_links",
      }),
    ).toBe(false)
  }
})

test("creating a link only creates the link; it never records money", () => {
  const create = paymentLinks.find(({ mode }) => mode === "write")
  expect(create).toMatchObject({
    action: "payment_links_create",
    effect: "record",
    receipt: "payment_links",
    procedures: ["businessBanking.createPaymentLink"],
  })
  // Telegram may only ever offer what WhatsApp offers natively.
  expect(create && telegramNativeCapability(create)).toBe(true)
})

test("no assistant capability can confirm a payment report or claim", () => {
  const banking = capabilityManifest.flatMap(({ procedures }) =>
    procedures.filter((procedure) => procedure.startsWith("businessBanking.")),
  )
  expect([...new Set(banking)].sort()).toEqual([
    "businessBanking.createPaymentLink",
    "businessBanking.linkCandidates",
  ])
  expect(
    capabilityManifest.filter(({ id }) =>
      /payment[_.]?(?:report|claim)|claim/i.test(id),
    ),
  ).toEqual([])
})
