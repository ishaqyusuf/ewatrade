"use client"
import { CustomerFormSheet } from "@/components/customers/customer-form-sheet"
import { ScrollableContent } from "@/components/scrollable-content"
import { CustomerLedgerEmptyState } from "@/components/tables/customer-ledger/empty-states"
import { useCustomerLedgerParams } from "@/hooks/use-customer-ledger-params"
import { useTRPC } from "@/trpc/client"
import type { TableSettings } from "@/utils/table-settings"
import {
  Alert,
  AlertDescription,
  Button,
  ControlField,
  SelectControl,
} from "@ewatrade/ui"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { CustomerLedgerStatement } from "./customer-ledger-statement"

type Customer = {
  id: string
  name: string
  phone: string | null
  email: string | null
}

function StatementHeader({
  customer,
  actions,
}: {
  customer?: Customer
  actions?: ReactNode
}) {
  const contact = [customer?.phone, customer?.email].filter(Boolean).join(" · ")
  return (
    <header className="grid gap-3">
      <Link
        href="/customers"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        Customers
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {customer?.name ?? "Customer"}
          </h1>
          <p
            className={`text-sm text-muted-foreground ${contact ? "" : "italic"}`}
          >
            {customer ? contact || "No phone or email" : " "}
          </p>
        </div>
        {actions}
      </div>
    </header>
  )
}

export function CustomerLedgerWorkspace({
  customerId,
  initialSettings,
}: {
  customerId: string
  initialSettings?: Partial<TableSettings>
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const { ledgerAccount, ledgerAction, setParams } = useCustomerLedgerParams()
  const [createError, setCreateError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const query = useQuery(
    trpc.customerLedger.accounts.queryOptions(
      { customerId, limit: 50 },
      { retry: false },
    ),
  )
  const book = useQuery(
    trpc.finance.book.queryOptions(undefined, { retry: false }),
  )
  const ensure = useMutation(
    trpc.customerLedger.ensureAccount.mutationOptions(),
  )
  const accounts = query.data?.accounts ?? []
  const selected =
    accounts.find((a) => a.id === ledgerAccount) ??
    (ledgerAccount ? undefined : accounts[0])
  const customer = query.data?.customer

  /** The first record opens the customer's account in the book currency. */
  async function openAccountFor(action: "receipt" | "opening") {
    if (!book.data || ensure.isPending) return
    setCreateError(null)
    try {
      const account = await ensure.mutateAsync({
        customerId,
        currencyCode: book.data.currencyCode,
      })
      await client.invalidateQueries({
        queryKey: trpc.customerLedger.accounts.pathKey(),
      })
      await setParams({
        ledgerAccount: account.id,
        ledgerAction: action,
        ledgerSnapshot: null,
        ledgerAfter: null,
      })
    } catch {
      setCreateError(
        "Couldn’t start this customer’s statement. Check your connection and try again.",
      )
    }
  }

  // "Record payment" from the Customers list arrives without an account.
  const routed = useRef(false)
  useEffect(() => {
    if (routed.current || !ledgerAction || ledgerAccount || query.isPending)
      return
    if (selected) {
      routed.current = true
      void setParams({ ledgerAccount: selected.id }, { history: "replace" })
    } else if (
      book.data &&
      (ledgerAction === "receipt" || ledgerAction === "opening")
    ) {
      routed.current = true
      void openAccountFor(ledgerAction)
    }
  })

  const editSheet = (
    <CustomerFormSheet
      open={editing}
      customerId={editing ? customerId : null}
      onOpenChange={setEditing}
      onSaved={() => {
        setEditing(false)
        void client.invalidateQueries({
          queryKey: trpc.customerLedger.accounts.pathKey(),
        })
      }}
    />
  )
  const bookMissing = !book.data && !book.isPending

  return (
    <ScrollableContent>
      <div className="flex min-w-0 flex-col gap-6 py-6">
        {query.isPending ? (
          <>
            <StatementHeader />
            <output aria-busy="true" className="text-sm text-muted-foreground">
              Loading statement…
            </output>
          </>
        ) : query.isError ? (
          <>
            <StatementHeader />
            <Alert appearance="dashboard" variant="destructive">
              <AlertDescription>
                Couldn’t load this customer. Check your connection and try
                again.
              </AlertDescription>
              <Button onClick={() => void query.refetch()}>Try again</Button>
              <Button variant="outline" render={<Link href="/customers" />}>
                Back to Customers
              </Button>
            </Alert>
          </>
        ) : (
          <>
            {accounts.length > 1 ? (
              <ControlField label="Currency" className="max-w-xs">
                <SelectControl
                  value={selected?.id ?? ""}
                  options={[
                    { value: "", label: "Choose a currency" },
                    ...accounts.map((a) => ({
                      value: a.id,
                      label: a.currencyCode,
                    })),
                  ]}
                  onValueChange={(id) =>
                    void setParams({
                      ledgerAccount: id,
                      ledgerSnapshot: null,
                      ledgerAfter: null,
                      ledgerAction: null,
                      ledgerEntry: null,
                      ledgerAllocation: null,
                    })
                  }
                />
              </ControlField>
            ) : null}
            {ledgerAccount && !selected ? (
              <Alert appearance="dashboard" variant="destructive">
                <AlertDescription>
                  This statement belongs to a different customer.
                </AlertDescription>
              </Alert>
            ) : null}
            {bookMissing ? (
              <Alert appearance="dashboard">
                <AlertDescription>
                  Set up Finance before recording payments.
                </AlertDescription>
                <Button variant="outline" render={<Link href="/finance" />}>
                  Go to Finance
                </Button>
              </Alert>
            ) : null}
            {createError ? (
              <Alert appearance="dashboard" variant="destructive">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            ) : null}
            {selected ? (
              <CustomerLedgerStatement
                key={selected.id}
                accountId={selected.id}
                customerName={customer?.name}
                initialSettings={initialSettings}
                onEditCustomer={() => setEditing(true)}
                renderHeader={(actions) => (
                  <StatementHeader customer={customer} actions={actions} />
                )}
              />
            ) : (
              <>
                <StatementHeader
                  customer={customer}
                  actions={
                    <Button
                      appearance="form"
                      variant="outline"
                      onClick={() => setEditing(true)}
                    >
                      Edit customer details
                    </Button>
                  }
                />
                {accounts.length > 1 ? (
                  <p className="text-muted-foreground">
                    Choose a currency to see this statement.
                  </p>
                ) : (
                  <CustomerLedgerEmptyState
                    customerName={customer?.name}
                    onRecordPayment={
                      book.data && !ensure.isPending
                        ? () => void openAccountFor("receipt")
                        : undefined
                    }
                    onStartingBalance={
                      book.data && !ensure.isPending
                        ? () => void openAccountFor("opening")
                        : undefined
                    }
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
      {editSheet}
    </ScrollableContent>
  )
}
