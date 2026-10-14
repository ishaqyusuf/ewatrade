import { z } from "zod"
import {
  type BusinessActivityCategory,
  type BusinessActivityView,
  type BusinessEventCatalogItem,
  type BusinessEventType,
  businessActivityMoneySchema,
  businessEventTypes,
} from "./contracts"

/** Canonical method enums are display labels; custom recorded labels stay intact. */
export function presentBusinessPaymentMethod(method: string) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(method)) return method
  const words = method.replaceAll("_", " ").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Refunds are money out. Keep the recorded payload's exact magnitude immutable. */
export function presentBusinessPaymentAmount(
  amount: NonNullable<BusinessActivityView["amount"]>,
  refund: boolean,
) {
  if (!refund) return amount
  const minor = BigInt(amount.minor)
  return { ...amount, minor: (minor > BigInt(0) ? -minor : minor).toString() }
}

const id = z.string().trim().min(1).max(160)
const label = z.string().trim().min(1).max(240)
const role = z.enum([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CASHIER",
  "OPERATOR",
  "SUPPORT",
  "MEMBER",
])
const roleLabel = (value: z.infer<typeof role>) =>
  value.charAt(0) + value.slice(1).toLowerCase()
const money = businessActivityMoneySchema.refine(
  (amount) => BigInt(amount.minor) >= BigInt(0),
  "A recorded amount cannot be negative.",
)
const orderIdentity = { orderId: id, orderNumber: label }

export const orderRecordedActivityPayload = z
  .object({
    ...orderIdentity,
    customerLabel: label.nullable(),
    amount: money,
    status: label,
  })
  .strict()
export const paymentRecordedActivityPayload = z
  .object({ ...orderIdentity, paymentId: id, method: label, amount: money })
  .strict()
export const staffInvitedActivityPayload = z
  .object({
    invitationId: id,
    commandId: id.nullable().default(null),
    membershipId: id,
    role,
  })
  .strict()
export const staffAcceptedActivityPayload = z
  .object({ membershipId: id, role })
  .strict()
export const financeMovementActivityPayload = z
  .object({
    movementId: id,
    bookId: id,
    movementKind: z.enum([
      "TRANSFER",
      "CONTRIBUTION",
      "WITHDRAWAL",
      "REVERSAL",
    ]),
    amount: money,
    fromAccountLabel: label.nullable(),
    toAccountLabel: label.nullable(),
  })
  .strict()

type Presentation = Pick<
  BusinessActivityView,
  "summary" | "detail" | "subject" | "amount" | "statusAtEvent" | "target"
>
type Handler<Schema extends z.ZodType> = {
  label: string
  description: string
  category: BusinessActivityCategory
  schema: Schema
  present: (payload: z.output<Schema>, actorLabel: string) => Presentation
}
function defineHandler<Schema extends z.ZodType>(handler: Handler<Schema>) {
  return {
    ...handler,
    presentUnknown(payload: unknown, actorLabel: string): Presentation {
      return handler.present(
        handler.schema.parse(payload),
        label.parse(actorLabel),
      )
    },
  }
}

