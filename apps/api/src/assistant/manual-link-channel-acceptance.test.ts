import { expect, test } from "bun:test"
import { renderWhatsAppActionResultChunks } from "@ewatrade/assistant/channels/action-result"
import {
  type GeneralReceipt,
  generalReceiptSchema,
} from "@ewatrade/assistant/general/contracts"
import { paymentLinkSharing } from "@ewatrade/payments"

const origin = "https://dash.ewatrade.com"
const chat = `${origin}/assistant/c/saved-chat`

function receipt(businessName = "Merchant") {
  const links = Array.from({ length: 5 }, (_, index) => {
    const orderNumber = `ORDER-${index + 1}`
    const url = `${origin}/pay/intent${index + 1}.1793102400000.${"a".repeat(43)}`
    return {
      orderId: `order-${index + 1}`,
      orderNumber,
      customerName: `Customer ${index + 1}`,
      url,
      ...paymentLinkSharing({
        phone: `+234 800 000 000${index}`,
        businessName,
        orderNumber,
        url,
        amountMinor: 10001 + index,
        currencyCode: "NGN",
      }),
      amountMinor: 10001 + index,
      currencyCode: "NGN",
      expiresAt: "2026-10-27T12:00:00.000Z",
    }
  })
  return generalReceiptSchema.parse({
    kind: "payment_links",
    recordId: "saved-batch-command",
    title: "5 payment links created",
    detail: links.map((link) => link.url).join("\n"),
    links,
  }) as Extract<GeneralReceipt, { kind: "payment_links" }>
}

test("five canonical merchant sharing drafts become one overview and five isolated forwardable messages", () => {
  const saved = receipt()
  const chunks = renderWhatsAppActionResultChunks(
    { status: "COMPLETED", receipt: saved },
    chat,
    { paymentOrigin: origin, appOrigin: origin },
  )
  expect(chunks).toHaveLength(6)
  expect(chunks[0]).toContain("no payment was recorded")
  expect(chunks[0]).toContain(chat)
  for (const [index, link] of saved.links.entries()) {
    const individual = chunks[index + 1] ?? ""
    expect(individual).toBe(link.copyText ?? "")
    expect(individual).toContain(`NGN ${((10001 + index) / 100).toFixed(2)}`)
    expect(individual.match(/https:\/\/[^\s]+/g)).toEqual([link.url])
    expect(individual).not.toContain(chat)
    expect(chunks[0]).not.toContain(link.url)
    for (const other of saved.links.filter(
      (row) => row.orderId !== link.orderId,
    )) {
      expect(individual).not.toContain(other.url)
      expect(individual).not.toContain(other.orderNumber)
      expect(individual).not.toContain(other.customerName ?? "")
    }
  }
})

test("short payment paths retain isolated forwardable chunks without admitting arbitrary app routes", () => {
  const saved = receipt()
  const link = saved.links[0]
  if (!link) throw new Error("Missing link")
  const code = "Ab3x9Kp7Lm2Qv8Ts4Wy6ZA"
  const short = `${origin}/p/${code}`
  link.copyText = link.copyText?.replace(link.url, short)
  link.url = short
  expect(
    renderWhatsAppActionResultChunks(
      { status: "COMPLETED", receipt: saved },
      chat,
      { paymentOrigin: origin, appOrigin: origin },
    )[1],
  ).toBe(link.copyText ?? "")
  link.url = `${origin}/p/too-short`
  const refused = renderWhatsAppActionResultChunks(
    { status: "COMPLETED", receipt: saved },
    chat,
    { paymentOrigin: origin, appOrigin: origin },
  )
  expect(refused).toHaveLength(1)
  expect(refused[0]).not.toContain("/p/too-short")
})

