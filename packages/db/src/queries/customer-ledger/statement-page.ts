import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import {
  getCustomerLedgerAccountDetailInTransaction,
  listCustomerLedgerAccountsInTransaction,
} from "./account-reads"
import { readCustomerLedgerAgingInTransaction } from "./aging"
import { listCustomerFundsRefundsInTransaction } from "./funds-refunds"
import { listCustomerOrderLinkSuggestionsInTransaction } from "./order-links"
import { getCustomerLedgerStatementInTransaction } from "./reads"

/** Page sizes the dashboard statement page asks for. */
export const CUSTOMER_STATEMENT_PAGE = {
  accounts: 50,
  entries: 30,
  refunds: 20,
  orderLinks: 50,
} as const

/**
 * Everything the customer statement page shows first, in one repeatable-read
 * transaction with one Owner/Admin check: the customer's accounts (and the
 * business book), then for the chosen account the statement's first page,
 * the current balance detail, refund requests, earlier-order suggestions and,
 * only when something is owed, the age buckets. Each part has the same shape
 * as its own `customerLedger.*` read, so the dashboard can seed those caches.
 */
export async function readCustomerStatementPage(
  db: PrismaClient,
  input: FinanceActor & { customerId: string; accountId?: string },
) {
  return db.$transaction(
    async (tx) => {
      const tenant = await assertFinanceManager(tx, input)
      const accounts = await listCustomerLedgerAccountsInTransaction(tx, {
        ...input,
        limit: CUSTOMER_STATEMENT_PAGE.accounts,
        tenantCurrencyCode: tenant.currencyCode,
      })
      const account = input.accountId
        ? accounts.accounts.find((row) => row.id === input.accountId)
        : accounts.accounts[0]
      const orderLinks = await listCustomerOrderLinkSuggestionsInTransaction(
        tx,
        { ...input, limit: CUSTOMER_STATEMENT_PAGE.orderLinks },
      )
      if (!account)
        return {
          accounts,
          orderLinks,
          accountId: null,
          statement: null,
          detail: null,
          refunds: null,
          aging: null,
        }
      const scoped = { ...input, accountId: account.id }
      const [statement, detail, refunds] = await Promise.all([
        getCustomerLedgerStatementInTransaction(tx, {
          ...scoped,
          limit: CUSTOMER_STATEMENT_PAGE.entries,
        }),
        getCustomerLedgerAccountDetailInTransaction(tx, scoped),
        listCustomerFundsRefundsInTransaction(tx, {
          ...scoped,
          limit: CUSTOMER_STATEMENT_PAGE.refunds,
        }),
      ])
      const aging =
        BigInt(detail.totals.outstandingDebtMinor) > BigInt(0)
          ? await readCustomerLedgerAgingInTransaction(tx, scoped)
          : null
      return {
        accounts,
        orderLinks,
        accountId: account.id,
        statement,
        detail,
        refunds,
        aging,
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
