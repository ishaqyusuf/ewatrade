import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import {
  type FinanceActor,
  assertFinanceManager,
  lockFinanceBook,
} from "../finance/access"
import { FinanceError, financePayloadHash } from "../finance/rules"
import { lockCustomerLedgerAccount } from "./accounts"

/** Same rules as the saved Customer directory (customers.ts). */
function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null
}
function normalizePhone(value: string | null | undefined) {
  return value?.replace(/[^\d+]/g, "") || null
}

const MAX_LINK_ORDERS = 50
const MAX_SCANNED_ORDERS = 500

export type OrderCustomerLinkMatch = "PHONE" | "EMAIL" | "PHONE_AND_EMAIL"

type CustomerContact = {
  id: string
  normalizedPhone: string | null
  normalizedEmail: string | null
}
type OrderContact = {
  customerPhone: string | null
  customerEmail: string | null
}

/**
 * An unlinked Order can be suggested for a saved Customer only when one of its
 * contact values is exactly the Customer's, none contradicts the Customer, and
 * none belongs to a different saved Customer. Names never count.
 */
export function classifyOrderCustomerLink(
  customer: CustomerContact,
  order: OrderContact,
  otherCustomerContacts: { phones: Set<string>; emails: Set<string> },
):
  | { eligible: true; matchedBy: OrderCustomerLinkMatch }
  | { eligible: false; reason: "NO_MATCH" | "CONTACT_CONFLICT" } {
  const phone = normalizePhone(order.customerPhone)
  const email = normalizeEmail(order.customerEmail)
  const phoneMatch = Boolean(phone && phone === customer.normalizedPhone)
  const emailMatch = Boolean(email && email === customer.normalizedEmail)
  if (!phoneMatch && !emailMatch) return { eligible: false, reason: "NO_MATCH" }
  const contradicts =
    (phone && customer.normalizedPhone && phone !== customer.normalizedPhone) ||
    (email && customer.normalizedEmail && email !== customer.normalizedEmail) ||
    (phone && !phoneMatch && otherCustomerContacts.phones.has(phone)) ||
    (email && !emailMatch && otherCustomerContacts.emails.has(email))
  if (contradicts) return { eligible: false, reason: "CONTACT_CONFLICT" }
  return {
    eligible: true,
    matchedBy:
      phoneMatch && emailMatch
        ? "PHONE_AND_EMAIL"
        : phoneMatch
          ? "PHONE"
          : "EMAIL",
  }
}

type MatchedOrderRow = {
  id: string
  orderNumber: string
  storeId: string
  storeName: string
  status: string
  currencyCode: string
  totalMinor: number
  createdAt: Date
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
}

async function readCustomer(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; customerId: string },
) {
  const customer = await tx.customer.findFirst({
    where: { id: input.customerId, tenantId: input.tenantId },
    select: {
      id: true,
      name: true,
      normalizedPhone: true,
      normalizedEmail: true,
    },
  })
  if (!customer)
    throw new FinanceError("NOT_FOUND", "Customer not found in this business.")
  return customer
}

