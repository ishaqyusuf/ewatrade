"use client"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import Link from "next/link"
import { customerStatementHref } from "./columns"

export function CustomerActionsMenu({
  customer,
  canSeeBalances,
  onEdit,
}: {
  customer: DashboardCustomerRow
  canSeeBalances: boolean
  onEdit: (customerId: string) => void
}) {
  const { customerId, phone } = customer
  // Walk-in sales have no saved customer to open or edit.
  if (!customerId && !phone) return null
  const statement = customerId ? customerStatementHref(customerId) : null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${customer.name}`}
          >
            ···
          </Button>
        }
      />
      <DropdownMenuContent appearance="dashboard" align="end">
        {canSeeBalances && statement ? (
          <>
            <DropdownMenuItem render={<Link href={statement} />}>
              Open statement
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<Link href={`${statement}?ledgerAction=receipt`} />}
            >
              Record payment
            </DropdownMenuItem>
          </>
        ) : null}
        {customerId ? (
          <DropdownMenuItem onClick={() => onEdit(customerId)}>
            Edit details
          </DropdownMenuItem>
        ) : null}
        {phone ? (
          <DropdownMenuItem
            onClick={() => void navigator.clipboard?.writeText(phone)}
          >
            Copy phone number
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
