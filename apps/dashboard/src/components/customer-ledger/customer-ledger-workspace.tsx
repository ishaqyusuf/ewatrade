"use client"
import { ScrollableContent } from "@/components/scrollable-content"
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { CustomerLedgerStatement } from "./customer-ledger-statement"
export function CustomerLedgerWorkspace({
  customerId,
  initialSettings,
}: {
  customerId: string
  initialSettings?: Partial<TableSettings>
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const { ledgerAccount, setParams } = useCustomerLedgerParams()
  const [createError, setCreateError] = useState<string | null>(null)
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
  const selected =
    query.data?.accounts.find((a) => a.id === ledgerAccount) ??
    (ledgerAccount ? undefined : query.data?.accounts[0])
  async function create() {
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
        ledgerSnapshot: null,
        ledgerAfter: null,
      })
    } catch (failure) {
      setCreateError(
        failure instanceof Error
          ? failure.message
          : "Account could not be opened.",
      )
    }
  }
  return (
    <ScrollableContent>
      <div className="flex min-w-0 flex-col gap-6 py-6">
        <header>
          <Link
            href="/customers"
            className="text-sm text-muted-foreground hover:underline"
          >
            Customers
          </Link>
          <h1 className="mt-3 text-2xl font-medium">
            {query.data?.customer.name ?? "Customer statement"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Business customer account · currencies remain separate
          </p>
        </header>
        {query.isPending ? (
          <output aria-busy="true">Loading customer accounts…</output>
        ) : query.isError ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>{query.error.message}</AlertDescription>
            <Button onClick={() => void query.refetch()}>Try again</Button>
          </Alert>
        ) : (
          <>
            {query.data.accounts.length ? (
              <ControlField label="Account currency">
                <SelectControl
                  value={selected?.id ?? ""}
                  options={[
                    { value: "", label: "Choose an account" },
                    ...query.data.accounts.map((a) => ({
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
                  This account does not belong to the selected customer.
                </AlertDescription>
              </Alert>
            ) : null}
            {book.data &&
            !query.data.accounts.some(
              (a) => a.currencyCode === book.data?.currencyCode,
            ) ? (
              <Button
                appearance="form"
                variant="outline"
                className="w-fit"
                disabled={ensure.isPending}
                onClick={() => void create()}
              >
                Open {book.data.currencyCode} account
              </Button>
            ) : null}
            {createError ? (
              <Alert appearance="dashboard" variant="destructive">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            ) : null}
            {!book.data && !book.isPending ? (
              <Alert appearance="dashboard">
                <AlertDescription>
                  {book.error?.message ??
                    "Start the financial book in Finance before recording customer payments."}
                </AlertDescription>
              </Alert>
            ) : null}
            {selected ? (
              <CustomerLedgerStatement
                key={selected.id}
                accountId={selected.id}
                initialSettings={initialSettings}
              />
            ) : (
              <p className="text-muted-foreground">
                No customer ledger account selected.
              </p>
            )}
          </>
        )}
      </div>
    </ScrollableContent>
  )
}
