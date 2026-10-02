import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { FinanceError, financePayloadHash } from "./rules"
import { normalizeQuantity } from "./valuation-math"

type Store = { id: string; tenantId: string; currencyCode: string }
export type ReviewedHistoryUnit = {
  id: string
  configurationVersionId: string
  productId: string
  factor: string
  stockBehavior: string
}
export type ReviewedPhysicalBalance = {
  id: string
  tenantId: string
  storeId: string
  store: Store
  productId: string
  product: { id: string; catalogItemId: string; tenantId: string }
  variantId: string
  variant: { id: string; catalogItemId: string }
  inventoryUnitId: string
  unit: ReviewedHistoryUnit
  kind: "SHARED_POOL" | "PACKAGED_STOCK"
  onHandQuantity: string
  revision: number
  movementCount: number
  pool: {
    id: string
    tenantId: string
    bookId: string
    balanceSourceId: string
    quantity: string
    valueMinor: bigint | null
    lastSequence: bigint
    lastMovementCount: bigint
    lastStockRevision: number
    lastCostReviewSnapshotId: string | null
  } | null
}
export type ReviewedPhysicalMovement = {
  id: string
  balanceSourceId: string
  configurationVersionId: string
  enteredInventoryUnitId: string
  enteredQuantity: string
  transactionScaleSnapshot: number
  unitFactorSnapshot: string
  signedCanonicalEffect: string
  previousOnHandQuantity: string
  resultingOnHandQuantity: string
  reversalOfMovementId: string | null
  createdAt: Date
  unit: ReviewedHistoryUnit
  operation: {
    id: string
    tenantId: string
    storeId: string
    store: Store
    type: string
    source: string
    clientOperationId: string
    payloadHash: string
    actorUserId: string
    effectiveAt: Date
    linkedOperationId: string | null
    correctionOfOperationId: string | null
  }
  valuation: {
    id: string
    tenantId: string
    bookId: string
    poolId: string
    balanceSourceId: string
    stockOperationId: string
    stockMovementId: string
    sequence: bigint
    sourceKind: string
    sourceId: string
    canonicalEffect: string
    quantityBefore: string
    quantityAfter: string
    sourceCostMinor: bigint | null
    effectiveAt: Date
  } | null
}
const SCALE = 1000000000000000000n
const MAX_MINOR = 9223372036854775807n
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
function q(value: string) {
  try {
    return normalizeQuantity(value)
  } catch {
    conflict("Physical review quantity exceeds its exact bounds.")
  }
}
function units(value: string) {
  const text = q(value)
  const [integer = "0", fraction = ""] = text.split(".")
  return BigInt(integer) * SCALE + BigInt(fraction.padEnd(18, "0"))
}
function fromUnits(value: bigint) {
  if (value < 0n)
    conflict("Physical history implies a negative original quantity.")
  return q(`${value / SCALE}.${(value % SCALE).toString().padStart(18, "0")}`)
}
function signed(value: string) {
  return value.startsWith("-") ? -units(value.slice(1)) : units(value)
}
function canonical(value: string, balance: ReviewedPhysicalBalance) {
  try {
    return q(
      balance.kind === "PACKAGED_STOCK"
        ? multiplyExactDecimals(q(value), q(balance.unit.factor), 18)
        : value,
    )
  } catch {
    conflict("Physical review canonical conversion exceeds its exact bounds.")
  }
}
function validUnit(unit: ReviewedHistoryUnit, productId: string) {
  return (
    unit.id.trim() &&
    unit.configurationVersionId.trim() &&
    unit.productId === productId &&
    q(unit.factor) !== "0"
  )
}

/**
 * Audit persisted requested physical balances only. This proves neither connected
 * cost-graph closure, return metadata, monetary evidence nor posting authority.
 */
