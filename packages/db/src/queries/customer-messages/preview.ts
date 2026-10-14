import { createHash } from "node:crypto"
import {
  type CustomerMessageEventKey,
  buildWhatsAppMessageUrl,
  customerMessageEvents,
  normalizeWhatsAppPhone,
  renderCustomerMessageTemplate,
  resolveEffectiveMessageTemplate,
} from "@ewatrade/customer-messages"
import { formatMinorMoney } from "@ewatrade/utils"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { effectiveCommercialAmountPaid } from "../commercial-payments"
import {
  CustomerMessageError,
  type CustomerMessageScope,
  customerMessageScope,
  customerMessageTransactionOptions,
} from "./scope"
import { readMessageTemplates } from "./templates"

export type MessagePreviewInput = CustomerMessageScope & {
  orderId: string
  eventKey?: CustomerMessageEventKey
  sourceId?: string
}

/** This command only reads facts. It never records a manual share or claims delivery. */
export async function previewCustomerMessageInTransaction(
  tx: Prisma.TransactionClient,
  input: MessagePreviewInput,
) {
  const scope = await customerMessageScope(tx, input)
  const order = await tx.commercialOrder.findFirst({
    where: {
      id: input.orderId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      ...(scope.ownOrders ? { createdByUserId: input.actorUserId } : {}),
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      customerName: true,
      customerPhone: true,
      currencyCode: true,
      totalMinor: true,
      creditMinor: true,
      amountPaidMinor: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      lines: {
        orderBy: { createdAt: "asc" },
        take: 4,
        select: {
          quantity: true,
          snapshot: { select: { catalogItemName: true } },
        },
      },
      payments: {
        ...(input.eventKey === "payment.recorded"
          ? { where: { type: "PAYMENT" as const } }
          : input.eventKey === "payment.refund_recorded"
            ? { where: { type: "REFUND" as const } }
            : {}),
        orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
        take: 50,
        select: {
          id: true,
          type: true,
          method: true,
          amountMinor: true,
          recordedAt: true,
        },
      },
      acceptedCommerceQuoteVersion: {
        select: { quote: { select: { sourceType: true } } },
      },
      prescriptionPickupFulfillment: { select: { id: true } },
      prescriptionDeliveryAddress: { select: { id: true } },
      _count: {
        select: {
          payments: true,
          lines: true,
          prescriptionPaymentIntents: true,
        },
      },
    },
  })
  if (!order)
    throw new CustomerMessageError(
      "NOT_FOUND",
      "Commercial Order not found at this Store.",
    )
  if (
    order.acceptedCommerceQuoteVersion?.quote.sourceType ===
      "PRESCRIPTION_REQUEST" ||
    order.prescriptionPickupFulfillment ||
    order.prescriptionDeliveryAddress ||
    order._count.prescriptionPaymentIntents
  )
    throw new CustomerMessageError(
      "FORBIDDEN",
      "Clinical messages require their separately approved channel.",
    )
  const money = (amountMinor: number) =>
    formatMinorMoney(amountMinor, order.currencyCode)
  const paid = effectiveCommercialAmountPaid({
    amountPaidMinor: order.amountPaidMinor,
    paymentCount: order._count.payments,
    paymentStatus: order.paymentStatus,
    totalMinor: order.totalMinor,
  })
  const balance = Math.max(0, order.totalMinor - paid)
  const recommendedEventKey: CustomerMessageEventKey =
    order.status === "CANCELLED"
      ? "order.cancelled"
      : order.status === "COMPLETED"
        ? "order.completed"
        : order.status === "READY_FOR_PICKUP"
          ? "order.ready_for_pickup"
          : order.status === "OUT_FOR_DELIVERY"
            ? "order.out_for_delivery"
            : balance > 0
              ? "order.payment_reminder"
              : "order.recorded"
  const eventKey = input.eventKey ?? recommendedEventKey
  const templates = await readMessageTemplates(tx, input)
  const effective = resolveEffectiveMessageTemplate(
    templates,
    input.storeId,
    eventKey,
  )
  const template =
    templates.find(
      (row) =>
        row.eventKey === eventKey &&
        row.scopeKey === effective.template?.scopeKey,
    ) ?? null
  const date = (value: Date) =>
    new Intl.DateTimeFormat("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: scope.store.tenant.timezone || "Africa/Lagos",
    }).format(value)
  const sourceType =
    eventKey === "payment.recorded"
      ? "PAYMENT"
      : eventKey === "payment.refund_recorded"
        ? "REFUND"
        : null
  const sourceChoices = sourceType
    ? order.payments
        .filter((row) => row.type === sourceType)
        .map((row) => ({
          id: row.id,
          label: `${money(row.amountMinor)} · ${date(row.recordedAt)}`,
          amountMinor: row.amountMinor,
          method: row.method,
          recordedAt: row.recordedAt,
        }))
    : []
  // A selected older record remains addressable; only menu discovery is bounded.
  const source =
    sourceType && input.sourceId
      ? await tx.commercialOrderPayment.findFirst({
          where: {
            id: input.sourceId,
            tenantId: input.tenantId,
            storeId: input.storeId,
            orderId: order.id,
            type: sourceType,
          },
          select: {
            id: true,
            type: true,
            amountMinor: true,
            method: true,
            recordedAt: true,
          },
        })
      : null
  if (input.sourceId && (!sourceType || !source))
    throw new CustomerMessageError(
      "NOT_FOUND",
      "Choose a payment or refund belonging to this Order.",
    )
  if (source && !sourceChoices.some((choice) => choice.id === source.id)) {
    sourceChoices.unshift({
      id: source.id,
      label: `${money(source.amountMinor)} · ${date(source.recordedAt)}`,
      amountMinor: source.amountMinor,
      method: source.method,
      recordedAt: source.recordedAt,
    })
    if (sourceChoices.length > 50) sourceChoices.pop()
  }
  const orderRecorded = !["DRAFT", "PENDING"].includes(order.status)
  const eventEligible = (() => {
    switch (eventKey) {
      case "order.recorded":
        return (
          orderRecorded &&
          !["CANCELLED", "REFUNDED"].includes(order.status) &&
          !(order.creditMinor > 0 && order.totalMinor === 0)
        )
      case "payment.recorded":
        return orderRecorded && source?.type === "PAYMENT"
      case "payment.refund_recorded":
        return orderRecorded && source?.type === "REFUND"
      case "order.payment_reminder":
        return (
          orderRecorded &&
          balance > 0 &&
          !["CANCELLED", "REFUNDED"].includes(order.status)
        )
      case "order.ready_for_pickup":
        return order.status === "READY_FOR_PICKUP"
      case "order.out_for_delivery":
        return order.status === "OUT_FOR_DELIVERY"
      case "order.completed":
        return order.status === "COMPLETED" && Boolean(order.completedAt)
      case "order.cancelled":
        return order.status === "CANCELLED"
    }
  })()
  const variables: Record<string, string | undefined> = {
    customer_name: order.customerName?.trim() || "there",
    customer_first_name: order.customerName?.trim().split(/\s+/)[0] || "there",
    business_name: scope.store.tenant.name,
    store_name: scope.store.name,
    store_phone: scope.store.supportPhone ?? undefined,
    order_number: order.orderNumber,
    order_date: date(order.createdAt),
    order_total: money(order.totalMinor),
    items_summary:
      order.lines
        .slice(0, 3)
        .map(
          (line) =>
            `${line.quantity.toString()} × ${(line.snapshot?.catalogItemName ?? "Item").slice(0, 100)}`,
        )
        .join(", ") +
      (order._count.lines > 3 ? ` and ${order._count.lines - 3} more` : ""),
    order_status: order.status.toLowerCase().replaceAll("_", " "),
    amount_paid:
      source?.type === "PAYMENT" ? money(source.amountMinor) : undefined,
    refund_amount:
      source?.type === "REFUND" ? money(source.amountMinor) : undefined,
    payment_date: source ? date(source.recordedAt) : undefined,
    payment_method: source?.method.toLowerCase().replaceAll("_", " "),
    total_paid: money(paid),
    balance_due: money(balance),
  }
  const countryCode =
    scope.store.countryCode ??
    scope.store.tenant.countryCode ??
    // Only established Nigerian legacy businesses get the local-number default.
    (scope.store.tenant.timezone === "Africa/Lagos" &&
    order.currencyCode === "NGN"
      ? "NG"
      : undefined)
  const phone = order.customerPhone
    ? normalizeWhatsAppPhone(order.customerPhone, countryCode)
    : null
  let state:
    | "ready"
    | "not_composed"
    | "disabled"
    | "no_phone"
    | "invalid_phone"
    | "source_required"
    | "ineligible"
    | "invalid_message" = "ready"
  let reason: string | null = null
  let message: string | null = null
  let waUrl: string | null = null
  if (!order.customerPhone?.trim()) {
    state = "no_phone"
    reason = "This Order has no customer phone number."
  } else if (!phone) {
    state = "invalid_phone"
    reason = "Check this Order's phone number and country before messaging."
  } else if (sourceType && !source) {
    state = sourceChoices.length ? "source_required" : "ineligible"
    reason = sourceChoices.length
      ? "Choose which payment or refund this message describes."
      : sourceType === "REFUND"
        ? "This order has no recorded refund to describe."
        : "This order has no recorded payment to describe."
  } else if (!eventEligible) {
    state = "ineligible"
    reason =
      eventKey === "order.recorded" &&
      order.creditMinor > 0 &&
      order.totalMinor === 0
        ? "This order has been fully credited. Choose a recorded refund or another message."
        : "This message does not apply to the order now."
  } else if (effective.state === "disabled") {
    state = "disabled"
    reason = "This event's saved message is disabled."
  } else if (!template) {
    state = "not_composed"
    reason = "Compose a message for this event."
  } else {
    try {
      message = renderCustomerMessageTemplate(
        eventKey,
        template.body,
        variables,
      )
      waUrl = buildWhatsAppMessageUrl(phone.phoneE164, message)
    } catch (error) {
      state = "invalid_message"
      reason = error instanceof Error ? error.message : "Check this message."
    }
  }
  // Digest is a stale-preview check, never an access grant or delivery token.
  const previewVersion = createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: input.tenantId,
        storeId: input.storeId,
        actorUserId: input.actorUserId,
        orderId: order.id,
        eventKey: eventKey,
        sourceId: input.sourceId ?? null,
        role: scope.member.role,
        ownOrders: scope.ownOrders,
        recipient: phone?.phoneE164 ?? order.customerPhone,
        variables,
        templateId: template?.id ?? null,
        revision: template?.revision ?? 0,
        enabled: template?.enabled ?? null,
        state,
      }),
    )
    .digest("hex")
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    storeId: input.storeId,
    eventKey: eventKey,
    sourceId: source?.id ?? null,
    sourceChoices,
    recommendedEventKey,
    state,
    reason,
    recipient: {
      name: order.customerName,
      phoneDisplay: phone?.display ?? order.customerPhone,
      phoneE164: phone?.phoneE164 ?? null,
      countryCode,
    },
    template,
    templateScope: effective.scope,
    variables,
    message,
    waUrl,
    canManageTemplates: scope.canManageTemplates,
    canComposeOneOff: Boolean(
      phone &&
        eventEligible &&
        (effective.state !== "disabled" || scope.canManageTemplates),
    ),
    previewVersion,
    preparedAt: new Date().toISOString(),
    events: customerMessageEvents.map((event) => {
      const resolved = resolveEffectiveMessageTemplate(
        templates,
        input.storeId,
        event.key,
      )
      return { ...event, state: resolved.state, scope: resolved.scope }
    }),
  }
}