/** Contact values on these Orders that belong to a different saved Customer. */
async function otherCustomerContacts(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; customerId: string; orders: OrderContact[] },
) {
  const phones = [
    ...new Set(
      input.orders
        .map((order) => normalizePhone(order.customerPhone))
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  const emails = [
    ...new Set(
      input.orders
        .map((order) => normalizeEmail(order.customerEmail))
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  if (!phones.length && !emails.length)
    return { phones: new Set<string>(), emails: new Set<string>() }
  const others = await tx.customer.findMany({
    where: {
      tenantId: input.tenantId,
      id: { not: input.customerId },
      OR: [
        ...(phones.length ? [{ normalizedPhone: { in: phones } }] : []),
        ...(emails.length ? [{ normalizedEmail: { in: emails } }] : []),
      ],
    },
    select: { normalizedPhone: true, normalizedEmail: true },
  })
  return {
    phones: new Set(
      others.flatMap((row) =>
        row.normalizedPhone ? [row.normalizedPhone] : [],
      ),
    ),
    emails: new Set(
      others.flatMap((row) =>
        row.normalizedEmail ? [row.normalizedEmail] : [],
      ),
    ),
  }
}

async function readMatchingUnlinkedOrders(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    customer: CustomerContact
    orderIds?: string[]
  },
) {
  const { normalizedPhone: phone, normalizedEmail: email } = input.customer
  const contact = [
    ...(phone
      ? [
          Prisma.sql`regexp_replace(o."customerPhone", '[^0-9+]', '', 'g') = ${phone}`,
        ]
      : []),
    ...(email ? [Prisma.sql`lower(btrim(o."customerEmail")) = ${email}`] : []),
  ]
  if (!contact.length) return []
  return tx.$queryRaw<MatchedOrderRow[]>`
    SELECT o.id, o."orderNumber", o."storeId", s.name AS "storeName",
      o.status::text AS status, o."currencyCode", o."totalMinor", o."createdAt",
      o."customerName", o."customerPhone", o."customerEmail"
    FROM "CommercialOrder" o
    JOIN "Store" s ON s.id = o."storeId"
    WHERE o."tenantId" = ${input.tenantId}
      AND o."customerId" IS NULL
      AND o.status <> 'DRAFT'
      ${input.orderIds ? Prisma.sql`AND o.id IN (${Prisma.join(input.orderIds)})` : Prisma.empty}
      AND (${Prisma.join(contact, " OR ")})
    ORDER BY o."createdAt" ASC, o.id ASC
    LIMIT ${MAX_SCANNED_ORDERS + 1}
  `
}

/**
 * Dry run: earlier unlinked Orders whose phone or email is exactly this saved
 * Customer's. Nothing is written. Conflicting contacts are counted, never offered.
 */
export async function listCustomerOrderLinkSuggestions(
  db: PrismaClient,
  input: FinanceActor & { customerId: string; limit?: number },
) {
  const limit = input.limit ?? MAX_LINK_ORDERS
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LINK_ORDERS)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Suggestion pages hold 1–50 Orders.",
    )
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const customer = await readCustomer(tx, input)
      const rows = await readMatchingUnlinkedOrders(tx, {
        tenantId: input.tenantId,
        customer,
      })
      const scanned = rows.slice(0, MAX_SCANNED_ORDERS)
      const others = await otherCustomerContacts(tx, {
        tenantId: input.tenantId,
        customerId: customer.id,
        orders: scanned,
      })
      const books = await tx.financeBook.findMany({
        where: { tenantId: input.tenantId },
        select: { currencyCode: true, startsAt: true },
      })
      const bookStart = new Map(
        books.map((book) => [book.currencyCode, book.startsAt]),
      )
      const suggested: Array<
        MatchedOrderRow & { matchedBy: OrderCustomerLinkMatch }
      > = []
      let conflictCount = 0
      for (const row of scanned) {
        const result = classifyOrderCustomerLink(customer, row, others)
        if (result.eligible)
          suggested.push({ ...row, matchedBy: result.matchedBy })
        else if (result.reason === "CONTACT_CONFLICT") conflictCount += 1
      }
      return {
        customer: {
          id: customer.id,
          name: customer.name,
          hasContact: Boolean(
            customer.normalizedPhone || customer.normalizedEmail,
          ),
        },
        items: suggested.slice(0, limit).map((row) => {
          const startsAt = bookStart.get(row.currencyCode)
          return {
            orderId: row.id,
            orderNumber: row.orderNumber,
            storeId: row.storeId,
            storeName: row.storeName,
            status: row.status,
            currencyCode: row.currencyCode,
            totalMinor: String(row.totalMinor),
            createdAt: row.createdAt.toISOString(),
            customerName: row.customerName,
            customerPhone: row.customerPhone,
            customerEmail: row.customerEmail,
            matchedBy: row.matchedBy,
            // Linked pre-cutoff Orders block a later starting balance import.
            beforeBooksStart: Boolean(startsAt && row.createdAt <= startsAt),
          }
        }),
        suggestedCount: suggested.length,
        conflictCount,
        /** More than the scan cap matched; link these, then review again. */
        truncated: rows.length > MAX_SCANNED_ORDERS,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}

export type LinkCustomerHistoricalOrdersInput = FinanceActor & {
  customerId: string
  orderIds: string[]
  clientCommandId: string
}

/**
 * Explicit, reviewed apply. Sets Order.customerId on still-unlinked Orders and
 * records who linked them. Posts no charge, payment or journal: unbilled Orders
 * stay off the statement until billing is turned on.
 */
export async function linkCustomerHistoricalOrders(
  db: PrismaClient,
  input: LinkCustomerHistoricalOrdersInput,
) {
  const orderIds = [...new Set(input.orderIds)].sort()
  if (
    !orderIds.length ||
    orderIds.length !== input.orderIds.length ||
    orderIds.length > MAX_LINK_ORDERS ||
    orderIds.some((id) => !id.trim() || id.length > 128) ||
    !input.clientCommandId.trim() ||
    input.clientCommandId.length > 128
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose 1–50 different Orders and keep a stable command identity.",
    )
  const payloadHash = financePayloadHash({
    customerId: input.customerId,
    orderIds,
  })
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const previous = await tx.commercialOrderCustomerLink.findMany({
        where: {
          tenantId: input.tenantId,
          clientCommandId: input.clientCommandId,
        },
        select: { orderId: true, customerId: true, payloadHash: true },
      })
      if (previous.length) {
        if (
          previous.some(
            (row) =>
              row.payloadHash !== payloadHash ||
              row.customerId !== input.customerId,
          )
        )
          throw new FinanceError(
            "CONFLICT",
            "This link command was already used with different Orders.",
          )
        return {
          customerId: input.customerId,
          linkedOrderIds: previous.map((row) => row.orderId).sort(),
          replayed: true as const,
        }
      }
      const customer = await readCustomer(tx, input)
      const planned = await tx.commercialOrder.findMany({
        where: { tenantId: input.tenantId, id: { in: orderIds } },
        select: { currencyCode: true },
      })
      if (planned.length !== orderIds.length)
        throw new FinanceError("NOT_FOUND", "Order not found in this business.")
      // Book → customer account → Orders, the same order every money writer uses.
      const currencies = [
        ...new Set(planned.map((row) => row.currencyCode)),
      ].sort()
      const books = await tx.financeBook.findMany({
        where: { tenantId: input.tenantId, currencyCode: { in: currencies } },
        select: { id: true, currencyCode: true },
        orderBy: { currencyCode: "asc" },
      })
      for (const book of books)
        await lockFinanceBook(tx, { ...input, bookId: book.id })
      const accounts = await tx.customerLedgerAccount.findMany({
        where: {
          tenantId: input.tenantId,
          customerId: customer.id,
          currencyCode: { in: currencies },
        },
        select: { id: true },
        orderBy: { id: "asc" },
      })
      for (const account of accounts)
        await lockCustomerLedgerAccount(tx, { ...input, accountId: account.id })
      await tx.$queryRaw`SELECT id FROM "CommercialOrder" WHERE "tenantId" = ${input.tenantId} AND id IN (${Prisma.join(orderIds)}) ORDER BY id FOR UPDATE`
      const rows = await readMatchingUnlinkedOrders(tx, {
        tenantId: input.tenantId,
        customer,
        orderIds,
      })
      const others = await otherCustomerContacts(tx, {
        tenantId: input.tenantId,
        customerId: customer.id,
        orders: rows,
      })
      const links = rows.flatMap((row) => {
        const result = classifyOrderCustomerLink(customer, row, others)
        return result.eligible
          ? [{ orderId: row.id, matchedBy: result.matchedBy }]
          : []
      })
      if (links.length !== orderIds.length)
        throw new FinanceError(
          "CONFLICT",
          "Some of these Orders were linked or changed. Review the suggestions again.",
        )
      const updated = await tx.commercialOrder.updateMany({
        where: {
          tenantId: input.tenantId,
          id: { in: orderIds },
          customerId: null,
        },
        data: { customerId: customer.id },
      })
      if (updated.count !== orderIds.length)
        throw new FinanceError(
          "CONFLICT",
          "Some of these Orders were linked meanwhile. Review the suggestions again.",
        )
      await tx.commercialOrderCustomerLink.createMany({
        data: links.map((link) => ({
          tenantId: input.tenantId,
          orderId: link.orderId,
          customerId: customer.id,
          clientCommandId: input.clientCommandId,
          payloadHash,
          matchedBy: link.matchedBy,
          actorUserId: input.actorUserId,
        })),
      })
      return {
        customerId: customer.id,
        linkedOrderIds: orderIds,
        replayed: false as const,
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
