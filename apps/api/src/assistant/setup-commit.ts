import { createHash } from "node:crypto"
import {
  type SetupEntityPayload,
  type SetupProductPayload,
  type SetupServicePayload,
  setupEntityPayloadSchema,
} from "@ewatrade/assistant/setup/contracts"
import type { prisma } from "@ewatrade/db"
import {
  type AssistantScope,
  readSetupDraft,
  recordSetupDraftCommitOutcome,
} from "@ewatrade/db/assistant"
import {
  CatalogError,
  type CreateCatalogItemInput,
  CustomerDirectoryError,
  FinanceError,
  createCatalogItem,
  createCustomer,
  ensureCustomerLedgerAccount,
  getFinanceBook,
  recordCustomerLedgerOpening,
} from "@ewatrade/db/queries"
import { findCatalogCategoryPreset } from "@ewatrade/utils/catalog-category-presets"

type Db = typeof prisma

/** Bounded per request so a long list never outlives the HTTP deadline. */
export const SETUP_COMMIT_BATCH_SIZE = 6
const CANONICAL_BALANCE_SCALE = 18
const TRANSACTION_SCALE = 2

export const OPENING_BALANCE_NEEDS_FINANCE = "OPENING_BALANCE_NEEDS_FINANCE"
export const OPENING_BALANCE_FAILED = "OPENING_BALANCE_FAILED"
/** Set with the customer so an interrupted request still retries the balance. */
export const OPENING_BALANCE_PENDING = "OPENING_BALANCE_PENDING"
export const isOpeningBalancePending = (code: string | null | undefined) =>
  code === OPENING_BALANCE_NEEDS_FINANCE ||
  code === OPENING_BALANCE_FAILED ||
  code === OPENING_BALANCE_PENDING
/** Every option combination becomes a Sellable Variant; keep the grid reviewable. */
export const MAX_SETUP_VARIANTS = 36
/** Stop starting new records well before the dashboard proxy's request timeout. */
const COMMIT_TIME_BUDGET_MS = 5_000

export type SetupCommitResult = {
  key: string
  name: string
  state: "COMMITTED" | "FAILED"
  recordId?: string
  errorCode?: string
  message?: string
}

function unitKey(name: string, used: Set<string>) {
  const base =
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "unit"
  let key = base
  for (let index = 2; used.has(key); index += 1) key = `${base}-${index}`
  used.add(key)
  return key
}

type OptionGroup = {
  key: string
  name: string
  values: Array<{ key: string; label: string }>
}

/** Option Groups and every value combination, first combination as the default. */
export function setupProductOptionGrid(payload: SetupProductPayload) {
  const groupKeys = new Set<string>()
  const optionGroups: OptionGroup[] = (payload.options ?? []).map((group) => {
    const valueKeys = new Set<string>()
    const seen = new Set<string>()
    return {
      key: unitKey(group.name, groupKeys),
      name: group.name,
      values: group.values
        .filter((label) => {
          const normalized = label.trim().toLowerCase()
          if (seen.has(normalized)) return false
          seen.add(normalized)
          return true
        })
        .map((label) => ({ key: unitKey(label, valueKeys), label })),
    }
  })
  let combinations: Array<
    Array<{ group: OptionGroup; key: string; label: string }>
  > = [[]]
  for (const group of optionGroups)
    combinations = combinations.flatMap((combination) =>
      group.values.map((value) => [...combination, { group, ...value }]),
    )
  if (combinations.length > MAX_SETUP_VARIANTS)
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      `${payload.name} has ${combinations.length} option combinations. Keep it to ${MAX_SETUP_VARIANTS} or fewer, or add the rest in Catalog.`,
    )
  // Stock is counted per variant, so a single total cannot be placed honestly.
  if (optionGroups.length > 0 && payload.openingStock !== undefined)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      `Stock for ${payload.name} is counted per option. Remove the total here and add each option's stock in Inventory.`,
    )
  return { optionGroups, combinations }
}

