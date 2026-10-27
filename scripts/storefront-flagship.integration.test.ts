/**
 * Commerce studio connected acceptance on the verified local QA database.
 *
 *   NODE_ENV=development RUN_DATABASE_INTEGRATION_TESTS=1 \
 *     node scripts/with-workspace-env.mjs bun test ./scripts/storefront-flagship.integration.test.ts
 *
 * Creates one isolated QA business (slug sf-flagship-it-*), exercises the real
 * domain commands and disposes it. No provider, message or payment effect.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHmac, randomUUID } from "node:crypto"
import { prisma } from "@ewatrade/db"
import {
  type StorefrontCustomerError,
  type StorefrontOrderError,
  acceptServiceQuote,
  confirmServiceCommerceBooking,
  confirmStorefrontOrderRequest,
  createServiceCommerceBookingHold,
  declineStorefrontServiceQuote,
  dispatchStorefrontMerchantAlerts,
  getStorefrontCustomerSession,
  getStorefrontOrderReceipt,
  getStorefrontServiceReceipt,
  issueStorefrontServiceQuote,
  linkVerifiedStorefrontRequests,
  listLinkableStorefrontRequests,
  listServiceRequests,
  listStorefrontCustomerOrders,
  openQuoteAccess,
  replyToStorefrontOrderRequest,
  requestStorefrontCustomerOtp,
  reviseServiceCommerceBooking,
  revokeStorefrontCustomerSession,
  submitStorefrontOrderRequest,
  submitStorefrontServiceRequestWithReceipt,
  updateStorefrontOrderRequestDisposition,
  verifyStorefrontCustomerOtp,
  withdrawStorefrontOrderRequest,
} from "@ewatrade/db/queries"
import { listStaffSourceBookingsInTransaction } from "@ewatrade/db/service-booking-read"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const SECRET = "integration-test-secret-integration-test-secret-0123"
const run = randomUUID().slice(0, 8)
const slug = `sf-flagship-it-${run}-qa`
const host = `${slug}.ewatrade-storefront.localhost`
const otherHost = "sf-flagship-single-loaf-qa.ewatrade-storefront.localhost"

type Ctx = {
  tenantId: string
  storeId: string
  ownerId: string
  managerId: string
  offerings: Record<
    string,
    { id: string; itemId: string; price: number | null }
  >
}
const ctx = {} as Ctx

const otp = (codes: string[]) => ({
  name: "test",
  channels: ["email", "whatsapp"] as const,
  deliver: async ({ code }: { code: string }) => {
    codes.push(code)
    return { testCode: code }
  },
})

async function expectCode<T>(promise: Promise<T>, code: string) {
  try {
    await promise
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code)
    return error as StorefrontOrderError & StorefrontCustomerError
  }
  throw new Error(`Expected ${code}`)
}

function order(
  lines: { key: string; quantity: string; price?: number }[],
  extra: Record<string, unknown> = {},
) {
  return {
    clientRequestId: randomUUID(),
    lines: lines.map((line) => ({
      itemId: ctx.offerings[line.key]?.itemId,
      offeringId: ctx.offerings[line.key]?.id,
      quantity: line.quantity,
      observedUnitPriceMinor: line.price ?? ctx.offerings[line.key]?.price ?? 0,
    })),
    customerName: "Integration Customer",
    customerPhone: "08035550100",
    customerEmail: "",
    fulfilment: "pickup",
    ...extra,
  }
}
const submit = (input: unknown, customerId?: string) =>
  submitStorefrontOrderRequest(prisma, input, {
    host,
    receiptSecret: SECRET,
    customerId,
  })

suite("commerce studio storefront (connected)", () => {
  beforeAll(async () => {
    console.log("[it] importing fixture helpers")
    const { createFixture, guard } = await import("./qa-storefront-flagship")
    guard()
    console.log("[it] creating fixture", slug)
    const created = await createFixture({
      slug,
      name: `Integration Shop ${run}`,
      description: "Integration fixture",
      supportPhone: "+2348039990000",
      header: {
        "offer-pickup": true,
        "offer-delivery": true,
        location: "Test",
        hours: "Daily",
      },
      represents: "integration",
      products: [
        {
          name: "Basket",
          unit: "basket",
          options: [{ name: "Basket", priceMinor: 500000, stock: "5" }],
        },
        {
          name: "Rice",
          unit: "kg",
          scale: 1,
          options: [{ name: "Rice kg", priceMinor: 120000, stock: "10" }],
        },
        {
          name: "Untracked",
          unit: "piece",
          options: [{ name: "Untracked piece", priceMinor: 100000 }],
        },
      ],
      services: [
        {
          name: "Repair",
          description: "Fix it",
          options: [
            { name: "Small repair", priceMinor: 300000 },
            { name: "Large repair", priceMinor: null },
          ],
        },
      ],
    })
    console.log("[it] fixture ready")
    ctx.tenantId = created.tenantId
    ctx.storeId = (
      await prisma.store.findFirstOrThrow({
        where: { tenantId: ctx.tenantId },
        select: { id: true },
      })
    ).id
    ctx.ownerId = (
      await prisma.membership.findFirstOrThrow({
        where: { tenantId: ctx.tenantId, role: "OWNER" },
      })
    ).userId
    const manager = await prisma.user.create({
      data: {
        email: `manager+${slug}@storefront-flagship.qa.test`,
        emailVerified: true,
        name: "Manager",
      },
    })
    await prisma.membership.create({
      data: {
        tenantId: ctx.tenantId,
        userId: manager.id,
        role: "MANAGER",
        status: "ACTIVE",
        acceptedAt: new Date(),
      },
    })
    ctx.managerId = manager.id
    const rows = await prisma.sellableOffering.findMany({
      where: { tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        catalogItemId: true,
        fixedPriceMinor: true,
      },
    })
    ctx.offerings = Object.fromEntries(
      rows.map((row) => [
        row.name,
        { id: row.id, itemId: row.catalogItemId, price: row.fixedPriceMinor },
      ]),
    )
  }, 240_000)

  afterAll(async () => {
    console.log("[it] disposing fixture")
    const { disposeFixtures } = await import("./qa-storefront-flagship")
    await disposeFixtures(slug)
    console.log("[it] disposed")
  }, 240_000)

  test("submit creates a pending request with no stock or order effect, and replays safely", async () => {
    const input = order([{ key: "Basket", quantity: "2" }])
    const first = await submit(input)
    expect(first.reference).toMatch(/^R-[2-9A-Z]{6}$/)
    const replay = await submit(input)
    expect(replay).toMatchObject({
      requestId: first.requestId,
      replayed: true,
      receiptToken: first.receiptToken,
    })
    await expectCode(
      submit({ ...input, customerName: "Someone Else" }),
      "REPLAY_MISMATCH",
    )
    const saved = await prisma.storefrontOrderRequest.findUniqueOrThrow({
      where: { id: first.requestId },
      include: { lines: true, alerts: true },
    })
    expect(saved.status).toBe("SUBMITTED")
    expect(saved.customerPhone).toBe("+2348035550100")
    expect(saved.lines).toHaveLength(1)
    expect(saved.alerts).toHaveLength(1)
    expect(
      await prisma.commercialOrder.count({ where: { tenantId: ctx.tenantId } }),
    ).toBe(0)
    expect(
      await prisma.stockReservation.count({
        where: { tenantId: ctx.tenantId },
      }),
    ).toBe(0)
    const receipt = await getStorefrontOrderReceipt(prisma, {
      host,
      token: first.receiptToken,
    })
    expect(receipt?.stage).toBe("received")
    expect(receipt?.customerPhoneMasked).not.toContain("5550100")
    // Another business's host can't open this receipt.
    expect(
      await getStorefrontOrderReceipt(prisma, {
        host: otherHost,
        token: first.receiptToken,
      }),
    ).toBeNull()
    expect(
      await getStorefrontOrderReceipt(prisma, { host, token: "x".repeat(43) }),
    ).toBeNull()
  }, 120_000)

  test("server revalidates price, quantity scale, stock and fulfilment", async () => {
    const stale = await expectCode(
      submit(order([{ key: "Basket", quantity: "1", price: 1 }])),
      "LINES_CHANGED",
    )
    expect(stale.issues[0]).toMatchObject({
      reason: "price_changed",
      currentUnitPriceMinor: 500000,
    })
    await expectCode(
      submit(order([{ key: "Basket", quantity: "1.5" }])),
      "LINES_CHANGED",
    )
    const excessive = await expectCode(
      submit(order([{ key: "Basket", quantity: "6" }])),
      "LINES_CHANGED",
    )
    expect(excessive.issues[0]?.reason).toBe("insufficient_stock")
    for (const quantity of ["0", "-1", "abc", "10000"])
      await expect(
        submit(order([{ key: "Basket", quantity }])),
      ).rejects.toThrow()
    const fractional = await submit(
      order([{ key: "Rice kg", quantity: "2.5" }]),
    )
    expect(fractional.reference).toBeTruthy()
    const empty = order([])
    await expect(submit(empty)).rejects.toThrow()
    // Delivery needs an address (schema), and a pickup-only business refuses delivery.
    await expect(
      submit(
        order([{ key: "Basket", quantity: "1" }], { fulfilment: "delivery" }),
      ),
    ).rejects.toThrow()
    const pickupOnly = await expectCode(
      submitStorefrontOrderRequest(
        prisma,
        order([{ key: "Basket", quantity: "1" }], {
          fulfilment: "delivery",
          deliveryAddress: "1 Somewhere Street",
        }),
        { host: otherHost, receiptSecret: SECRET },
      ),
      "INVALID",
    )
    expect(pickupOnly.field).toBe("fulfilment")
    // Offerings from this business can't be ordered through another business's host.
    const foreign = await expectCode(
      submitStorefrontOrderRequest(
        prisma,
        order([{ key: "Basket", quantity: "1" }]),
        { host: otherHost, receiptSecret: SECRET },
      ),
      "LINES_CHANGED",
    )
    expect(foreign.issues[0]?.reason).toBe("unavailable")
    const unknown = await submit(
      order([{ key: "Untracked piece", quantity: "1" }]),
    )
    const saved = await prisma.storefrontOrderRequestLine.findFirstOrThrow({
      where: { requestId: unknown.requestId },
    })
    expect(saved.observedAvailability).toBe("UNKNOWN")
  }, 120_000)

  test("two staff confirming at once create exactly one Order and one reservation", async () => {
    const request = await submit(
      order([{ key: "Basket", quantity: "2" }], {
        fulfilment: "delivery",
        deliveryAddress: "12 Test Road, Lagos",
      }),
    )
    const scope = (actorUserId: string) => ({
      tenantId: ctx.tenantId,
      storeIds: [ctx.storeId],
      actorUserId,
    })
    await expectCode(
      confirmStorefrontOrderRequest(prisma, scope(ctx.ownerId), {
        requestId: request.requestId,
        expectedRevision: 1,
      }),
      "INVALID",
    )
    const results = await Promise.allSettled([
      confirmStorefrontOrderRequest(prisma, scope(ctx.ownerId), {
        requestId: request.requestId,
        expectedRevision: 1,
        deliveryFeeMinor: 150000,
      }),
      confirmStorefrontOrderRequest(prisma, scope(ctx.managerId), {
        requestId: request.requestId,
        expectedRevision: 1,
        deliveryFeeMinor: 150000,
      }),
    ])
    const fulfilled = results.filter(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<{ orderId: string; replayed: boolean }>[]
    expect(fulfilled.length).toBeGreaterThanOrEqual(1)
    const orderIds = new Set(fulfilled.map((r) => r.value.orderId))
    expect(orderIds.size).toBe(1)
    const saved = await prisma.storefrontOrderRequest.findUniqueOrThrow({
      where: { id: request.requestId },
    })
    expect(saved.status).toBe("CONFIRMED")
    const orders = await prisma.commercialOrder.findMany({
      where: { tenantId: ctx.tenantId },
      select: {
        id: true,
        totalMinor: true,
        serviceChargeMinor: true,
        status: true,
        createdByUserId: true,
      },
    })
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({
      totalMinor: 1150000,
      serviceChargeMinor: 150000,
      status: "CONFIRMED",
    })
    expect([ctx.ownerId, ctx.managerId]).toContain(orders[0]?.createdByUserId)
    const reservations = await prisma.stockReservation.findMany({
      where: { tenantId: ctx.tenantId },
      select: { status: true, enteredQuantity: true },
    })
    expect(reservations).toHaveLength(1)
    expect(reservations[0]?.status).toBe("ACTIVE")
    // A retried confirmation returns the same Order.
    const retry = await confirmStorefrontOrderRequest(
      prisma,
      scope(ctx.ownerId),
      {
        requestId: request.requestId,
        expectedRevision: 1,
        deliveryFeeMinor: 150000,
      },
    )
    expect(retry).toEqual({ orderId: orders[0]?.id, replayed: true })
    const receipt = await getStorefrontOrderReceipt(prisma, {
      host,
      token: request.receiptToken,
    })
    expect(receipt?.stage).toBe("confirmed")
    expect(receipt?.order?.balanceMinor).toBe(1150000)
  }, 180_000)

  test("price change and missing stock are refused at confirmation without partial effects", async () => {
    const scope = {
      tenantId: ctx.tenantId,
      storeIds: [ctx.storeId],
      actorUserId: ctx.ownerId,
    }
    const request = await submit(order([{ key: "Rice kg", quantity: "1" }]))
    await prisma.sellableOffering.update({
      where: { id: ctx.offerings["Rice kg"]?.id },
      data: { fixedPriceMinor: 130000 },
    })
    try {
      const changed = await expectCode(
        confirmStorefrontOrderRequest(prisma, scope, {
          requestId: request.requestId,
          expectedRevision: 1,
        }),
        "PRICE_CHANGED",
      )
      expect(changed.issues[0]?.currentUnitPriceMinor).toBe(130000)
      const accepted = await confirmStorefrontOrderRequest(prisma, scope, {
        requestId: request.requestId,
        expectedRevision: 1,
        acceptCurrentPrices: true,
      })
      const created = await prisma.commercialOrder.findUniqueOrThrow({
        where: { id: accepted.orderId },
      })
      expect(created.totalMinor).toBe(130000)
    } finally {
      await prisma.sellableOffering.update({
        where: { id: ctx.offerings["Rice kg"]?.id },
        data: { fixedPriceMinor: 120000 },
      })
    }
    const untracked = await submit(
      order([{ key: "Untracked piece", quantity: "1" }], {
        customerPhone: "08035550199",
      }),
    )
    const before = await prisma.commercialOrder.count({
      where: { tenantId: ctx.tenantId },
    })
    await expectCode(
      confirmStorefrontOrderRequest(prisma, scope, {
        requestId: untracked.requestId,
        expectedRevision: 1,
      }),
      "STOCK_CONFLICT",
    )
    expect(
      await prisma.commercialOrder.count({ where: { tenantId: ctx.tenantId } }),
    ).toBe(before)
    expect(
      (
        await prisma.storefrontOrderRequest.findUniqueOrThrow({
          where: { id: untracked.requestId },
        })
      ).status,
    ).toBe("SUBMITTED")
  }, 180_000)

  test("decline, ask for information, customer reply, stale reply and withdraw", async () => {
    const scope = {
      tenantId: ctx.tenantId,
      storeIds: [ctx.storeId],
      actorUserId: ctx.ownerId,
    }
    const declined = await submit(
      order([{ key: "Basket", quantity: "1" }], {
        customerPhone: "08035550111",
      }),
    )
    await updateStorefrontOrderRequestDisposition(prisma, scope, {
      requestId: declined.requestId,
      expectedRevision: 1,
      action: "decline",
      message: "We are closed this week.",
      clientMessageId: randomUUID(),
    })
    const declinedReceipt = await getStorefrontOrderReceipt(prisma, {
      host,
      token: declined.receiptToken,
    })
    expect(declinedReceipt).toMatchObject({
      stage: "declined",
      staffResponse: "We are closed this week.",
    })
    await expectCode(
      confirmStorefrontOrderRequest(prisma, scope, {
        requestId: declined.requestId,
        expectedRevision: 2,
      }),
      "INVALID_STATE",
    )

    const asked = await submit(
      order([{ key: "Basket", quantity: "1" }], {
        customerPhone: "08035550112",
      }),
    )
    await updateStorefrontOrderRequestDisposition(prisma, scope, {
      requestId: asked.requestId,
      expectedRevision: 1,
      action: "request_information",
      message: "Which colour?",
      clientMessageId: randomUUID(),
    })
    await expectCode(
      replyToStorefrontOrderRequest(prisma, {
        host,
        token: asked.receiptToken,
        reply: {
          clientMessageId: randomUUID(),
          expectedRevision: 1,
          body: "Blue",
        },
      }),
      "STALE",
    )
    await replyToStorefrontOrderRequest(prisma, {
      host,
      token: asked.receiptToken,
      reply: {
        clientMessageId: randomUUID(),
        expectedRevision: 2,
        body: "Blue please",
      },
    })
    const after = await getStorefrontOrderReceipt(prisma, {
      host,
      token: asked.receiptToken,
    })
    expect(after?.stage).toBe("received")
    expect(after?.messages.map((m) => m.author)).toEqual(["business", "you"])
    // Staff with a stale revision can't decide over the customer's reply.
    await expectCode(
      updateStorefrontOrderRequestDisposition(prisma, scope, {
        requestId: asked.requestId,
        expectedRevision: 2,
        action: "decline",
        message: "No thanks",
        clientMessageId: randomUUID(),
      }),
      "STALE",
    )

    const withdrawn = await submit(
      order([{ key: "Basket", quantity: "1" }], {
        customerPhone: "08035550113",
      }),
    )
    await withdrawStorefrontOrderRequest(prisma, {
      host,
      token: withdrawn.receiptToken,
      request: { expectedRevision: 1 },
    })
    expect(
      (
        await getStorefrontOrderReceipt(prisma, {
          host,
          token: withdrawn.receiptToken,
        })
      )?.stage,
    ).toBe("withdrawn")
    await expectCode(
      withdrawStorefrontOrderRequest(prisma, {
        host,
        token: withdrawn.receiptToken,
        request: { expectedRevision: 2 },
      }),
      "STALE",
    )
  }, 180_000)

  test("per-number submission limit", async () => {
    const phone = "08035550177"
    for (let index = 0; index < 6; index++)
      await submit(
        order([{ key: "Basket", quantity: "1" }], { customerPhone: phone }),
      )
    await expectCode(
      submit(
        order([{ key: "Basket", quantity: "1" }], { customerPhone: phone }),
      ),
      "RATE_LIMITED",
    )
  }, 180_000)

  test("merchant alerts: skipped without consent, retried on provider failure, sent once", async () => {
    const request = await submit(
      order([{ key: "Basket", quantity: "1" }], {
        customerPhone: "08035550144",
      }),
    )
    const alert = await prisma.storefrontMerchantAlert.findFirstOrThrow({
      where: { orderRequestId: request.requestId },
    })
    let calls = 0
    const failing = {
      name: "failing",
      recipientFor: async () => ({ phoneE164: "+2348039990000" }),
      send: async () => {
        calls++
        throw new Error("provider outage")
      },
    }
    await dispatchStorefrontMerchantAlerts(prisma, {
      adapter: failing,
      alertIds: [alert.id],
    })
    let saved = await prisma.storefrontMerchantAlert.findUniqueOrThrow({
      where: { id: alert.id },
    })
    expect(saved).toMatchObject({
      status: "PENDING",
      attemptCount: 1,
      lastError: "provider outage",
    })
    expect(saved.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
    // Request is intact despite the outage.
    expect(
      (
        await prisma.storefrontOrderRequest.findUniqueOrThrow({
          where: { id: request.requestId },
        })
      ).status,
    ).toBe("SUBMITTED")
    const ok = {
      ...failing,
      send: async () => {
        calls++
        return { providerMessageId: "test-1" }
      },
    }
    await dispatchStorefrontMerchantAlerts(prisma, {
      adapter: ok,
      alertIds: [alert.id],
      now: new Date(Date.now() + 3_600_000),
    })
    await dispatchStorefrontMerchantAlerts(prisma, {
      adapter: ok,
      alertIds: [alert.id],
      now: new Date(Date.now() + 7_200_000),
    })
    saved = await prisma.storefrontMerchantAlert.findUniqueOrThrow({
      where: { id: alert.id },
    })
    expect(saved).toMatchObject({ status: "SENT", providerMessageId: "test-1" })
    expect(calls).toBe(2)
    const second = await submit(
      order([{ key: "Basket", quantity: "1" }], {
        customerPhone: "08035550145",
      }),
    )
    const secondAlert = await prisma.storefrontMerchantAlert.findFirstOrThrow({
      where: { orderRequestId: second.requestId },
    })
    await dispatchStorefrontMerchantAlerts(prisma, {
      adapter: null,
      alertIds: [secondAlert.id],
    })
    expect(
      (
        await prisma.storefrontMerchantAlert.findUniqueOrThrow({
          where: { id: secondAlert.id },
        })
      ).status,
    ).toBe("SKIPPED")
  }, 180_000)

  test("service request: preferred date, quote decline, re-quote and staff-recorded acceptance", async () => {
    const form = await prisma.serviceRequestForm.findFirstOrThrow({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    })
    const small = ctx.offerings["Small repair"]
    const large = ctx.offerings["Large repair"]
    if (!small || !large) throw new Error("fixture services missing")
    const base = {
      clientRequestId: randomUUID(),
      formId: form.id,
      itemId: small.itemId,
      offeringId: small.id,
      quantity: "1",
      lines: [
        { offeringId: small.id, quantity: "1" },
        { offeringId: large.id, quantity: "2" },
      ],
      customerName: "Service Customer",
      customerPhone: "08035550155",
      details: "Please call first",
    }
    await expectCode(
      submitStorefrontServiceRequestWithReceipt(
        prisma,
        {
          request: { ...base, clientRequestId: randomUUID() },
          extras: { preferredDate: "2020-01-01" },
        },
        { host, receiptSecret: SECRET },
      ),
      "INVALID",
    )
    const future = new Date(Date.now() + 5 * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const submitted = await submitStorefrontServiceRequestWithReceipt(
      prisma,
      {
        request: base,
        extras: { preferredDate: future, collectionAddress: "4 Test Close" },
      },
      { host, receiptSecret: SECRET },
    )
    const again = await submitStorefrontServiceRequestWithReceipt(
      prisma,
      {
        request: base,
        extras: { preferredDate: future, collectionAddress: "4 Test Close" },
      },
      { host, receiptSecret: SECRET },
    )
    expect(again.reference).toBe(submitted.reference)
    expect(
      await prisma.serviceRequest.count({ where: { tenantId: ctx.tenantId } }),
    ).toBe(1)
    let receipt = await getStorefrontServiceReceipt(prisma, {
      host,
      token: submitted.receiptToken,
      quoteSecret: SECRET,
    })
    expect(receipt).toMatchObject({
      stage: "received",
      preferredDate: future,
      collectionAddress: "4 Test Close",
    })
    expect(
      await getStorefrontServiceReceipt(prisma, {
        host: otherHost,
        token: submitted.receiptToken,
      }),
    ).toBeNull()

    const requestId = (
      await prisma.serviceRequest.findFirstOrThrow({
        where: { tenantId: ctx.tenantId },
      })
    ).id
    const quoteInput = {
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      actorUserId: ctx.ownerId,
      requestId,
      lines: [
        { offeringId: small.id, quantity: "1", unitPriceMinor: 300000 },
        { offeringId: large.id, quantity: "2", unitPriceMinor: 450000 },
      ],
      feeMinor: 100000,
      quoteSecret: SECRET,
    }
    const first = await issueStorefrontServiceQuote(prisma, {
      ...quoteInput,
      clientQuoteId: `it-${randomUUID()}`,
    })
    expect(first.releaseState).toBe("released")
    receipt = await getStorefrontServiceReceipt(prisma, {
      host,
      token: submitted.receiptToken,
      quoteSecret: SECRET,
    })
    expect(receipt?.stage).toBe("quoted")
    expect(receipt?.quote?.totalMinor).toBe(300000 + 900000 + 100000)
    expect(receipt?.quote?.acceptToken).toBeTruthy()
    await declineStorefrontServiceQuote(prisma, {
      host,
      token: submitted.receiptToken,
      versionId: first.versionId as string,
      reason: "Too much",
      clientMessageId: randomUUID(),
    })
    receipt = await getStorefrontServiceReceipt(prisma, {
      host,
      token: submitted.receiptToken,
      quoteSecret: SECRET,
    })
    expect(receipt?.quote?.status).toBe("DECLINED")
    expect(receipt?.quote?.acceptToken).toBeNull()

    const second = await issueStorefrontServiceQuote(prisma, {
      ...quoteInput,
      clientQuoteId: `it-${randomUUID()}`,
      lines: [
        { offeringId: small.id, quantity: "1", unitPriceMinor: 300000 },
        { offeringId: large.id, quantity: "2", unitPriceMinor: 400000 },
      ],
    })
    const context =
      await prisma.storefrontServiceRequestContext.findFirstOrThrow({
        where: { serviceRequestId: requestId },
      })
    expect(context.quoteVersionId).toBe(second.versionId)
    const token = openQuoteAccess(
      context.quoteAccessCiphertext as string,
      SECRET,
    )
    const accepted = await acceptServiceQuote(prisma, {
      acceptanceToken: token as string,
      actorUserId: ctx.ownerId,
      clientAcceptanceId: `it-${randomUUID()}`,
    })
    receipt = await getStorefrontServiceReceipt(prisma, {
      host,
      token: submitted.receiptToken,
      quoteSecret: SECRET,
    })
    expect(receipt?.stage).toBe("confirmed")
    expect(receipt?.order?.totalMinor).toBe(300000 + 800000 + 100000)
    expect((accepted as { orderId: string }).orderId).toBeTruthy()
  }, 240_000)

  test("appointments: scheduled, rescheduled and cancelled bookings show on the receipt; a preferred date stays a preference", async () => {
    const form = await prisma.serviceRequestForm.findFirstOrThrow({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    })
    const small = ctx.offerings["Small repair"]
    if (!small) throw new Error("fixture services missing")
    const preferred = new Date(Date.now() + 5 * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const submitted = await submitStorefrontServiceRequestWithReceipt(
      prisma,
      {
        request: {
          clientRequestId: randomUUID(),
          formId: form.id,
          itemId: small.itemId,
          offeringId: small.id,
          quantity: "1",
          lines: [{ offeringId: small.id, quantity: "1" }],
          customerName: "Appointment Customer",
          customerPhone: "08035550177",
          details: "Hem two trousers",
        },
        extras: { preferredDate: preferred },
      },
      { host, receiptSecret: SECRET },
    )
    const read = () =>
      getStorefrontServiceReceipt(prisma, {
        host,
        token: submitted.receiptToken,
        quoteSecret: SECRET,
      })
    // A preferred date alone is never an appointment.
    expect(await read()).toMatchObject({
      preferredDate: preferred,
      appointment: null,
    })

    const context =
      await prisma.storefrontServiceRequestContext.findFirstOrThrow({
        where: { reference: submitted.reference, tenantId: ctx.tenantId },
        select: { serviceRequestId: true },
      })
    const requestId = context.serviceRequestId
    await issueStorefrontServiceQuote(prisma, {
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      actorUserId: ctx.ownerId,
      requestId,
      clientQuoteId: `it-${randomUUID()}`,
      lines: [{ offeringId: small.id, quantity: "1", unitPriceMinor: 300000 }],
      feeMinor: 0,
      quoteSecret: SECRET,
    })
    const quoted =
      await prisma.storefrontServiceRequestContext.findFirstOrThrow({
        where: { serviceRequestId: requestId },
      })
    const accepted = (await acceptServiceQuote(prisma, {
      acceptanceToken: openQuoteAccess(
        quoted.quoteAccessCiphertext as string,
        SECRET,
      ) as string,
      actorUserId: ctx.ownerId,
      clientAcceptanceId: `it-${randomUUID()}`,
    })) as { orderId: string }
    let receipt = await read()
    expect(receipt?.stage).toBe("confirmed")
    expect(receipt?.appointment).toBeNull()

    const { enableFixtureBookings } = await import("./qa-storefront-flagship")
    await enableFixtureBookings(ctx.tenantId)
    const config = await prisma.serviceBookingOfferingConfig.findFirstOrThrow({
      where: { tenantId: ctx.tenantId, offeringId: small.id },
      select: {
        revision: true,
        resources: { select: { resourceId: true }, take: 1 },
      },
    })
    const resourceId = config.resources[0]?.resourceId as string
    const scope = {
      actorUserId: ctx.ownerId,
      storeId: ctx.storeId,
      tenantId: ctx.tenantId,
    }
    const source = { kind: "service" as const, id: requestId }
    const issueCapabilityToken = (input: object) =>
      createHmac("sha256", SECRET)
        .update(JSON.stringify(input))
        .digest("base64url")
    // Open Mon–Sat 09:00–18:00 Lagos (UTC+1, no DST); 30-minute slots.
    const slot = (daysAhead: number, lagosHour: number) => {
      let day = new Date(Date.now() + daysAhead * 86_400_000)
      if (day.getUTCDay() === 0) day = new Date(day.getTime() + 86_400_000)
      const start = new Date(
        Date.UTC(
          day.getUTCFullYear(),
          day.getUTCMonth(),
          day.getUTCDate(),
          lagosHour - 1,
        ),
      )
      return { start, end: new Date(start.getTime() + 30 * 60_000) }
    }
    const book = async (
      at: { start: Date; end: Date },
      relationships: { quoteVersionId?: string; commercialOrderId?: string },
    ) => {
      const hold = await createServiceCommerceBookingHold(prisma, {
        ...scope,
        clientOperationId: `it-hold-${randomUUID()}`,
        expectedConfigurationRevision: config.revision,
        issueCapabilityToken,
        offeringId: small.id,
        quantity: 1,
        resourceId,
        slotEndAt: at.end,
        slotStartAt: at.start,
        source,
      })
      return confirmServiceCommerceBooking(prisma, {
        ...scope,
        ...relationships,
        clientOperationId: `it-confirm-${randomUUID()}`,
        holdId: hold.id,
        issueCapabilityToken,
        protectRecipient: (value) => `protected:${value.length}`,
        source,
      })
    }

    // Staff schedule the accepted job against its quote and Order.
    const first = slot(2, 10)
    const booking = await book(first, {
      quoteVersionId: quoted.quoteVersionId as string,
      commercialOrderId: accepted.orderId,
    })
    receipt = await read()
    expect(receipt?.appointment).toEqual({
      status: "CONFIRMED",
      startsAt: first.start.toISOString(),
      endsAt: first.end.toISOString(),
      timezone: "Africa/Lagos",
      serviceName: "Repair · Small repair",
    })
    // The preference is kept as the customer's words, separate from the booking.
    expect(receipt?.preferredDate).toBe(preferred)
    expect(receipt?.appointment?.startsAt.slice(0, 10)).not.toBe(preferred)
    const stored = await prisma.serviceBooking.findUniqueOrThrow({
      where: { id: booking.id },
      select: {
        sourceId: true,
        quoteVersionId: true,
        commercialOrderId: true,
        status: true,
        revision: true,
      },
    })
    expect(stored).toEqual({
      sourceId: requestId,
      quoteVersionId: quoted.quoteVersionId,
      commercialOrderId: accepted.orderId,
      status: "CONFIRMED",
      revision: 0,
    })

    // Rescheduling moves the same booking; the receipt follows.
    const moved = slot(3, 14)
    await reviseServiceCommerceBooking(prisma, {
      ...scope,
      bookingId: booking.id,
      clientOperationId: `it-move-${randomUUID()}`,
      expectedRevision: 0,
      issueCapabilityToken,
      newSlotEndAt: moved.end,
      newSlotStartAt: moved.start,
      operation: "reschedule",
      reasonCode: "customer_request",
      resourceId,
    })
    receipt = await read()
    expect(receipt?.appointment).toMatchObject({
      status: "CONFIRMED",
      startsAt: moved.start.toISOString(),
      endsAt: moved.end.toISOString(),
    })

    // Cancelling is shown as cancelled, never as still booked.
    await reviseServiceCommerceBooking(prisma, {
      ...scope,
      bookingId: booking.id,
      clientOperationId: `it-cancel-${randomUUID()}`,
      expectedRevision: 1,
      issueCapabilityToken,
      operation: "cancel",
      reasonCode: "customer_request",
    })
    receipt = await read()
    expect(receipt?.appointment).toMatchObject({
      status: "CANCELLED",
      startsAt: moved.start.toISOString(),
    })
    expect(receipt?.preferredDate).toBe(preferred)

    // A new time booked from a booking link carries only the request as its
    // source (no quote or Order link). The live booking wins over the cancelled one.
    const rebooked = slot(2, 11)
    const second = await book(rebooked, {})
    expect(
      await prisma.serviceBooking.findUniqueOrThrow({
        where: { id: second.id },
        select: { quoteVersionId: true, commercialOrderId: true },
      }),
    ).toEqual({ quoteVersionId: null, commercialOrderId: null })
    receipt = await read()
    expect(receipt?.appointment).toMatchObject({
      status: "CONFIRMED",
      startsAt: rebooked.start.toISOString(),
    })
    expect(
      await prisma.serviceBooking.count({
        where: { tenantId: ctx.tenantId, sourceId: requestId },
      }),
    ).toBe(2)
    // Staff see both bookings with the revision their next command needs.
    const staffList = await prisma.$transaction((tx) =>
      listStaffSourceBookingsInTransaction(tx, {
        ...scope,
        offeringId: small.id,
        sourceId: requestId,
      }),
    )
    expect(
      staffList.map(({ id, status, revision, startAt }) => ({
        id,
        status,
        revision,
        startAt,
      })),
    ).toEqual([
      {
        id: booking.id,
        status: "cancelled",
        revision: 2,
        startAt: moved.start.toISOString(),
      },
      {
        id: second.id,
        status: "confirmed",
        revision: 0,
        startAt: rebooked.start.toISOString(),
      },
    ])
    // Another Offering on the same request lists nothing.
    const other = Object.values(ctx.offerings).find(
      (offering) => offering?.id !== small.id,
    )
    if (other)
      expect(
        await prisma.$transaction((tx) =>
          listStaffSourceBookingsInTransaction(tx, {
            ...scope,
            offeringId: other.id,
            sourceId: requestId,
          }),
        ),
      ).toEqual([])
    // The booking-link picker can tell this request apart by its reference.
    const requests = await listServiceRequests(prisma, {
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
    })
    expect(requests.find((row) => row.id === requestId)?.reference).toBe(
      submitted.reference,
    )
    // Another business's host never sees this receipt or its appointment.
    expect(
      await getStorefrontServiceReceipt(prisma, {
        host: otherHost,
        token: submitted.receiptToken,
      }),
    ).toBeNull()
  }, 240_000)

  test("customer OTP: wrong codes, lockout, resend limit, expiry, sessions and explicit linking", async () => {
    const codes: string[] = []
    const adapter = otp(codes)
    const wrongCode = (c: string) => (c === "000000" ? "111111" : "000000")
    const start = await requestStorefrontCustomerOtp(prisma, {
      host,
      identifier: { channel: "whatsapp", identifier: "08035550100" },
      network: "203.0.113.5",
      secret: SECRET,
      adapter,
    })
    expect(start.destination).toContain("•••")
    await expectCode(
      requestStorefrontCustomerOtp(prisma, {
        host,
        identifier: { channel: "whatsapp", identifier: "08035550100" },
        network: "203.0.113.5",
        secret: SECRET,
        adapter,
      }),
      "RESEND_TOO_SOON",
    )
    const wrong = await expectCode(
      verifyStorefrontCustomerOtp(prisma, {
        host,
        verify: {
          challengeId: start.challengeId,
          code: wrongCode(codes[0] as string),
        },
        secret: SECRET,
      }),
      "WRONG_CODE",
    )
    expect(wrong.attemptsLeft).toBe(4)
    const verified = await verifyStorefrontCustomerOtp(prisma, {
      host,
      verify: { challengeId: start.challengeId, code: codes[0] as string },
      secret: SECRET,
    })
    // A used code never works twice.
    await expectCode(
      verifyStorefrontCustomerOtp(prisma, {
        host,
        verify: { challengeId: start.challengeId, code: codes[0] as string },
        secret: SECRET,
      }),
      "EXPIRED",
    )
    const session = await getStorefrontCustomerSession(prisma, {
      host,
      token: verified.sessionToken,
    })
    expect(session?.customer.phoneE164).toBe("+2348035550100")
    expect(
      await getStorefrontCustomerSession(prisma, {
        host: otherHost,
        token: verified.sessionToken,
      }),
    ).toBeNull()

    // Guest requests from the verified number are only listed, never attached automatically.
    const linkable = await listLinkableStorefrontRequests(prisma, {
      tenantId: ctx.tenantId,
      customerId: verified.customerId,
    })
    expect(linkable.length).toBeGreaterThan(0)
    expect(
      await listStorefrontCustomerOrders(prisma, {
        tenantId: ctx.tenantId,
        customerId: verified.customerId,
      }),
    ).toHaveLength(0)
    const linked = await linkVerifiedStorefrontRequests(prisma, {
      tenantId: ctx.tenantId,
      customerId: verified.customerId,
    })
    expect(linked.linked).toBe(linkable.length)
    expect(
      (
        await listStorefrontCustomerOrders(prisma, {
          tenantId: ctx.tenantId,
          customerId: verified.customerId,
        })
      ).length,
    ).toBeGreaterThan(0)

    // Email identity never sees phone-number requests.
    const email = await requestStorefrontCustomerOtp(prisma, {
      host,
      identifier: { channel: "email", identifier: "Buyer@Example.com" },
      network: "203.0.113.6",
      secret: SECRET,
      adapter,
    })
    const lastCode = codes.at(-1) as string
    for (let attempt = 0; attempt < 4; attempt++)
      await expectCode(
        verifyStorefrontCustomerOtp(prisma, {
          host,
          verify: { challengeId: email.challengeId, code: wrongCode(lastCode) },
          secret: SECRET,
        }),
        "WRONG_CODE",
      )
    await expectCode(
      verifyStorefrontCustomerOtp(prisma, {
        host,
        verify: { challengeId: email.challengeId, code: wrongCode(lastCode) },
        secret: SECRET,
      }),
      "LOCKED",
    )
    await expectCode(
      verifyStorefrontCustomerOtp(prisma, {
        host,
        verify: { challengeId: email.challengeId, code: lastCode },
        secret: SECRET,
      }),
      "LOCKED",
    )
    const emailAgain = await requestStorefrontCustomerOtp(prisma, {
      host,
      identifier: { channel: "email", identifier: "buyer@example.com" },
      network: "203.0.113.6",
      secret: SECRET,
      adapter,
    })
    await prisma.storefrontCustomerOtpChallenge.update({
      where: { id: emailAgain.challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    await expectCode(
      verifyStorefrontCustomerOtp(prisma, {
        host,
        verify: {
          challengeId: emailAgain.challengeId,
          code: codes.at(-1) as string,
        },
        secret: SECRET,
      }),
      "EXPIRED",
    )

    // Provider failure leaves no usable challenge.
    const broken = {
      name: "broken",
      channels: ["email"] as const,
      deliver: async () => {
        throw new Error("down")
      },
    }
    await expectCode(
      requestStorefrontCustomerOtp(prisma, {
        host,
        identifier: { channel: "email", identifier: "other@example.com" },
        network: "203.0.113.7",
        secret: SECRET,
        adapter: broken,
      }),
      "DELIVERY_FAILED",
    )
    await expectCode(
      requestStorefrontCustomerOtp(prisma, {
        host,
        identifier: { channel: "whatsapp", identifier: "08035550100" },
        network: "203.0.113.7",
        secret: SECRET,
        adapter: broken,
      }),
      "CHANNEL_UNAVAILABLE",
    )

    await revokeStorefrontCustomerSession(prisma, {
      token: verified.sessionToken,
    })
    expect(
      await getStorefrontCustomerSession(prisma, {
        host,
        token: verified.sessionToken,
      }),
    ).toBeNull()
    await prisma.storefrontCustomerSession.updateMany({
      where: { customerId: verified.customerId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
  }, 240_000)
})
