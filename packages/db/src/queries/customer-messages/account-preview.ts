import { createHash } from "node:crypto"
import {
  type CustomerAccountMessageEventKey,
  buildWhatsAppMessageUrl,
  customerAccountMessageEventKeys,
  customerFirstName,
  customerMessageEvents,
  normalizeWhatsAppPhone,
  renderCustomerMessageTemplate,
  resolveEffectiveMessageTemplate,
} from "@ewatrade/customer-messages"
import { formatMinorMoney } from "@ewatrade/utils"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { getCustomerLedgerAgingInTransaction } from "../customer-ledger/aging"
import { FinanceError } from "../finance/rules"
import {
  CustomerMessageError,
  type CustomerMessageScope,
  customerMessageScope,
  customerMessageTransactionOptions,
} from "./scope"
import { readMessageTemplates } from "./templates"

export type AccountMessagePreviewInput = CustomerMessageScope & {
  accountId: string
  eventKey?: CustomerAccountMessageEventKey
}

/**
 * Account balance reminder or summary for one saved customer. Owner/Admin only:
 * it discloses whole-account amounts. Reads facts and saved wording; it never
 * sends, schedules or records a delivery. Opening WhatsApp is the merchant's act.
 */
export async function previewCustomerAccountMessageInTransaction(
  tx: Prisma.TransactionClient,
  input: AccountMessagePreviewInput,
) {
  const scope = await customerMessageScope(tx, input, true)
  const aging = await getCustomerLedgerAgingInTransaction(tx, input).catch(
    (error: unknown) => {
      if (error instanceof FinanceError)
        throw new CustomerMessageError(
          error.code === "FORBIDDEN" ? "FORBIDDEN" : "NOT_FOUND",
          error.message,
        )
      throw error
    },
  )
  const customer = await tx.customer.findFirstOrThrow({
    where: { id: aging.customerId, tenantId: input.tenantId },
    select: { id: true, name: true, phone: true },
  })
  const owed = BigInt(aging.totalOwedMinor)
  const recommendedEventKey: CustomerAccountMessageEventKey =
    owed > 0n ? "customer.balance_reminder" : "customer.account_summary"
  const eventKey = input.eventKey ?? recommendedEventKey
  const money = (value: string) =>
    formatMinorMoney(Number(value), aging.currencyCode)
  const timeZone = scope.store.tenant.timezone || "Africa/Lagos"
  const day = (value: string) =>
    new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone }).format(
      new Date(value),
    )
  const variables: Record<string, string | undefined> = {
    customer_name: customer.name.trim() || "there",
    customer_first_name: customerFirstName(customer.name) ?? "there",
    business_name: scope.store.tenant.name,
    store_name: scope.store.name,
    amount_owed: money(aging.totalOwedMinor),
    owed_since: aging.oldestOwedAt ? day(aging.oldestOwedAt) : undefined,
    paid_ahead: money(
      BigInt(aging.availableCreditMinor) > 0n
        ? aging.availableCreditMinor
        : "0",
    ),
    statement_date: day(aging.asOf),
  }
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
  const countryCode =
    scope.store.countryCode ??
    scope.store.tenant.countryCode ??
    (timeZone === "Africa/Lagos" && aging.currencyCode === "NGN"
      ? "NG"
      : undefined)
  const phone = customer.phone
    ? normalizeWhatsAppPhone(customer.phone, countryCode)
    : null
  const eligible = eventKey === "customer.account_summary" || owed > 0n
  let state:
    | "ready"
    | "not_composed"
    | "disabled"
    | "no_phone"
    | "invalid_phone"
    | "ineligible"
    | "invalid_message" = "ready"
  let reason: string | null = null
  let message: string | null = null
  let waUrl: string | null = null
  if (!customer.phone?.trim()) {
    state = "no_phone"
    reason = "Add this customer's phone number to message them."
  } else if (!phone) {
    state = "invalid_phone"
    reason = "Check this customer's phone number and country."
  } else if (!eligible) {
    state = "ineligible"
    reason = "This customer owes nothing, so there is nothing to remind."
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
  // Stale-preview check only; never an access grant or delivery token.
  const previewVersion = createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: input.tenantId,
        storeId: input.storeId,
        actorUserId: input.actorUserId,
        accountId: aging.accountId,
        eventKey,
        recipient: phone?.phoneE164 ?? customer.phone,
        variables: { ...variables, statement_date: undefined },
        snapshot: aging.snapshotSequence,
        templateId: template?.id ?? null,
        revision: template?.revision ?? 0,
        enabled: template?.enabled ?? null,
        state,
      }),
    )
    .digest("hex")
  return {
    accountId: aging.accountId,
    customerId: customer.id,
    storeId: input.storeId,
    eventKey,
    recommendedEventKey,
    state,
    reason,
    recipient: {
      name: customer.name,
      phoneDisplay: phone?.display ?? customer.phone,
      phoneE164: phone?.phoneE164 ?? null,
      countryCode,
    },
    amounts: {
      currencyCode: aging.currencyCode,
      totalOwedMinor: aging.totalOwedMinor,
      statementOwedMinor: aging.statementOwedMinor,
      ordersOwedMinor: aging.ordersOwedMinor,
      availableCreditMinor: aging.availableCreditMinor,
      oldestOwedAt: aging.oldestOwedAt,
    },
    template,
    templateScope: effective.scope,
    variables,
    message,
    waUrl,
    canManageTemplates: scope.canManageTemplates,
    canComposeOneOff: Boolean(phone && eligible),
    previewVersion,
    preparedAt: new Date().toISOString(),
    events: customerMessageEvents
      .filter((event) =>
        (customerAccountMessageEventKeys as readonly string[]).includes(
          event.key,
        ),
      )
      .map((event) => {
        const resolved = resolveEffectiveMessageTemplate(
          templates,
          input.storeId,
          event.key,
        )
        return { ...event, state: resolved.state, scope: resolved.scope }
      }),
  }
}

export function previewCustomerAccountMessage(
  db: PrismaClient,
  input: AccountMessagePreviewInput,
) {
  return db.$transaction(
    (tx) => previewCustomerAccountMessageInTransaction(tx, input),
    customerMessageTransactionOptions,
  )
}

export function prepareCustomerAccountMessageOpen(
  db: PrismaClient,
  input: AccountMessagePreviewInput & { previewVersion: string; body: string },
) {
  return db.$transaction(async (tx) => {
    const preview = await previewCustomerAccountMessageInTransaction(tx, input)
    if (preview.previewVersion !== input.previewVersion)
      return { state: "needs_review" as const, preview, waUrl: null }
    if (!preview.canComposeOneOff || !preview.recipient.phoneE164)
      throw new CustomerMessageError(
        "BAD_REQUEST",
        preview.reason ?? "This message cannot be opened.",
      )
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