/** Category vocabulary is stored by label; the catalog repository materializes presets. */
export function setupCategoryLabel(categoryKey: string | undefined) {
  if (!categoryKey) return undefined
  const key = categoryKey.replace(/^preset:/, "")
  const root = findCatalogCategoryPreset(key.split(":")[0])
  if (!root) return undefined
  if (key === root.key) return root.label
  const child = root.subcategories.find((entry) => entry.key === key)
  return child ? `${root.label} / ${child.label}` : root.label
}

/** Payload changes produce a new operation identity; replays of the same payload return the original item. */
export function setupClientOperationId(
  entityId: string,
  payload: SetupEntityPayload,
) {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 16)
  return `setup-${entityId}-${digest}`
}

export function catalogCommandForSetupEntity(
  entityId: string,
  payload: SetupProductPayload | SetupServicePayload,
  scope: { actorUserId: string; storeId: string; tenantId: string },
): CreateCatalogItemInput {
  const base = {
    actorUserId: scope.actorUserId,
    clientOperationId: setupClientOperationId(entityId, payload),
    category: setupCategoryLabel(payload.categoryKey),
    description: payload.description,
    name: payload.name,
    storeId: scope.storeId,
    tenantId: scope.tenantId,
  }
  if (payload.kind === "service")
    return {
      ...base,
      kind: "service",
      variants: [
        {
          isDefault: true,
          key: "default",
          name: payload.name,
          offerings: [
            payload.pricing === "quote"
              ? {
                  key: "default",
                  name: payload.name,
                  pricingPolicy: "quote_required",
                }
              : {
                  fixedPriceMinor: payload.priceMinor,
                  key: "default",
                  name: payload.name,
                  pricingPolicy: "fixed",
                },
          ],
        },
      ],
    }

  const { optionGroups, combinations } = setupProductOptionGrid(payload)
  const variantKeys = new Set<string>()
  const used = new Set<string>()
  const canonicalKey = unitKey(payload.unitName, used)
  const sameName = (name: string) =>
    name.trim().toLowerCase() === payload.unitName.trim().toLowerCase()
  // A pack equal to the base unit adds nothing and would duplicate its offering.
  const sellingUnits = (payload.sellingUnits ?? [])
    .filter((unit) => !sameName(unit.name) && unit.containsQuantity !== "1")
    .map((unit) => ({ ...unit, key: unitKey(unit.name, used) }))
  return {
    ...base,
    kind: "product",
    usage: payload.usage,
    openingStockQuantity: payload.openingStock,
    unitConfiguration: {
      canonicalBalanceScale: CANONICAL_BALANCE_SCALE,
      units: [
        {
          factor: "1",
          key: canonicalKey,
          name: payload.unitName,
          stockBehavior: "canonical_shared",
          transactionScale: TRANSACTION_SCALE,
        },
        ...sellingUnits.map((unit) => ({
          factor: unit.containsQuantity,
          key: unit.key,
          name: unit.name,
          stockBehavior: "alternate_transaction" as const,
          transactionScale: TRANSACTION_SCALE,
        })),
      ],
    },
    ...(optionGroups.length > 0 ? { optionGroups } : {}),
    variants: combinations.map((combination, index) => {
      // Offering keys are unique across the item, so option variants prefix them.
      const variantKey =
        combination.length === 0
          ? "default"
          : unitKey(
              combination.map((value) => value.key).join("-"),
              variantKeys,
            )
      const offeringKey = (key: string) =>
        combination.length === 0 ? key : `${variantKey}-${key}`
      return {
        isDefault: index === 0,
        key: variantKey,
        name:
          combination.length === 0
            ? payload.name
            : combination.map((value) => value.label).join(" / "),
        ...(combination.length > 0
          ? {
              selections: combination.map((value) => ({
                groupKey: value.group.key,
                valueKey: value.key,
              })),
            }
          : {}),
        offerings: [
          {
            fixedPriceMinor: payload.priceMinor,
            inventoryUnitKey: canonicalKey,
            key: offeringKey(canonicalKey),
            name: payload.unitName,
            pricingPolicy: "fixed" as const,
          },
          ...sellingUnits.map((unit) => ({
            fixedPriceMinor: unit.priceMinor,
            inventoryUnitKey: unit.key,
            key: offeringKey(unit.key),
            name: unit.name,
            pricingPolicy: "fixed" as const,
          })),
        ],
      }
    }),
  }
}

