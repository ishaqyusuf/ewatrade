import { CatalogError } from "./catalog"
import {
  CustomerDirectoryError,
  createCustomerInTransaction,
} from "./customers"
import type { DbClient } from "./types"

/** Called inside the owning intake transaction, only for an explicitly reviewed new customer. */
export async function resolveServiceIntakeCustomer(
  tx: DbClient,
  input: {
    tenantId: string
    customerId?: string
    saveNewCustomer?: boolean
    customerName?: string
    customerPhone?: string
    customerEmail?: string
  },
) {
  if (input.customerId) {
    if (input.saveNewCustomer)
      throw new CatalogError(
        "INVALID_ORDER",
        "Choose an existing customer or add a new one.",
      )
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, tenantId: input.tenantId },
      select: { id: true },
    })
    if (!customer)
      throw new CatalogError(
        "INVALID_ORDER",
        "This customer is no longer available.",
      )
    return customer.id
  }
  if (!input.saveNewCustomer) return undefined
  const name = input.customerName?.trim()
  if (!name)
    throw new CatalogError("INVALID_ORDER", "Enter the new customer's name.")
  // A name-only draft may have been saved by someone else while this form was open.
  if (!input.customerPhone && !input.customerEmail) {
    const matches = await tx.customer.findMany({
      where: {
        tenantId: input.tenantId,
        name: { equals: name, mode: "insensitive" },
      },
      take: 2,
      select: { id: true },
    })
    if (matches.length > 1)
      throw new CatalogError(
        "INVALID_ORDER",
        "More than one saved customer has this name. Choose the customer in the form.",
      )
    if (matches[0]) return matches[0].id
  }
  try {
    return (
      await createCustomerInTransaction(tx, {
        tenantId: input.tenantId,
        name,
        phone: input.customerPhone,
        email: input.customerEmail,
      })
    ).id
  } catch (error) {
    if (error instanceof CustomerDirectoryError)
      throw new CatalogError("INVALID_ORDER", error.message)
    throw error
  }
}