test("record text cannot add executable URLs or expose the saved customer phone in a forwardable message", () => {
  const saved = receipt("Merchant https://attacker.test/private?secret=1")
  const chunks = renderWhatsAppActionResultChunks(
    { status: "COMPLETED", receipt: saved },
    "https://attacker.test/assistant/c/foreign",
    { paymentOrigin: `${origin}/`, appOrigin: origin },
  )
  expect(chunks).toHaveLength(6)
  for (const [index, link] of saved.links.entries()) {
    expect(link.whatsappUrl).toStartWith("https://wa.me/234800000000")
    const individual = chunks[index + 1] ?? ""
    expect(individual).not.toContain("attacker.test")
    expect(individual).not.toContain("secret=1")
    expect(individual).not.toContain("234800000000")
    expect(individual).not.toContain("wa.me")
    expect(individual).not.toContain("saved-batch-command")
    expect(individual).not.toContain(link.orderId)
    expect(individual.match(/https:\/\/[^\s]+/g)).toEqual([link.url])
  }
  expect(chunks[0]).not.toContain("attacker.test")
  const noAppOrigin = renderWhatsAppActionResultChunks(
    { status: "COMPLETED", receipt: saved },
    chat,
    { paymentOrigin: origin },
  )
  expect(noAppOrigin[0]).not.toContain(chat)
})

test("a noncanonical payment URL or unavailable trusted origin cannot produce forwardable chunks", () => {
  const saved = receipt()
  for (const url of [
    "https://attacker.test/pay/token",
    `${origin}/pay/token?redirect=evil`,
    `${origin}/pay/token#secret`,
    `${origin}/assistant/c/private`,
    "https://user:password@dash.ewatrade.com/pay/token",
  ]) {
    const changed = {
      ...saved,
      links: saved.links.map((link, index) =>
        index === 0 ? { ...link, url } : link,
      ),
    }
    const chunks = renderWhatsAppActionResultChunks(
      { status: "COMPLETED", receipt: changed },
      chat,
      { paymentOrigin: origin, appOrigin: origin },
    )
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).not.toContain("/pay/")
    expect(chunks[0]).not.toContain("attacker.test")
  }
  expect(
    renderWhatsAppActionResultChunks(
      { status: "COMPLETED", receipt: saved },
      chat,
    ),
  ).toHaveLength(1)
})

test("the assistant refuses a bank that disables transfers and preserves default-method accounts", async () => {
  const { paymentLinksCreate } = await import("./general-payment-links")
  const previous = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "offline-manual-link-acceptance-signing-key"
  let paymentMethods: string[] = ["POS"]
  const ctx = {
    db: {
      commercialOrder: {
        findMany: async () => [
          {
            id: "order-1",
            customerId: null,
            totalMinor: 10000,
            amountPaidMinor: 0,
            paymentStatus: "UNPAID",
            status: "CONFIRMED",
            currencyCode: "NGN",
            orderNumber: "ORDER-1",
            updatedAt: new Date("2026-10-26T00:00:00.000Z"),
            _count: { payments: 0 },
          },
        ],
      },
      financeAccount: {
        findFirst: async () => ({
          id: "bank-1",
          name: "Receiving account",
          bankName: "GTBank",
          bankAccountNumber: "0123456789",
          bankAccountHolder: "Merchant",
          paymentMethods,
        }),
      },
    },
    session: { user: { id: "owner" } },
    tenantContext: {
      tenant: { id: "tenant", dataClassification: "QA" },
      membership: { role: "OWNER" },
      activeStore: { id: "store" },
      staffAccess: { status: "ACTIVE", mode: "LEGACY" },
    },
  } as unknown as import("./general-actions").GeneralTransactionContext
  const payload = {
    action: "payment_links_create" as const,
    orderIds: ["order-1"],
    bankAccountId: "bank-1",
    allowPartial: false,
    lifetimeMinutes: 1440,
  }
  try {
    await expect(
      paymentLinksCreate.validate(ctx, payload, false),
    ).rejects.toThrow("configured receiving bank")
    paymentMethods = []
    const defaultReview = await paymentLinksCreate.review?.(ctx, payload)
    expect(defaultReview?.lines.join("\n")).toContain(
      "ORDER-1 · NGN 100.00 due",
    )
    expect(defaultReview?.presentation?.facts).toContainEqual({
      label: "Bank",
      value: "GTBank · ending 6789",
    })
    paymentMethods = ["BANK_TRANSFER"]
    expect(
      (await paymentLinksCreate.validate(ctx, payload, false))?.revision,
    ).toBeString()
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previous
  }
})
