import { generalBookingActionSchema } from "@ewatrade/assistant/general/booking-action"
import { Prisma as PrismaValues } from "../../../generated/prisma/browser"
import type { AssistantActionProposal } from "../../../generated/prisma/client"
import {
  bookingAvailabilityScope,
  field,
  matches,
} from "./booking-availability"
import { bookingCommandFixture } from "./booking-commands"

const string = (value: unknown, key: string) => {
  const item = field(value, key)
  if (typeof item !== "string") throw Error(`Expected ${key}`)
  return item
}
const number = (value: unknown, key: string) => {
  const item = field(value, key)
  if (typeof item !== "number") throw Error(`Expected ${key}`)
  return item
}
const date = (value: unknown, key: string) => {
  const item = field(value, key)
  if (!(item instanceof Date) || !Number.isFinite(item.getTime()))
    throw Error(`Expected ${key}`)
  return new Date(item)
}
function projection(value: unknown, select: unknown): unknown {
  if (value === null || !select || typeof select !== "object")
    return structuredClone(value)
  return Object.fromEntries(
    Object.entries(select).map(([key, choice]) => [
      key,
      choice === true
        ? structuredClone(field(value, key))
        : projection(field(value, key), field(choice, "select")),
    ]),
  )
}
/** Actual booking command/review fixture; only local Assistant proposal delegates
 * may write through tx. No canonical module mock, database, network or SQL proof.
 */
export function generalBookingDraftFixture() {
  const canonical = bookingCommandFixture()
  Object.assign(canonical.state.profile, { revision: 0 })
  for (const row of canonical.orders)
    Object.assign(row, {
      prescriptionPickupFulfillment: null,
      prescriptionDeliveryAddress: null,
      _count: { prescriptionPaymentIntents: 0 },
    })
  const scope = {
    ...bookingAvailabilityScope,
    conversationId: "general-booking-chat",
  }
  const conversation = {
    id: scope.conversationId,
    ownerUserId: scope.actorUserId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    purpose: "GENERAL",
    status: "ACTIVE",
  }
  const rows: AssistantActionProposal[] = []
  const reads: Array<{ method: string; args: unknown }> = []
  const writes: Array<{ method: string; args: unknown }> = []
  const control = {
    loseCAS: false,
    corruptReadback: false,
    expireReadback: false,
    onConversation: async () => {},
  }
  function matching(where: unknown) {
    const original = where && typeof where === "object" ? where : {}
    const nullFilter = field(original, "executedResult")
    const expected =
      field(nullFilter, "equals") === PrismaValues.AnyNull
        ? { ...original, executedResult: null }
        : original
    return (
      rows.find((row) => matches({ ...row, conversation }, expected)) ?? null
    )
  }
  const delegates = {
    assistantConversation: {
      findFirst: async (args: unknown) => {
        await control.onConversation()
        return projection(
          matches(conversation, field(args, "where")) ? conversation : null,
          field(args, "select"),
        )
      },
    },
    assistantActionProposal: {
      findFirst: async (args: unknown) => {
        reads.push({ method: "findFirst", args })
        const row = matching(field(args, "where"))
        if (!row) return null
        return structuredClone({
          ...row,
          ...(control.corruptReadback
            ? { targetRevision: "f".repeat(64) }
            : {}),
          ...(control.expireReadback ? { expiresAt: new Date(0) } : {}),
        })
      },
      findUnique: async (args: unknown) => {
        reads.push({ method: "findUnique", args })
        const where = field(args, "where")
        return structuredClone(
          matching(
            field(where, "tenantId_actorUserId_idempotencyKey") ?? where,
          ),
        )
      },
      create: async (args: unknown) => {
        const data = field(args, "data")
        if (
          field(data, "status") !== "PENDING" ||
          rows.some(
            (row) =>
              row.id === field(data, "id") ||
              (row.tenantId === field(data, "tenantId") &&
                row.actorUserId === field(data, "actorUserId") &&
                row.idempotencyKey === field(data, "idempotencyKey")),
          )
        )
          throw Error("Invalid/duplicate staging")
        const row: AssistantActionProposal = {
          id: string(data, "id"),
          conversationId: string(data, "conversationId"),
          tenantId: string(data, "tenantId"),
          storeId: string(data, "storeId"),
          actorUserId: string(data, "actorUserId"),
          action: string(data, "action"),
          actionVersion: number(data, "actionVersion"),
          payload: generalBookingActionSchema.parse(field(data, "payload")),
          payloadHash: string(data, "payloadHash"),
          revision: number(data, "revision"),
          targetRecordId: string(data, "targetRecordId"),
          targetRevision: string(data, "targetRevision"),
          roleSnapshot: string(data, "roleSnapshot"),
          approvalTokenHash: string(data, "approvalTokenHash"),
          expiresAt: date(data, "expiresAt"),
          idempotencyKey: string(data, "idempotencyKey"),
          status: "PENDING",
          executedResult: null,
          errorCode: null,
          decidedAt: null,
          createdAt: new Date(Date.now()),
          updatedAt: new Date(Date.now()),
        }
        rows.push(row)
        writes.push({ method: "create", args })
        return structuredClone(row)
      },
      updateMany: async (args: unknown) => {
        writes.push({ method: "updateMany", args })
        const row = matching(field(args, "where"))
        if (!row || control.loseCAS) return { count: 0 }
        const data = field(args, "data")
        Object.assign(row, {
          payload: generalBookingActionSchema.parse(field(data, "payload")),
          payloadHash: string(data, "payloadHash"),
          revision: number(data, "revision"),
          roleSnapshot: string(data, "roleSnapshot"),
          targetRecordId: string(data, "targetRecordId"),
          targetRevision: string(data, "targetRevision"),
          expiresAt: date(data, "expiresAt"),
          approvalTokenHash: string(data, "approvalTokenHash"),
          updatedAt: new Date(Date.now()),
        })
        return { count: 1 }
      },
    },
  }
  const tx = new Proxy(canonical.tx, {
    get(target, table: string) {
      if (table === "assistantConversation")
        return delegates.assistantConversation
      if (table === "assistantActionProposal")
        return delegates.assistantActionProposal
      if (table.startsWith("$")) throw Error(`Forbidden root TX/lock ${table}`)
      const delegate = Reflect.get(target, table)
      return new Proxy(delegate, {
        get(_target, method: string) {
          if (
            ![
              "findFirst",
              "findFirstOrThrow",
              "findUnique",
              "findMany",
              "groupBy",
              "count",
            ].includes(method)
          )
            throw Error(`Forbidden domain write ${table}.${method}`)
          return Reflect.get(delegate, method)
        },
      })
    },
  })
  const row = () => {
    const result = rows[0]
    if (!result) throw Error("Expected saved draft")
    return result
  }
  return {
    canonical,
    tx,
    scope,
    conversation,
    rows,
    row,
    reads,
    writes,
    control,
  }
}
