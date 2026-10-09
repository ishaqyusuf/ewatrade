import {
  setupEntityPayloadSchema,
  setupMoneyAccountPayloadSchema,
} from "@ewatrade/assistant/setup/contracts"
import type { prisma } from "@ewatrade/db"
import { assertAccountStoreConversationTermsAccepted } from "@ewatrade/db/store-conversation-account-terms"
import {
  MONEY_ACCOUNT_NEEDS_FINANCE,
  isOpeningBalancePending,
} from "./setup-commit-codes"

type DraftEntity = {
  kind: string
  state: string
  payload: unknown
  errorCode: string | null
}

const OPEN_STATES = new Set(["PROPOSED", "NEEDS_INPUT", "CONFIRMED", "FAILED"])

const isMoneyAccount = (entity: DraftEntity) =>
  setupMoneyAccountPayloadSchema.safeParse(entity.payload).success

/** Which business prerequisites the remaining draft records will actually hit. */
export function setupPrerequisiteNeeds(entities: DraftEntity[]) {
  return {
    catalog: entities.some(
      (entity) =>
        (entity.kind === "PRODUCT" || entity.kind === "SERVICE") &&
        OPEN_STATES.has(entity.state),
    ),
    balances: entities.some((entity) => {
      if (entity.state === "COMMITTED")
        return isOpeningBalancePending(entity.errorCode)
      // Every cash or bank account lives in the Finance book, balance or not.
      if (isMoneyAccount(entity))
        return (
          OPEN_STATES.has(entity.state) &&
          (entity.state !== "FAILED" ||
            entity.errorCode === MONEY_ACCOUNT_NEEDS_FINANCE)
        )
      if (entity.kind !== "CUSTOMER") return false
      if (!OPEN_STATES.has(entity.state)) return false
      const payload = setupEntityPayloadSchema.safeParse(entity.payload)
      return (
        payload.success &&
        payload.data.kind === "customer" &&
        payload.data.opening !== undefined
      )
    }),
  }
}

/**
 * Uses the same checks as the commit path: catalog writes require the current
 * Terms (not enforced in local/Preview testing profiles) and opening balances
 * and cash/bank accounts require the business Finance book in its operating
 * currency.
 */
export async function readSetupPrerequisites(
  db: typeof prisma,
  input: { userId: string; tenantId: string; currencyCode: string },
  entities: DraftEntity[],
) {
  const needs = setupPrerequisiteNeeds(entities)
  const [termsRequired, financeBookMissing] = await Promise.all([
    needs.catalog
      ? assertAccountStoreConversationTermsAccepted(db, input.userId).then(
          () => false,
          (error: unknown) => {
            if (
              error instanceof Error &&
              error.name === "StoreConversationError"
            )
              return true
            throw error
          },
        )
      : false,
    needs.balances
      ? db.financeBook
          .findUnique({
            where: {
              tenantId_currencyCode: {
                tenantId: input.tenantId,
                currencyCode: input.currencyCode,
              },
            },
            select: { id: true },
          })
          .then((book) => !book)
      : false,
  ])
  return { termsRequired, financeBookMissing }
}
