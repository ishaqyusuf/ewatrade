"use client"
import {
  NIGERIAN_BANKS,
  bankAccountNumberProblem,
  newOperationId,
} from "@/components/business-banking/business-banking-model"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import { FieldGroup, Input } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useId, useState } from "react"
import { FinanceField, FinanceFormFooter } from "./form-fields"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

/**
 * Bank details customers see on payment links (Business banking 02). With an
 * account id it edits that BANK account; without one it adds a new bank
 * account with its details. EwaTrade never connects to the bank.
 */
export function FinanceBankDetailsForm({
  book,
  accountId,
}: {
  book: FinanceBook
  accountId: string | null
}) {
  const trpc = useTRPC()
  const accounts = useQuery(
    trpc.businessBanking.accounts.queryOptions(
      { bookId: book.id },
      { retry: false },
    ),
  )
  if (!accountId) return <BankDetailsFields bookId={book.id} />
  if (accounts.isPending) return <output>Loading bank account…</output>
  if (accounts.isError)
    return (
      <FormFeedback appearance="dashboard">
        {accounts.error.message}
      </FormFeedback>
    )
  const account = accounts.data.find((row) => row.id === accountId)
  if (!account)
    return (
      <FormFeedback appearance="dashboard">
        Only bank accounts in use can have bank details. Choose a bank account
        in Money accounts.
      </FormFeedback>
    )
  return (
    <BankDetailsFields
      key={account.id}
      bookId={book.id}
      account={{
        id: account.id,
        name: account.name,
        bankName: account.bankName ?? "",
        accountNumber: account.bankAccountNumber ?? "",
        accountHolder: account.bankAccountHolder ?? "",
      }}
    />
  )
}

function BankDetailsFields({
  bookId,
  account,
}: {
  bookId: string
  account?: {
    id: string
    name: string
    bankName: string
    accountNumber: string
    accountHolder: string
  }
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const listId = useId()
  const { close } = useFinanceParams()
  const [name, setName] = useState("")
  const [bankName, setBankName] = useState(account?.bankName ?? "")
  const [accountNumber, setAccountNumber] = useState(
    account?.accountNumber ?? "",
  )
  const [accountHolder, setAccountHolder] = useState(
    account?.accountHolder ?? "",
  )
  const [tried, setTried] = useState(false)
  // Stable for this form: a retry after a lost response can't add twice.
  const [clientAccountId] = useState(() => newOperationId("bank"))
  const saved = account?.name ?? name.trim()
  const complete = useCompleteFinanceForm(
    account
      ? `Bank details saved for ${saved}.`
      : `Bank account “${saved}” added with its bank details.`,
  )
  const onSuccess = async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.businessBanking.pathKey(),
    })
    await queryClient.invalidateQueries({
      queryKey: trpc.orders.paymentAccounts.queryKey(),
    })
    await complete()
  }
  const create = useMutation(
    trpc.businessBanking.createBankAccount.mutationOptions({ onSuccess }),
  )
  const save = useMutation(
    trpc.businessBanking.saveBankDetails.mutationOptions({ onSuccess }),
  )
  const pending = create.isPending || save.isPending
  const error = create.error ?? save.error
  const problems = {
    name: account
      ? null
      : !name.trim()
        ? "Enter a name."
        : name.trim().length > 100
          ? "Use 100 characters or fewer."
          : null,
    bankName: !bankName.trim() ? "Enter the bank." : null,
    accountNumber: bankAccountNumberProblem(accountNumber),
    accountHolder: !accountHolder.trim()
      ? "Enter the account holder name."
      : null,
  }
  const invalid = Object.values(problems).some(Boolean)
  const show = (problem: string | null) =>
    tried ? (problem ?? undefined) : undefined
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setTried(true)
        if (invalid || pending) return
        const details = {
          bookId,
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          accountHolder: accountHolder.trim(),
        }
        if (account) save.mutate({ ...details, accountId: account.id })
        else create.mutate({ ...details, name: name.trim(), clientAccountId })
      }}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        {account ? (
          <p className="text-sm text-muted-foreground">
            When you pick {account.name} on a payment link, customers see these
            details.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              A bank account customers can transfer to. Payment links show its
              bank details.
            </p>
            <FinanceField label="Name" error={show(problems.name)}>
              <Input
                value={name}
                maxLength={100}
                placeholder="GTBank current, Shop OPay…"
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
              />
            </FinanceField>
          </>
        )}
        <FinanceField label="Bank" error={show(problems.bankName)}>
          <Input
            value={bankName}
            maxLength={100}
            list={listId}
            autoComplete="off"
            placeholder="GTBank, OPay, Zenith Bank…"
            disabled={pending}
            onChange={(event) => setBankName(event.target.value)}
          />
        </FinanceField>
        <datalist id={listId}>
          {NIGERIAN_BANKS.map((bank) => (
            <option key={bank} value={bank} />
          ))}
        </datalist>
        <FinanceField
          label="Account number"
          description="10 digits"
          error={
            tried || accountNumber.length > 10
              ? (problems.accountNumber ?? undefined)
              : undefined
          }
        >
          <Input
            value={accountNumber}
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            placeholder="0123456789"
            className="font-mono tabular-nums"
            disabled={pending}
            onChange={(event) =>
              setAccountNumber(event.target.value.replace(/\s/g, ""))
            }
          />
        </FinanceField>
        <FinanceField
          label="Account holder name"
          description="Write it exactly as your bank shows it. Customers check this name before they pay."
          error={show(problems.accountHolder)}
        >
          <Input
            value={accountHolder}
            maxLength={160}
            placeholder="As your bank shows it"
            disabled={pending}
            onChange={(event) => setAccountHolder(event.target.value)}
          />
        </FinanceField>
        <p className="text-xs text-muted-foreground">
          EwaTrade doesn't connect to this bank. Links already sent keep the
          details they were created with. You confirm each payment yourself.
        </p>
        {error ? (
          <FormFeedback appearance="dashboard">{error.message}</FormFeedback>
        ) : null}
        <FinanceFormFooter
          onCancel={() => void close()}
          submitLabel={account ? "Save" : "Add account"}
          isSubmitting={pending}
          disabled={pending}
        />
      </FieldGroup>
    </form>
  )
}
