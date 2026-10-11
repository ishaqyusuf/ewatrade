import {
  generalMoney,
  type GeneralAnswer,
} from "@ewatrade/assistant/general/contracts"
import type {
  getFinanceSupplierStatement,
  listFinanceSuppliers,
} from "@ewatrade/db/queries"
import { z } from "zod"
import {
  financeSuppliersSchema,
  financeSupplierStatementSchema,
} from "../schemas/finance-suppliers"

export const generalSuppliersInput = financeSuppliersSchema.omit({
  limit: true,
  direction: true,
})
export const generalSupplierStatementInput = z
  .object({
    bookId: financeSupplierStatementSchema.shape.bookId,
    supplierId: financeSupplierStatementSchema.shape.supplierId,
    cursor: financeSupplierStatementSchema.shape.cursor,
    snapshotSequence: financeSupplierStatementSchema.shape.snapshotSequence,
  })
  .strict()
  .refine(
    (value) =>
      value.cursor === undefined || value.snapshotSequence !== undefined,
    {
      path: ["snapshotSequence"],
      message: "Keep the original supplier statement snapshot when continuing.",
    },
  )

export function generalSuppliersAnswer(
  page: Awaited<ReturnType<typeof listFinanceSuppliers>>,
): GeneralAnswer {
  return {
    id: `suppliers_${crypto.randomUUID()}`,
    title: "Suppliers",
    value: `${page.data.length} on this page`,
    scope: "Selected Finance Book · supplier identities",
    asOf: new Date().toISOString(),
    detail: `${page.data.map((supplier) => `${supplier.name} (${supplier.code})`).join("; ") || "No suppliers match this page."} ${page.nextCursor ? "More suppliers available; continue with the same Book and search." : "End of this list."} This list does not report amounts paid, payable, advances or goods received.`,
  }
}
export function generalSupplierStatementAnswer(
  statement: Awaited<ReturnType<typeof getFinanceSupplierStatement>>,
): GeneralAnswer {
  return {
    id: `supplier_statement_${crypto.randomUUID()}`,
    title: `Supplier statement · ${statement.supplier.name}`,
    value: `${generalMoney(statement.payableMinor, statement.currencyCode)} payable`,
    scope: `Finance Book · snapshot ${statement.snapshotSequence}`,
    asOf: new Date().toISOString(),
    detail: `${generalMoney(statement.advanceMinor, statement.currencyCode)} supplier advance recorded separately. Balances cover the complete statement snapshot; ${statement.data.length} entries on this page. ${statement.nextCursor ? "More entries available; keep the same Book, supplier and snapshot." : "End of this statement."} These are bookkeeping balances, not proof of bank settlement, physical receipt or purchase ownership.`,
  }
}
