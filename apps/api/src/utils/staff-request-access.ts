import {
  canStaffAccessStore,
  canStaffPerform,
} from "@ewatrade/auth/store-access"
import type { TenantContext } from "@ewatrade/db/tenant-context"
import type { PrismaClient } from "@ewatrade/db/types"
import { TRPCError } from "@trpc/server"

export type StaffRequestContext = {
  db: PrismaClient
  tenantContext: TenantContext | null
}
import {
  staffProcedureAction,
  staffProcedureStoreInput,
} from "./staff-procedure-policy"

export async function scopeStaffRequest(
  ctx: StaffRequestContext,
  path: string,
  type: string,
  raw: unknown,
) {
  const tenant = ctx.tenantContext
  const access = tenant?.staffAccess
  if (
    !tenant ||
    !access ||
    access.mode !== "SCOPED" ||
    ["OWNER", "ADMIN"].includes(access.businessRole)
  )
    return raw
  const action = staffProcedureAction(path, type)
  const deny = () => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your staff role does not permit this action at this Store.",
    })
  }
  if (!action) return deny()
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? ({ ...raw } as Record<string, unknown>)
      : {}
  const storeId =
    typeof input.storeId === "string" ? input.storeId : tenant.activeStore?.id
  if (!storeId || !canStaffAccessStore(access, storeId)) return deny()
  const check = (id: string) => {
    if (
      !canStaffAccessStore(access, id) ||
      (action !== "read" && !canStaffPerform(access, action, id))
    )
      deny()
  }
  check(storeId)
  for (const key of ["sourceStoreId", "targetStoreId"])
    if (typeof input[key] === "string") check(input[key])
  if (Array.isArray(input.storeIds))
    for (const id of input.storeIds) {
      if (typeof id !== "string") deny()
      else check(id)
    }
  const tenantId = tenant.tenant.id
  const where = (id: string) => ({ id, tenantId })
  const checkRecord = (record: { storeId: string } | null) => {
    if (!record) deny()
    else check(record.storeId)
  }
  if (typeof input.orderId === "string")
    checkRecord(
      await ctx.db.commercialOrder.findFirst({
        where: where(input.orderId),
        select: { storeId: true },
      }),
    )
  if (typeof input.orderNumber === "string")
    checkRecord(
      await ctx.db.commercialOrder.findFirst({
        where: {
          tenantId,
          storeId,
          orderNumber: { equals: input.orderNumber, mode: "insensitive" },
        },
        select: { storeId: true },
      }),
    )
  if (typeof input.orderLineId === "string") {
    const line = await ctx.db.commercialOrderLine.findFirst({
      where: { id: input.orderLineId, order: { tenantId } },
      select: { order: { select: { storeId: true } } },
    })
    checkRecord(line?.order ?? null)
  }
  const balances = new Set<string>()
  const queue: unknown[] = [input]
  let visited = 0
  while (queue.length) {
    if (++visited > 10_000) deny()
    const value = queue.pop()
    if (!value || typeof value !== "object") continue
    if (Array.isArray(value)) {
      queue.push(...value)
      continue
    }
    for (const [key, child] of Object.entries(value)) {
      if (
        ["storeId", "sourceStoreId", "targetStoreId"].includes(key) &&
        typeof child === "string"
      )
        check(child)
      if (key === "storeIds" && Array.isArray(child))
        for (const id of child) {
          if (typeof id !== "string") deny()
          else check(id)
        }
      if (
        [
          "balanceSourceId",
          "sourceBalanceSourceId",
          "targetBalanceSourceId",
          "destinationBalanceSourceId",
        ].includes(key) &&
        typeof child === "string"
      )
        balances.add(child)
      if (child && typeof child === "object") queue.push(child)
    }
  }
  for (const id of balances)
    checkRecord(
      await ctx.db.stockBalanceSource.findFirst({
        where: where(id),
        select: { storeId: true },
      }),
    )
  if (typeof input.reservationId === "string")
    checkRecord(
      await ctx.db.stockReservation.findFirst({
        where: where(input.reservationId),
        select: { storeId: true },
      }),
    )
  for (const key of ["operationId", "targetOperationId", "linkedOperationId"])
    if (typeof input[key] === "string")
      checkRecord(
        await ctx.db.stockOperation.findFirst({
          where: where(input[key]),
          select: { storeId: true },
        }),
      )
  if (typeof input.stockCountId === "string")
    checkRecord(
      await ctx.db.stockCount.findFirst({
        where: where(input.stockCountId),
        select: { storeId: true },
      }),
    )
  if (typeof input.closeoutId === "string")
    checkRecord(
      await ctx.db.inventoryCloseout.findFirst({
        where: where(input.closeoutId),
        select: { storeId: true },
      }),
    )
  if (typeof input.transferId === "string") {
    const transfer = await ctx.db.stockTransfer.findFirst({
      where: where(input.transferId),
      select: { sourceStoreId: true, targetStoreId: true },
    })
    if (!transfer) deny()
    else {
      check(transfer.sourceStoreId)
      check(transfer.targetStoreId)
    }
  }
  if (staffProcedureStoreInput.has(path)) input.storeId = storeId
  return raw === undefined && !staffProcedureStoreInput.has(path)
    ? undefined
    : input
}