export function previewCustomerMessage(
  db: PrismaClient,
  input: MessagePreviewInput,
) {
  return db.$transaction(
    (tx) => previewCustomerMessageInTransaction(tx, input),
    customerMessageTransactionOptions,
  )
}

export function prepareCustomerMessageOpen(
  db: PrismaClient,
  input: MessagePreviewInput & { previewVersion: string; body: string },
) {
  return db.$transaction(async (tx) => {
    const preview = await previewCustomerMessageInTransaction(tx, input)
    if (preview.previewVersion !== input.previewVersion)
      return { state: "needs_review" as const, preview, waUrl: null }
    if (!preview.canComposeOneOff || !preview.recipient.phoneE164)
      throw new CustomerMessageError(
        "BAD_REQUEST",
        preview.reason ?? "This message cannot be opened.",
      )
    // One-time edits are plain final text, not a second executable template.
    if (!input.body.trim() || Array.from(input.body).length > 1_500)
      throw new CustomerMessageError(
        "BAD_REQUEST",
        "Enter a message of up to 1,500 characters.",
      )
    let waUrl: string
    try {
      waUrl = buildWhatsAppMessageUrl(preview.recipient.phoneE164, input.body)
    } catch (error) {
      throw new CustomerMessageError(
        "BAD_REQUEST",
        error instanceof Error ? error.message : "Check this message.",
      )
    }
    return { state: "ready" as const, preview, waUrl }
  }, customerMessageTransactionOptions)
}
