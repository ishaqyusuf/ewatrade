import type {
  GeneralAction,
  GeneralAnswer,
  GeneralReviewPresentation,
} from "@ewatrade/assistant/general/contracts"
import {
  type ReturnableMovementRecordAction,
  orderReturnableReviewLine,
  resolveReturnableName,
  returnableMovementKindLabels,
} from "@ewatrade/assistant/general/returnables"
import {
  CatalogError,
  type ReturnableBalance,
  listCustomersPage,
  listReturnableBalances,
  listReturnableItems,
  readOrderReturnables,
  recordReturnableMovement,
  resolveOrderScope,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { isLinkedWhatsAppIdentity } from "./channel-principal"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"

type OrderCreate = Extract<GeneralAction, { action: "order_create" }>
type DraftReturnable = NonNullable<OrderCreate["returnables"]>[number]

/** "Egg crate" → "Egg crates" for counts other than one. */
export function returnableCount(quantity: number, name: string) {
  return `${quantity} ${quantity === 1 || /s$/i.test(name) ? name : `${name}s`}`
}

async function heldBy(
  ctx: GeneralTransactionContext,
  customerId: string,
  catalogItemId: string,
) {
  const [row] = await listReturnableBalances(ctx.db, {
    tenantId: requireGeneralScope(ctx).tenantId,
    customerId,
    catalogItemId,
    includeSettled: true,
  })
  return row?.out ?? 0
}

// order_create ---------------------------------------------------------------

/** Binds model-named returnables on a direct order draft to Returnable items. */
export async function bindOrderReturnables(
  ctx: GeneralTransactionContext,
  returnables: OrderCreate["returnables"],
): Promise<OrderCreate["returnables"]> {
  if (!returnables?.length) return returnables
  const items = await listReturnableItems(ctx.db, {
    tenantId: requireGeneralScope(ctx).tenantId,
  })
  return returnables.map((entry) => {
    const saved = entry.catalogItemId
      ? items.find((item) => item.id === entry.catalogItemId)
      : undefined
    if (saved) return { ...entry, name: saved.name }
    const match = resolveReturnableName(entry.name, items)
    return match.status === "resolved"
      ? { ...entry, catalogItemId: match.item.id, name: match.item.name }
      : { name: entry.name, quantity: entry.quantity }
  })
}

/** Current holdings for the review card: "Musa holds 12 → 70". */
export async function orderReturnablesReview(
  ctx: GeneralTransactionContext,
  order: Pick<OrderCreate, "returnables" | "customerId">,
  customerName: string,
) {
  const rows: Array<DraftReturnable & { heldBefore: number }> = []
  if (!order.customerId) return []
  for (const entry of order.returnables ?? [])
    if (entry.catalogItemId)
      rows.push({
        ...entry,
        heldBefore: await heldBy(ctx, order.customerId, entry.catalogItemId),
      })
  return rows.map((row) => ({
    ...row,
    line: orderReturnableReviewLine({ ...row, customerName }),
  }))
}

/** Card section for returnables going out with a new order. */
export function orderReturnablesSection(
  rows: Array<{ name: string; quantity: number; heldBefore: number }>,
  customerName: string,
): NonNullable<GeneralReviewPresentation["sections"]>[number] | null {
  if (!rows.length) return null
  return {
    title: "To come back",
    rows: rows.map((row) => ({
      label: returnableCount(row.quantity, row.name).slice(0, 240),
      value:
        `${customerName} holds ${row.heldBefore} → ${row.heldBefore + row.quantity}`.slice(
          0,
          240,
        ),
    })),
  }
}

// returnable_movement_record -------------------------------------------------

/** Order numbers are saved as ORD-1035; people say "#1035", "1035" or "order 1035". */
function orderNumberCandidates(said: string) {
  const raw = said.trim().replace(/^#/, "").toUpperCase()
  const digits = raw.match(/(\d+)\s*$/)?.[1]
  return [
    ...new Set([
      raw,
      ...(digits
        ? [`ORD-${digits.replace(/^0+(?=\d{3})/, "").padStart(3, "0")}`]
        : []),
    ]),
  ]
}

function refuse(
  message: string,
  code: "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" = "BAD_REQUEST",
): never {
  throw new TRPCError({ code, message })
}

async function resolveCustomer(
  ctx: GeneralTransactionContext,
  tenantId: string,
  name: string,
) {
  const page = await listCustomersPage(ctx.db, {
    tenantId,
    query: name,
    limit: 50,
  })
  const key = name.trim().toLowerCase()
  const exact = page.items.filter(
    (item) => item.name.trim().toLowerCase() === key,
  )
  const candidates = exact.length ? exact : page.items
  if (candidates.length === 1 && candidates[0]) return candidates[0]
  if (!candidates.length)
    refuse(`No saved customer matches “${name}”.`, "NOT_FOUND")
  // Several matches: the one who holds returnables is the one meant.
  const holders = new Set(
    (await listReturnableBalances(ctx.db, { tenantId })).map(
      (row) => row.customerId,
    ),
  )
  const holding = candidates.filter((item) => holders.has(item.id))
  if (holding.length === 1 && holding[0]) return holding[0]
  refuse(
    `More than one customer matches “${name}”: ${candidates
      .slice(0, 4)
      .map((item) => item.name)
      .join(", ")}. Which one?`,
  )
}

/** Resolves names to the saved customer, order and Returnable item, or refuses with the question to ask. */
async function resolveMovement(
  ctx: GeneralTransactionContext,
  payload: ReturnableMovementRecordAction,
) {
  const scope = requireGeneralScope(ctx)
  const visibility = await resolveOrderScope(ctx.db, {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    activeStoreId: scope.storeId,
    userId: scope.userId,
    role: ctx.tenantContext.membership.role,
    allowedStoreIds: ctx.tenantContext.stores.map((store) => store.id),
  })
  let order: {
    id: string
    orderNumber: string
    customerId: string | null
  } | null = null
  if (payload.orderId || payload.orderNumber) {
    order = await ctx.db.commercialOrder.findFirst({
      where: {
        ...visibility,
        ...(payload.orderId
          ? { id: payload.orderId }
          : {
              orderNumber: {
                in: orderNumberCandidates(payload.orderNumber ?? ""),
              },
            }),
      },
      select: { id: true, orderNumber: true, customerId: true },
    })
    if (!order)
      refuse(
        `Order ${payload.orderNumber ?? ""} isn't in your current Store.`.replace(
          "  ",
          " ",
        ),
        "NOT_FOUND",
      )
    if (!order.customerId)
      refuse(
        `${order.orderNumber} has no saved customer, so no returnables went out with it.`,
      )
  }
  const customer = order?.customerId
    ? await ctx.db.customer.findFirst({
        where: { id: order.customerId, tenantId: scope.tenantId },
        select: { id: true, name: true },
      })
    : payload.customerId
      ? await ctx.db.customer.findFirst({
          where: { id: payload.customerId, tenantId: scope.tenantId },
          select: { id: true, name: true },
        })
      : payload.customerName
        ? await resolveCustomer(ctx, scope.tenantId, payload.customerName)
        : null
  if (!customer)
    refuse("Which customer? Send their name or the order number.", "NOT_FOUND")
  if (payload.customerId && order && payload.customerId !== customer.id)
    refuse(
      `${order.orderNumber} belongs to ${customer.name}, not the customer named.`,
    )

  const items = await listReturnableItems(ctx.db, { tenantId: scope.tenantId })
  if (!items.length)
    refuse(
      "No Returnable item is set up yet. Add one (for example Egg crate) first.",
    )
  let item = payload.catalogItemId
    ? items.find((entry) => entry.id === payload.catalogItemId)
    : undefined
  if (payload.catalogItemId && !item)
    refuse("That item isn't set up as Returnable.", "NOT_FOUND")
  if (!item && payload.itemName) {
    const match = resolveReturnableName(payload.itemName, items)
    if (match.status === "resolved") item = match.item
    else if (match.status === "ambiguous")
      refuse(`Which item: ${items.map((entry) => entry.name).join(", ")}?`)
  }
  if (!item && items.length === 1) item = items[0]
  if (!item) {
    // Only what this customer (or order) actually holds can come back.
    const held = (
      await listReturnableBalances(ctx.db, {
        tenantId: scope.tenantId,
        customerId: customer.id,
      })
    ).map((row) => row.catalogItemId)
    const options = items.filter((entry) => held.includes(entry.id))
    if (options.length === 1) item = options[0]
    else
      refuse(
        `Which item: ${(options.length ? options : items)
          .map((entry) => entry.name)
          .join(", ")}?`,
      )
  }
  if (!item) refuse("Which Returnable item?")
  const heldBefore = await heldBy(ctx, customer.id, item.id)
  const onOrder = order
    ? (
        await readOrderReturnables(ctx.db, {
          tenantId: scope.tenantId,
          scope: visibility,
          orderId: order.id,
        })
      ).items.find((entry) => entry.catalogItemId === item.id)
    : undefined
  return { scope, visibility, order, customer, item, heldBefore, onOrder }
}

function heldAfter(
  payload: Pick<ReturnableMovementRecordAction, "kind" | "quantity">,
  before: number,
) {
  return payload.kind === "ISSUED"
    ? before + payload.quantity
    : before - payload.quantity
}

async function current(
  ctx: GeneralTransactionContext,
  payload: ReturnableMovementRecordAction,
) {
  const resolved = await resolveMovement(ctx, payload)
  const { customer, item, heldBefore } = resolved
  if (payload.kind !== "ISSUED" && payload.quantity > heldBefore)
    refuse(
      heldBefore === 0
        ? `${customer.name} holds no ${item.name}s, so none can come back. Nothing was changed.`
        : `${customer.name} holds ${returnableCount(heldBefore, item.name)}, so ${payload.quantity} can't come back. Record ${heldBefore} instead? Nothing was changed.`,
      "CONFLICT",
    )
  return {
    ...resolved,
    // A movement anywhere on this customer's balance makes the review stale.
    target: {
      id: `${customer.id}:${item.id}`,
      revision: String(heldBefore),
    },
  }
}

const headings = {
  RETURNED: "Returned",
  WRITTEN_OFF: "Written off",
  ISSUED: "Went out",
} as const

export const returnableMovementRecord = {
  stale: "This customer's returnables changed. Review it again.",
  unavailable: "Returnables can't be recorded for this right now.",
  // Saves the resolved names and ids, so the card and Confirm match.
  async prepare(ctx, payload) {
    const { customer, item, order } = await resolveMovement(ctx, payload)
    return {
      ...payload,
      customerId: customer.id,
      customerName: customer.name,
      catalogItemId: item.id,
      itemName: item.name,
      ...(order ? { orderId: order.id, orderNumber: order.orderNumber } : {}),
    }
  },
  async validate(ctx, payload) {
    return (await current(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { customer, item, order, heldBefore, onOrder, target } =
      await current(ctx, payload)
    const after = heldAfter(payload, heldBefore)
    const counted = returnableCount(payload.quantity, item.name)
    const verb = returnableMovementKindLabels[payload.kind]
    const lines = [
      `${counted} ${verb}`,
      `Customer: ${customer.name}`,
      ...(order
        ? [
            `Order: ${order.orderNumber} · ${onOrder?.issued ?? 0} went out on this order`,
          ]
        : []),
      `${customer.name} holds: ${heldBefore} → ${after}`,
      ...(payload.kind === "WRITTEN_OFF"
        ? ["To charge for lost items, record a sale."]
        : []),
      ...(payload.note ? [`Note: ${payload.note}`] : []),
      "Records it in Returnables. Stock, sales and payments do not change.",
    ]
    const presentation: GeneralReviewPresentation = {
      summary: {
        party: customer.name.slice(0, 240),
        context: [item.name, order?.orderNumber].filter(Boolean).join(" · "),
        amount: String(payload.quantity),
        amountLabel: verb,
      },
      facts: [
        { label: headings[payload.kind], value: counted.slice(0, 160) },
        {
          label: "Holds",
          value: `${heldBefore} → ${after}`,
        },
        ...(order
          ? [
              {
                label: "On this order",
                value: `${onOrder?.issued ?? 0} went out`,
              },
            ]
          : []),
      ],
      note: [
        payload.kind === "WRITTEN_OFF"
          ? "To charge for lost items, record a sale."
          : null,
        payload.note ? `Note: ${payload.note}` : null,
        "Records it in Returnables. Stock, sales and payments do not change.",
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 800),
    }
    return {
      target,
      lines,
      // WhatsApp reviews are its exact lines; the app draws the card.
      ...(isLinkedWhatsAppIdentity(ctx.session) ? {} : { presentation }),
    }
  },
  async execute(ctx, payload, key) {
    const { scope, visibility, order, customer, item, heldBefore } =
      await current(ctx, payload)
    try {
      await recordReturnableMovement(ctx.db, {
        tenantId: scope.tenantId,
        scope: visibility,
        actorUserId: scope.userId,
        clientMovementId: `assistant:${key}`.slice(0, 160),
        customerId: customer.id,
        catalogItemId: item.id,
        ...(order ? { orderId: order.id } : { storeId: scope.storeId }),
        kind: payload.kind,
        quantity: payload.quantity,
        note: payload.note,
        source: "assistant",
      })
    } catch (error) {
      if (error instanceof CatalogError)
        refuse(
          error.message,
          error.code === "RETURNABLE_OVER_BALANCE" ||
            error.code === "IDEMPOTENCY_MISMATCH"
            ? "CONFLICT"
            : "BAD_REQUEST",
        )
      throw error
    }
    const after = heldAfter(payload, heldBefore)
    return {
      kind: "customer" as const,
      recordId: customer.id,
      title:
        payload.kind === "RETURNED"
          ? "Return recorded"
          : payload.kind === "WRITTEN_OFF"
            ? "Written off"
            : "Recorded as gone out",
      detail: `${returnableCount(payload.quantity, item.name)} · ${customer.name}${order ? ` · ${order.orderNumber}` : ""} · still out ${after}`,
    }
  },
} satisfies GeneralActionAdapter<ReturnableMovementRecordAction>

// readReturnableBalances ------------------------------------------------------

/** Answer cards: one per customer and item still out, or a plain none. */
export function returnableBalanceAnswers(
  rows: ReturnableBalance[],
  input: { customerName?: string; itemName?: string },
  items: ReadonlyArray<{ name: string }>,
): GeneralAnswer[] {
  const asOf = new Date().toISOString()
  const scope = "Current business · all Stores · Returnables ledger"
  if (!items.length)
    return [
      {
        id: `returnables_none_${crypto.randomUUID()}`,
        title: "Returnables",
        value: "Not set up",
        scope,
        asOf,
        summary: "No Returnable item is set up yet.",
        detail:
          "No catalog item has usage Returnable. Offer to add one (product_create with usage RETURNABLE, for example Egg crate counted in crates).",
      },
    ]
  const total = rows.reduce((sum, row) => sum + row.out, 0)
  const filter = [input.customerName, input.itemName]
    .filter(Boolean)
    .join(" · ")
  return [
    {
      id: `returnables_total_${crypto.randomUUID()}`,
      title: input.customerName
        ? `Returnables · ${input.customerName}`
        : "Returnables out",
      value: `${total} out`,
      scope,
      asOf,
      summary: rows.length
        ? `With ${rows.length === 1 ? "1 customer and item" : `${new Set(rows.map((row) => row.customerId)).size} customers`}`
        : "Nothing out",
      detail: `Filter: ${filter || "none"}. Returnable items set up: ${items
        .map((item) => item.name)
        .join(", ")
        .slice(
          0,
          300,
        )}. Outstanding balances only (went out minus returned and written off); zero means nothing is held.`,
    },
    ...rows.slice(0, 10).map((row) => ({
      id: `returnable_${crypto.randomUUID()}`,
      title: row.customerName.slice(0, 160),
      value: returnableCount(row.out, row.itemName).slice(0, 160),
      scope,
      asOf,
      summary: `${row.orderCount === 1 ? "1 order" : `${row.orderCount} orders`}${row.oldestOutAt ? ` · out since ${new Date(row.oldestOutAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}` : ""}`,
      detail: `${row.customerName} still holds ${row.out} ${row.itemName} (customerId ${row.customerId}, catalogItemId ${row.catalogItemId}).`,
    })),
  ]
}

/** Name filters for the read; the ledger itself filters by id. */
export function filterReturnableBalances(
  rows: ReturnableBalance[],
  input: { customerName?: string; itemName?: string },
) {
  const customer = input.customerName?.trim().toLowerCase()
  const items = rows.map((row) => ({
    id: row.catalogItemId,
    name: row.itemName,
  }))
  const item = input.itemName
    ? resolveReturnableName(input.itemName, [
        ...new Map(items.map((entry) => [entry.id, entry])).values(),
      ])
    : null
  return rows.filter(
    (row) =>
      (!customer || row.customerName.toLowerCase().includes(customer)) &&
      (!item ||
        (item.status === "resolved" && item.item.id === row.catalogItemId)),
  )
}