export function auditReviewedCostPhysicalHistory(input: {
  tenantId: string
  bookId: string
  currencyCode: string
  bookSequence: bigint
  through: Date
  balances: ReviewedPhysicalBalance[]
  movements: ReviewedPhysicalMovement[]
}) {
  if (
    !input.tenantId.trim() ||
    !input.bookId.trim() ||
    !input.currencyCode.trim() ||
    !Number.isFinite(input.through.getTime()) ||
    input.bookSequence < 0n ||
    input.balances.length < 1 ||
    input.balances.length > 128 ||
    input.movements.length > 4096
  )
    conflict("Physical review requires a bounded owned snapshot.")
  const balances = new Map<string, ReviewedPhysicalBalance>()
  for (const balance of input.balances) {
    const unit = balance.unit
    if (
      balances.has(balance.id) ||
      !balance.id.trim() ||
      balance.tenantId !== input.tenantId ||
      balance.storeId !== balance.store.id ||
      balance.store.tenantId !== input.tenantId ||
      balance.store.currencyCode !== input.currencyCode ||
      balance.productId !== balance.product.id ||
      balance.product.tenantId !== input.tenantId ||
      balance.variantId !== balance.variant.id ||
      balance.variant.catalogItemId !== balance.product.catalogItemId ||
      balance.inventoryUnitId !== unit.id ||
      !validUnit(unit, balance.productId) ||
      !Number.isSafeInteger(balance.revision) ||
      balance.revision < 0 ||
      !Number.isSafeInteger(balance.movementCount) ||
      balance.movementCount < 0 ||
      balance.movementCount > 4096 ||
      (balance.kind === "SHARED_POOL"
        ? unit.stockBehavior !== "CANONICAL_SHARED" || q(unit.factor) !== "1"
        : balance.kind !== "PACKAGED_STOCK" ||
          unit.stockBehavior !== "PACKAGED_STOCK")
    )
      conflict(
        "Physical balance ownership, unit or snapshot count is inconsistent.",
      )
    const pool = balance.pool
    if (
      pool &&
      (pool.tenantId !== input.tenantId ||
        pool.bookId !== input.bookId ||
        pool.balanceSourceId !== balance.id ||
        !pool.id.trim() ||
        pool.lastSequence < 0n ||
        pool.lastMovementCount < 0n ||
        pool.lastMovementCount > BigInt(balance.movementCount) ||
        !Number.isSafeInteger(pool.lastStockRevision) ||
        pool.lastStockRevision < 0 ||
        (pool.valueMinor !== null &&
          (pool.valueMinor < 0n || pool.valueMinor > MAX_MINOR)))
    )
      conflict(
        "Physical review pool does not belong to its Book/balance snapshot.",
      )
    canonical(balance.onHandQuantity, balance)
    if (pool) q(pool.quantity)
    balances.set(balance.id, balance)
  }
  const seen = new Set<string>()
  const grouped = new Map<
    string,
    Array<{
      fact: ReviewedPhysicalMovement
      before: string
      after: string
      effectUnits: bigint
      enteredQuantity: string
      factor: string
    }>
  >()
  for (const movement of input.movements) {
    const balance = balances.get(movement.balanceSourceId)
    if (!balance || seen.has(movement.id) || !movement.id.trim())
      conflict(
        "Physical movement identity or requested balance is inconsistent.",
      )
    seen.add(movement.id)
    const operation = movement.operation
    const unit = movement.unit
    const factor = q(movement.unitFactorSnapshot)
    if (
      operation.tenantId !== input.tenantId ||
      operation.storeId !== operation.store.id ||
      operation.store.tenantId !== input.tenantId ||
      operation.store.currencyCode !== input.currencyCode ||
      !operation.id.trim() ||
      !operation.actorUserId.trim() ||
      !operation.clientOperationId.trim() ||
      !/^[a-f0-9]{64}$/.test(operation.payloadHash) ||
      !Number.isFinite(operation.effectiveAt.getTime()) ||
      operation.effectiveAt > input.through ||
      !Number.isFinite(movement.createdAt.getTime()) ||
      movement.enteredInventoryUnitId !== unit.id ||
      !validUnit(unit, balance.productId) ||
      movement.configurationVersionId !== unit.configurationVersionId ||
      unit.configurationVersionId !== balance.unit.configurationVersionId ||
      factor !== q(unit.factor) ||
      (balance.kind === "PACKAGED_STOCK" && unit.id !== balance.unit.id) ||
      !Number.isInteger(movement.transactionScaleSnapshot) ||
      movement.transactionScaleSnapshot < 0 ||
      movement.transactionScaleSnapshot > 6
    )
      conflict(
        "Physical operation/date or immutable entered-unit provenance is inconsistent.",
      )
    let entered: string
    try {
      entered = parseExactDecimal(movement.enteredQuantity, {
        allowZero: true,
        maxScale: movement.transactionScaleSnapshot,
      })
    } catch {
      conflict(
        "Physical entered quantity does not match its saved transaction precision.",
      )
    }
    const before = canonical(movement.previousOnHandQuantity, balance)
    const after = canonical(movement.resultingOnHandQuantity, balance)
    const effectUnits = signed(movement.signedCanonicalEffect)
    let enteredCanonical: string
    try {
      enteredCanonical = q(multiplyExactDecimals(entered, factor, 18))
    } catch {
      conflict("Physical entered-unit conversion exceeds its exact bounds.")
    }
    if (
      units(after) - units(before) !== effectUnits ||
      units(enteredCanonical) !==
        (effectUnits < 0n ? -effectUnits : effectUnits) ||
      (effectUnits === 0n &&
        (operation.type !== "OPENING_STOCK" || before !== "0" || after !== "0"))
    )
      conflict(
        "Physical movement quantities do not reconcile their canonical effect.",
      )
    const event = movement.valuation
    if (
      event &&
      (!balance.pool ||
        event.tenantId !== input.tenantId ||
        event.bookId !== input.bookId ||
        event.poolId !== balance.pool.id ||
        event.balanceSourceId !== balance.id ||
        event.stockOperationId !== operation.id ||
        event.stockMovementId !== movement.id ||
        event.sequence <= 0n ||
        event.sequence > MAX_MINOR ||
        !event.id.trim() ||
        !event.sourceKind.trim() ||
        !event.sourceId.trim() ||
        !Number.isFinite(event.effectiveAt.getTime()) ||
        event.effectiveAt.getTime() !== operation.effectiveAt.getTime() ||
        signed(event.canonicalEffect) !== effectUnits ||
        q(event.quantityBefore) !== before ||
        q(event.quantityAfter) !== after ||
        (event.sourceCostMinor !== null &&
          (event.sourceCostMinor < 0n || event.sourceCostMinor > MAX_MINOR)))
    )
      conflict(
        "Registered valuation does not bind the actual physical movement.",
      )
    const history = grouped.get(balance.id) ?? []
    history.push({
      fact: movement,
      before,
      after,
      effectUnits,
      enteredQuantity: q(entered),
      factor,
    })
    grouped.set(balance.id, history)
  }
  const results = input.balances
    .map((balance) => {
      const history = grouped.get(balance.id) ?? []
      if (history.length !== balance.movementCount)
        conflict(
          "Physical review omitted or duplicated persisted movement history.",
        )
      const ending = canonical(balance.onHandQuantity, balance)
      const baseline = fromUnits(
        units(ending) -
          history.reduce((total, row) => total + row.effectUnits, 0n),
      )
      const registered = history
        .filter((row) => row.fact.valuation !== null)
        .sort((a, b) => {
          const left = a.fact.valuation?.sequence ?? 0n
          const right = b.fact.valuation?.sequence ?? 0n
          return left < right ? -1 : left > right ? 1 : 0
        })
      const sequences = registered.map(
        (row) => row.fact.valuation?.sequence ?? 0n,
      )
      if (new Set(sequences).size !== sequences.length)
        conflict("Physical review duplicates a registered pool sequence.")
      const issues: string[] = []
      if (baseline !== "0") issues.push("MISSING_ORIGINAL_BASELINE")
      if (registered.length !== history.length)
        issues.push("UNREGISTERED_MOVEMENTS")
      if (sequences.some((sequence, index) => sequence !== BigInt(index + 1)))
        issues.push("NON_DENSE_VALUATION_SEQUENCE")
      const pool = balance.pool
      if (!pool) issues.push("MISSING_VALUATION_POOL")
      else {
        if (
          q(pool.quantity) !== ending ||
          pool.lastMovementCount !== BigInt(history.length)
        )
          issues.push("STALE_VALUATION_PROJECTION")
        if (pool.lastSequence !== (sequences.at(-1) ?? 0n))
          issues.push("VALUATION_SEQUENCE_MISMATCH")
      }
      let current = baseline
      let registeredIndex = 0
      const remaining = new Map(history.map((row) => [row.fact.id, row]))
      const ordered: string[] = []
      while (remaining.size) {
        const candidates = [...remaining.values()].filter(
          (row) =>
            row.before === current &&
            (!row.fact.valuation ||
              row.fact.valuation.sequence === sequences[registeredIndex]),
        )
        if (candidates.length !== 1) {
          issues.push(
            candidates.length > 1
              ? "AMBIGUOUS_LEDGER_ORDER"
              : "UNEXPLAINED_QUANTITY_CHANGE",
          )
          break
        }
        const next = candidates[0]
        if (!next) conflict("Physical history traversal lost a movement.")
        ordered.push(next.fact.id)
        current = next.after
        if (next.fact.valuation) registeredIndex++
        remaining.delete(next.fact.id)
      }
      const quantityReconciled = remaining.size === 0 && current === ending
      if (remaining.size === 0 && current !== ending)
        issues.push("UNEXPLAINED_QUANTITY_CHANGE")
      return {
        balanceSourceId: balance.id,
        snapshot: {
          ...balance,
          onHandQuantity: q(balance.onHandQuantity),
          unit: { ...balance.unit, factor: q(balance.unit.factor) },
          pool: pool ? { ...pool, quantity: q(pool.quantity) } : null,
        },
        canonicalOnHandQuantity: ending,
        impliedBaselineQuantity: baseline,
        orderedMovementIds: quantityReconciled ? ordered : null,
        physicalQuantityReconciled: quantityReconciled,
        issues,
        movements: history
          .sort((a, b) => a.fact.id.localeCompare(b.fact.id))
          .map((row) => ({
            ...row.fact,
            canonicalBefore: row.before,
            canonicalAfter: row.after,
            enteredQuantity: row.enteredQuantity,
            unitFactorSnapshot: row.factor,
            signedCanonicalEffect:
              row.effectUnits === 0n
                ? "0"
                : `${row.effectUnits < 0n ? "-" : ""}${fromUnits(row.effectUnits < 0n ? -row.effectUnits : row.effectUnits)}`,
          })),
      }
    })
    .sort((a, b) => a.balanceSourceId.localeCompare(b.balanceSourceId))
  const snapshot = {
    scope: "REQUESTED_PHYSICAL_BALANCES" as const,
    tenantId: input.tenantId,
    bookId: input.bookId,
    currencyCode: input.currencyCode,
    bookSequence: input.bookSequence,
    through: input.through,
    balances: results,
  }
  return {
    ...snapshot,
    physicalSnapshotHash: financePayloadHash(snapshot),
    requiresCostGraphClosure: true as const,
  }
}
