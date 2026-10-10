import {
  setupEntityPayloadSchema,
  setupMoneyAccountPayloadSchema,
} from "@ewatrade/assistant/setup/contracts"
import type { prisma } from "@ewatrade/db"
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

/** Finance prerequisites use the same check as the commit path. */
export async function readSetupPrerequisites(
  db: typeof prisma,
  input: { userId: string; tenantId: string; currencyCode: string },
  entities: DraftEntity[],
) {
  const needs = setupPrerequisiteNeeds(entities)
  const financeBookMissing = await (needs.balances
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
    : false)
  // Retain the response field for older clients; agreement is owned by signup.
  return { termsRequired: false, financeBookMissing }
}