export const implementedBusinessEventHandlers = {
  "order.recorded": defineHandler({
    label: "Order recorded",
    description:
      "A saved order, with its original customer, amount and status.",
    category: "orders",
    schema: orderRecordedActivityPayload,
    present: (payload, actor) => ({
      summary: `${actor} recorded order ${payload.orderNumber}`,
      detail: payload.customerLabel ?? "Walk-in",
      subject: {
        kind: "order",
        id: payload.orderId,
        label: payload.orderNumber,
      },
      amount: payload.amount,
      statusAtEvent: { domain: "order", value: payload.status },
      target: { kind: "order", id: payload.orderId },
    }),
  }),
  "payment.recorded": defineHandler({
    label: "Payment recorded",
    description: "A payment saved against an order.",
    category: "payments",
    schema: paymentRecordedActivityPayload,
    present: (payload, actor) => ({
      summary: `${actor} recorded payment for ${payload.orderNumber}`,
      detail: presentBusinessPaymentMethod(payload.method),
      subject: {
        kind: "order",
        id: payload.orderId,
        label: payload.orderNumber,
      },
      amount: payload.amount,
      statusAtEvent: null,
      target: {
        kind: "payment",
        id: payload.paymentId,
        orderId: payload.orderId,
      },
    }),
  }),
  "payment.refund_recorded": defineHandler({
    label: "Refund recorded",
    description:
      "A refund saved against an order; it is distinct from a return.",
    category: "payments",
    schema: paymentRecordedActivityPayload,
    present: (payload, actor) => ({
      summary: `${actor} recorded refund for ${payload.orderNumber}`,
      detail: presentBusinessPaymentMethod(payload.method),
      subject: {
        kind: "order",
        id: payload.orderId,
        label: payload.orderNumber,
      },
      amount: presentBusinessPaymentAmount(payload.amount, true),
      statusAtEvent: null,
      target: {
        kind: "payment",
        id: payload.paymentId,
        orderId: payload.orderId,
      },
    }),
  }),
  "staff.invited": defineHandler({
    label: "Staff invited",
    description: "A Business member was invited, with the role recorded then.",
    category: "staff",
    schema: staffInvitedActivityPayload,
    present: (payload, actor) => ({
      summary: `${actor} invited a staff member as ${roleLabel(payload.role)}`,
      detail: null,
      subject: { kind: "staff_member", id: payload.membershipId, label: null },
      amount: null,
      statusAtEvent: { domain: "staff", value: "INVITED" },
      target: payload.commandId
        ? { kind: "staff_invitation", id: payload.commandId }
        : { kind: "staff_member", id: payload.membershipId },
    }),
  }),
  "staff.invitation_accepted": defineHandler({
    label: "Invitation accepted",
    description: "A Business member completed their invitation onboarding.",
    category: "staff",
    schema: staffAcceptedActivityPayload,
    present: (payload, actor) => ({
      summary: `${actor} accepted an invitation`,
      detail: roleLabel(payload.role),
      subject: { kind: "staff_member", id: payload.membershipId, label: null },
      amount: null,
      statusAtEvent: { domain: "staff", value: "ACTIVE" },
      target: { kind: "staff_member", id: payload.membershipId },
    }),
  }),
  "finance.movement_recorded": defineHandler({
    label: "Money movement recorded",
    description:
      "A recorded movement of Business money; not a bank-provider delivery claim.",
    category: "finance",
    schema: financeMovementActivityPayload,
    present: (payload, actor) => ({
      summary: `${actor} recorded ${
        payload.movementKind === "TRANSFER"
          ? "a transfer"
          : payload.movementKind === "CONTRIBUTION"
            ? "money in"
            : payload.movementKind === "WITHDRAWAL"
              ? "money out"
              : "a money reversal"
      }`,
      detail:
        [payload.fromAccountLabel, payload.toAccountLabel]
          .filter(Boolean)
          .join(" → ") || null,
      subject: {
        kind: "finance_movement",
        id: payload.movementId,
        label: null,
      },
      amount: payload.amount,
      statusAtEvent: null,
      target: {
        kind: "finance_movement",
        id: payload.movementId,
        bookId: payload.bookId,
      },
    }),
  }),
} as const

export type ImplementedBusinessEventType =
  keyof typeof implementedBusinessEventHandlers

export function hasBusinessEventHandler(
  type: BusinessEventType,
): type is ImplementedBusinessEventType {
  return Object.hasOwn(implementedBusinessEventHandlers, type)
}

export function parseBusinessEventPayload(
  type: BusinessEventType,
  payload: unknown,
) {
  if (!hasBusinessEventHandler(type))
    throw new Error(
      "This business event does not have a recording handler yet.",
    )
  return implementedBusinessEventHandlers[type].schema.parse(payload)
}

export function presentBusinessEventPayload(
  type: BusinessEventType,
  payload: unknown,
  actorLabel: string,
) {
  if (!hasBusinessEventHandler(type))
    throw new Error(
      "This business event does not have a recording handler yet.",
    )
  return implementedBusinessEventHandlers[type].presentUnknown(
    payload,
    actorLabel,
  )
}

const categoryByPrefix: Record<string, BusinessActivityCategory> = {
  order: "orders",
  payment: "payments",
  staff: "staff",
  inventory: "inventory",
  catalog: "catalog",
  customer: "customers",
  service: "services",
  finance: "finance",
  communication: "communications",
  settings: "settings",
  import: "imports",
}

/** Authority-filter this catalog before returning it. Handlers alone do not mean producers are active. */
export function businessEventCatalog(
  recordingAvailability: Partial<
    Record<BusinessEventType, "recorded" | "legacy">
  > = {},
): BusinessEventCatalogItem[] {
  return businessEventTypes.map((type) => {
    const handler = hasBusinessEventHandler(type)
      ? implementedBusinessEventHandlers[type]
      : null
    const prefix = type.split(".")[0] ?? ""
    const category = handler?.category ?? categoryByPrefix[prefix]
    if (!category) throw new Error("Business event category is not registered.")
    const availability = recordingAvailability[type] ?? "planned"
    if (availability === "recorded" && !handler)
      throw new Error("An event without a handler cannot be recorded.")
    const title =
      handler?.label ?? type.split(".").join(" ").replaceAll("_", " ")
    return {
      type,
      category,
      label: title,
      description:
        handler?.description ?? "Planned recorded business activity.",
      supports: {
        inApp: Boolean(handler) && availability === "recorded",
        email: false,
      },
      availability,
    }
  })
}
