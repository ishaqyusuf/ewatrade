import { createHash } from "node:crypto"
import {
  type SetupMoneyAccountPayload,
  setupMoneyAccountPayloadSchema,
} from "@ewatrade/assistant/setup/contracts"
import type { prisma } from "@ewatrade/db"
import type { AssistantScope } from "@ewatrade/db/assistant"
import {
  FinanceError,
  type createFinanceMoneyAccount,
  type getFinanceBook,
  type recordFinanceMoneyMovement,
} from "@ewatrade/db/queries"
import {
  MONEY_ACCOUNT_NEEDS_FINANCE,
  MONEY_ACCOUNT_SHOP_CASH,
  OPENING_BALANCE_FAILED,
  OPENING_BALANCE_NEEDS_FINANCE,
} from "./setup-commit-codes"

type Db = typeof prisma

/** The default book's own cash account (see FINANCE_DEFAULT_ACCOUNTS). */
const DEFAULT_CASH_CODE = "1000"

/** Stable per draft record, so a retry finds the account it already created. */
export function setupMoneyAccountCode(entityId: string) {
  const digest = createHash("sha256").update(entityId).digest("hex")
  return `SETUP-${digest.slice(0, 12).toUpperCase()}`
}

export function setupMoneyAccountName(payload: SetupMoneyAccountPayload) {
  const name = payload.name.trim()
  const bank = payload.bankName?.trim()
  if (!bank || name.toLowerCase().includes(bank.toLowerCase())) return name
  return `${bank} ${name}`.slice(0, 100)
}

/** The first cash pocket in the setup list uses the book's existing cash account. */
export function defaultCashEntityId(
  entities: Array<{ id: string; payload: unknown }>,
) {
  return entities.find((entity) => {
    const parsed = setupMoneyAccountPayloadSchema.safeParse(entity.payload)
    return parsed.success && parsed.data.purpose === "CASH"
  })?.id
}

export type SetupMoneyAccountDeps = {
  getFinanceBook: typeof getFinanceBook
  createFinanceMoneyAccount: typeof createFinanceMoneyAccount
  recordFinanceMoneyMovement: typeof recordFinanceMoneyMovement
}

export type SetupMoneyAccountOutcome =
  | {
      state: "COMMITTED"
      recordId: string
      errorCode: string | null
      message?: string
    }
  | { state: "FAILED"; errorCode: string; message: string }

/**
 * Creates (or reuses) the money account, then posts its opening balance at the
 * bookkeeping start date. Both steps replay safely: the account by its derived
 * code, the balance by its command id (and one original opening per account).
 * Domain refusals while creating the account propagate to the caller, which
 * marks the record failed; a refused balance keeps the account and stays pending.
 */
export async function commitSetupMoneyAccount(
  db: Db,
  scope: AssistantScope,
  entity: { id: string; committedRecordId: string | null },
  payload: SetupMoneyAccountPayload,
  options: { useDefaultCash: boolean },
  deps: SetupMoneyAccountDeps,
): Promise<SetupMoneyAccountOutcome> {
  const actor = { tenantId: scope.tenantId, actorUserId: scope.userId }
  const book = await deps.getFinanceBook(db, actor)
  if (!book)
    return entity.committedRecordId
      ? {
          state: "COMMITTED",
          recordId: entity.committedRecordId,
          errorCode: OPENING_BALANCE_NEEDS_FINANCE,
          message:
            "Account added. Set up Finance to record its balance; the balance is kept here until then.",
        }
      : {
          state: "FAILED",
          errorCode: MONEY_ACCOUNT_NEEDS_FINANCE,
          message:
            "Set up Finance to add your cash and bank accounts. This account is kept here until then.",
        }

  const shopCash = book.accounts.find(
    (account) =>
      account.code === DEFAULT_CASH_CODE &&
      account.purpose === "CASH" &&
      !account.archivedAt,
  )
  let accountId = entity.committedRecordId
  if (!accountId) {
    accountId =
      (options.useDefaultCash ? shopCash?.id : undefined) ??
      (
        await deps.createFinanceMoneyAccount(db, {
          ...actor,
          bookId: book.id,
          code: setupMoneyAccountCode(entity.id),
          name: setupMoneyAccountName(payload),
          purpose: payload.purpose,
        })
      ).id
  }

  // The owner named the pocket, but Finance keeps it as "Shop cash"; say so on the card.
  const added = {
    state: "COMMITTED",
    recordId: accountId,
    errorCode: accountId === shopCash?.id ? MONEY_ACCOUNT_SHOP_CASH : null,
  } as const
  if (!payload.openingBalanceMinor) return added
  try {
    await deps.recordFinanceMoneyMovement(db, {
      ...actor,
      bookId: book.id,
      kind: "OPENING_BALANCE",
      clientCommandId: `setup-money-opening-${entity.id}`,
      accountId,
      amountMinor: String(payload.openingBalanceMinor),
      description: "Opening balance from business setup",
      effectiveAt: book.startsAt,
    })
    return added
  } catch (error) {
    if (!(error instanceof FinanceError)) throw error
    return {
      state: "COMMITTED",
      recordId: accountId,
      errorCode: OPENING_BALANCE_FAILED,
      message: `Account added, but its opening balance was not recorded: ${error.message}`,
    }
  }
}