/** Server-only diagnostics: error identity and a bounded message, never payloads. */
export function describeCommitError(error: unknown) {
  if (!(error instanceof Error)) return { name: typeof error }
  const code = (error as { code?: unknown }).code
  return {
    name: error.name,
    code: typeof code === "string" ? code : undefined,
    message: error.message.slice(0, 300),
    cause:
      error.cause instanceof Error
        ? `${error.cause.name}: ${error.cause.message.slice(0, 200)}`
        : undefined,
  }
}

function failure(error: unknown) {
  if (
    error instanceof CatalogError ||
    error instanceof CustomerDirectoryError ||
    error instanceof FinanceError
  )
    return { errorCode: error.code, message: error.message }
  return {
    errorCode: "COMMIT_FAILED",
    message: "This record could not be added. Try again.",
  }
}

async function commitCustomer(
  db: Db,
  scope: AssistantScope,
  entity: { id: string; committedRecordId: string | null },
  payload: Extract<SetupEntityPayload, { kind: "customer" }>,
  draftId: string,
  key: string,
  deps: SetupCommitDeps,
): Promise<{ recordId: string; errorCode: string | null; message?: string }> {
  let customerId = entity.committedRecordId
  if (!customerId) {
    // Creation and the draft receipt share one transaction: no orphan on retry.
    customerId = await db.$transaction(
      async (tx) => {
        const customer = await deps.createCustomer(tx as unknown as Db, {
          tenantId: scope.tenantId,
          name: payload.name,
          phone: payload.phone,
          email: payload.email,
        })
        await deps.recordOutcome(tx, {
          draftId,
          key,
          outcome: {
            state: "COMMITTED",
            recordId: customer.id,
            errorCode: payload.opening ? OPENING_BALANCE_PENDING : null,
          },
        })
        return customer.id
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  }
  if (!payload.opening) return { recordId: customerId, errorCode: null }

  const actor = { tenantId: scope.tenantId, actorUserId: scope.userId }
  try {
    const book = await deps.getFinanceBook(db, actor)
    if (!book)
      return {
        recordId: customerId,
        errorCode: OPENING_BALANCE_NEEDS_FINANCE,
        message:
          "Customer added. Set up Finance to record what they owe; the balance is kept here until then.",
      }
    const account = await deps.ensureCustomerLedgerAccount(db, {
      ...actor,
      customerId,
      currencyCode: book.currencyCode,
    })
    // Stable command identity: a retry returns the original ledger entry.
    await deps.recordCustomerLedgerOpening(db, {
      ...actor,
      bookId: book.id,
      accountId: account.id,
      clientCommandId: `setup-opening-${entity.id}`,
      direction:
        payload.opening.direction === "owes_business" ? "DEBT" : "CREDIT",
      amountMinor: String(payload.opening.amountMinor),
      reason: "Opening balance from business setup",
    })
    return { recordId: customerId, errorCode: null }
  } catch (error) {
    return {
      recordId: customerId,
      errorCode: OPENING_BALANCE_FAILED,
      message: `Customer added, but the opening balance was not recorded: ${failure(error).message}`,
    }
  }
}

export type SetupCommitDeps = {
  readSetupDraft: typeof readSetupDraft
  recordOutcome: typeof recordSetupDraftCommitOutcome
  createCatalogItem: typeof createCatalogItem
  createCustomer: typeof createCustomer
  getFinanceBook: typeof getFinanceBook
  ensureCustomerLedgerAccount: typeof ensureCustomerLedgerAccount
  recordCustomerLedgerOpening: typeof recordCustomerLedgerOpening
  now: () => number
}

const defaultDeps: SetupCommitDeps = {
  readSetupDraft,
  recordOutcome: recordSetupDraftCommitOutcome,
  createCatalogItem,
  createCustomer,
  getFinanceBook,
  ensureCustomerLedgerAccount,
  recordCustomerLedgerOpening,
  now: Date.now,
}

const isDomainError = (error: unknown) =>
  error instanceof CatalogError ||
  error instanceof CustomerDirectoryError ||
  error instanceof FinanceError

/**
 * Commits confirmed draft records through the existing repositories. Each record
 * is its own atomic, idempotent unit. Domain refusals mark the record FAILED with
 * its reason; unexpected or bookkeeping failures pause the batch and leave the
 * record queued, because every retry replays the same commands safely.
 */
export async function commitSetupDraft(
  db: Db,
  scope: AssistantScope,
  draftId: string,
  deps: SetupCommitDeps = defaultDeps,
) {
  const draft = await deps.readSetupDraft(db, draftId)
  const pending = draft.entities.filter(
    (entity) =>
      entity.state === "CONFIRMED" ||
      (entity.state === "COMMITTED" &&
        isOpeningBalancePending(entity.errorCode)),
  )
  const batch = pending.slice(0, SETUP_COMMIT_BATCH_SIZE)
  const results: SetupCommitResult[] = []
  const startedAt = deps.now()
  let handled = 0
  let interrupted = false

  for (const entity of batch) {
    if (handled > 0 && deps.now() - startedAt > COMMIT_TIME_BUDGET_MS) break
    const parsed = setupEntityPayloadSchema.safeParse(entity.payload)
    let outcome:
      | {
          state: "COMMITTED"
          recordId: string
          errorCode?: string | null
          message?: string
        }
      | { state: "FAILED"; errorCode: string; message: string }
    try {
      if (!parsed.success)
        outcome = {
          state: "FAILED",
          errorCode: "INVALID_DRAFT",
          message: "Edit this record before adding it.",
        }
      else if (parsed.data.kind === "customer") {
        const customer = await commitCustomer(
          db,
          scope,
          entity,
          parsed.data,
          draftId,
          entity.key,
          deps,
        )
        outcome = { state: "COMMITTED", ...customer }
      } else {
        const item = await deps.createCatalogItem(
          db,
          catalogCommandForSetupEntity(entity.id, parsed.data, {
            actorUserId: scope.userId,
            storeId: scope.storeId,
            tenantId: scope.tenantId,
          }),
        )
        outcome = { state: "COMMITTED", recordId: item.id }
      }
    } catch (error) {
      if (!isDomainError(error)) {
        console.error("[setup-commit] record interrupted", {
          key: entity.key,
          ...describeCommitError(error),
        })
        interrupted = true
        break
      }
      outcome = { state: "FAILED", ...failure(error) }
    }

    try {
      // A customer whose creation committed stays COMMITTED; only its balance can be pending.
      if (!(outcome.state === "FAILED" && entity.state === "COMMITTED"))
        await deps.recordOutcome(db, {
          draftId,
          key: entity.key,
          outcome:
            outcome.state === "COMMITTED"
              ? {
                  state: "COMMITTED",
                  recordId: outcome.recordId,
                  errorCode: outcome.errorCode ?? null,
                }
              : { state: "FAILED", errorCode: outcome.errorCode },
        })
    } catch (error) {
      console.error("[setup-commit] outcome not recorded", {
        key: entity.key,
        ...describeCommitError(error),
      })
      interrupted = true
      break
    }

    handled += 1
    results.push({
      key: entity.key,
      name: parsed.success ? parsed.data.name : entity.key,
      state: outcome.state,
      recordId: outcome.state === "COMMITTED" ? outcome.recordId : undefined,
      errorCode: outcome.errorCode ?? undefined,
      message: outcome.message,
    })
  }

  return {
    results,
    remaining: pending.length - handled,
    interrupted,
  }
}
