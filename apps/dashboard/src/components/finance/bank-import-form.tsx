"use client"

import { readFinanceCloseScope } from "@/actions/read-finance-close-scope"
import { useFinanceForm } from "@/components/finance/form-context"
import {
  FormDateControl,
  FormSelectControl,
} from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  Button,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import {
  FINANCE_BANK_STATEMENT_MAX_CSV_BYTES,
  FINANCE_BANK_STATEMENT_MAX_ROWS,
  financeBankStatementCsvHeaders,
  parseFinanceBankBalance,
} from "@ewatrade/utils/finance-bank-statement"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  onlineManager,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import type { Control } from "react-hook-form"
import { z } from "zod"
import {
  type FinanceBankStatementPreview,
  decodeFinanceBankStatementCsv,
  prepareFinanceBankStatementPreview,
} from "./bank-import-state"
import { FinanceField, FinanceReview } from "./form-fields"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

const utcDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid UTC date.")
const signedBalance = z.string().refine((value) => {
  try {
    parseFinanceBankBalance(value)
    return true
  } catch {
    return false
  }
}, "Enter a signed balance with up to two decimal places.")

const schema = z
  .object({
    accountId: z.string().min(1, "Choose a bank or clearing account."),
    reference: z
      .string()
      .trim()
      .min(1, "Enter a statement reference.")
      .max(160, "Use 160 characters or fewer."),
    startsOn: utcDate,
    endsOn: utcDate,
    openingBalance: signedBalance,
    closingBalance: signedBalance,
    transactionIdColumn: z.string().min(1, "Map the transaction ID column."),
    dateColumn: z.string().min(1, "Map the transaction date column."),
    amountColumn: z.string().min(1, "Map the signed amount column."),
    descriptionColumn: z.string().min(1, "Map the description column."),
    units: z.enum(["MAJOR", "MINOR"]),
  })
  .superRefine((values, context) => {
    const selected = [
      values.transactionIdColumn,
      values.dateColumn,
      values.amountColumn,
      values.descriptionColumn,
    ]
    if (new Set(selected).size !== selected.length)
      context.addIssue({
        code: "custom",
        message: "Choose four distinct CSV columns.",
        path: ["descriptionColumn"],
      })
  })

type Values = z.infer<typeof schema>
type ImportPayload = {
  bookId: string
  accountId: string
  expectedRevision: string
  currencyCode: string
  reference: string
  startsAt: Date
  endsAt: Date
  openingBalanceMinor: string
  closingBalanceMinor: string
  csv: string
  columns: {
    transactionId: string
    date: string
    amount: string
    description: string
  }
  units: "MAJOR" | "MINOR"
}
type Review = {
  accountName: string
  payload: ImportPayload
  rows: FinanceBankStatementPreview["rows"]
  openingBalanceMinor: string
  closingBalanceMinor: string
  transactionTotalMinor: string
  rowCount: number
  fileName: string
  generation: number
  recoveryReentry: boolean
}

const accountPurposes = ["BANK", "CLEARING"]

function yesterdayUtc() {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
}

function guessHeader(headers: readonly string[], target: RegExp) {
  return (
    headers.find((header) => target.test(header.trim().toLowerCase())) ?? ""
  )
}

function isFinanceManagerRole(role: string) {
  return ["OWNER", "ADMIN"].includes(role.trim().toUpperCase())
}

export function FinanceBankImportForm({ book }: { book: FinanceBook }) {
  const { actorUserId, tenantId } = useFinanceForm()
  const trpc = useTRPC()
  const client = useQueryClient()
  const mutation = useMutation(
    trpc.finance.bankStatements.import.mutationOptions(),
  )
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    book.id,
    "importBankStatement",
  )
  const [csv, setCsv] = useState("")
  const [fileName, setFileName] = useState("")
  const [headers, setHeaders] = useState<readonly string[]>([])
  const [reading, setReading] = useState(false)
  const [online, setOnline] = useState(() => onlineManager.isOnline())
  const [preparing, setPreparing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const generation = useRef(0)
  const mounted = useRef(false)
  const scopeKey = JSON.stringify([actorUserId, tenantId, book.id])
  const initialScopeKey = useRef(scopeKey)
  const initialScope = useRef({ actorUserId, tenantId, bookId: book.id })
  const currentScope = useRef(initialScope.current)
  currentScope.current = { actorUserId, tenantId, bookId: book.id }
  const savedAccountId = command.recoveryMetadata?.accountId
  const accounts = useMemo(
    () =>
      book.accounts.filter(
        (account) =>
          account.kind === "ASSET" &&
          accountPurposes.includes(account.purpose) &&
          !account.archivedAt,
      ),
    [book.accounts],
  )
  const form = useZodForm<Values>(schema, {
    defaultValues: {
      accountId: accounts[0]?.id ?? "",
      reference: "",
      startsOn: "",
      endsOn: "",
      openingBalance: "",
      closingBalance: "",
      transactionIdColumn: "",
      dateColumn: "",
      amountColumn: "",
      descriptionColumn: "",
      units: "MAJOR",
    },
  })

  useEffect(() => {
    mounted.current = true
    const unsubscribe = onlineManager.subscribe((online) => {
      if (!online) {
        generation.current += 1
        setOnline(false)
        setReading(false)
        setPreparing(false)
        setConfirming(false)
        setError("Connection changed. Recheck the statement before importing.")
      } else {
        setOnline(true)
        setReview((currentReview) =>
          currentReview
            ? { ...currentReview, generation: generation.current }
            : currentReview,
        )
      }
    })
    return () => {
      mounted.current = false
      generation.current += 1
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (scopeKey === initialScopeKey.current) return
    generation.current += 1
    setCsv("")
    setFileName("")
    setHeaders([])
    setReview(null)
    setReading(false)
    setPreparing(false)
    setConfirming(false)
    setError("The finance scope changed. Close and reopen this import sheet.")
  }, [scopeKey])

  useEffect(() => {
    if (
      savedAccountId &&
      accounts.some((account) => account.id === savedAccountId)
    )
      form.setValue("accountId", savedAccountId)
  }, [accounts, form.setValue, savedAccountId])

  function current(token: number) {
    return (
      mounted.current &&
      generation.current === token &&
      onlineManager.isOnline() &&
      currentScope.current.actorUserId === initialScope.current.actorUserId &&
      currentScope.current.tenantId === initialScope.current.tenantId &&
      currentScope.current.bookId === initialScope.current.bookId
    )
  }

  function assertCurrent(token: number) {
    if (!current(token))
      throw new Error("Finance scope or connection changed. Review again.")
  }

  async function fresh<T>(
    queryKey: readonly unknown[],
    token: number,
    fetch: () => Promise<T>,
  ) {
    assertCurrent(token)
    await client.cancelQueries({ queryKey, exact: true }, { silent: true })
    assertCurrent(token)
    const result = await fetch()
    assertCurrent(token)
    const state = client.getQueryState(queryKey)
    if (state?.status !== "success" || state.fetchStatus !== "idle")
      throw new Error("A fresh finance read is not available.")
    return result
  }

  async function assertScope(token: number) {
    assertCurrent(token)
    const actual = await readFinanceCloseScope()
    assertCurrent(token)
    if (
      !actual ||
      actual.actorUserId !== initialScope.current.actorUserId ||
      actual.tenantId !== initialScope.current.tenantId ||
      !isFinanceManagerRole(actual.role)
    )
      throw new Error("Your finance access changed. Reopen the import sheet.")
  }

  async function readActiveAccount(token: number, accountId: string) {
    const options = trpc.finance.book.queryOptions(undefined, {
      staleTime: 0,
      retry: false,
    })
    const currentBook = await fresh(options.queryKey, token, () =>
      client.fetchQuery(options),
    )
    if (
      !currentBook ||
      currentBook.id !== book.id ||
      currentBook.tenantId !== initialScope.current.tenantId ||
      currentBook.currencyCode !== book.currencyCode
    )
      throw new Error(
        "The active finance book changed. Reopen the import sheet.",
      )
    const account = currentBook.accounts.find(
      (candidate) =>
        candidate.id === accountId &&
        candidate.bookId === book.id &&
        candidate.kind === "ASSET" &&
        accountPurposes.includes(candidate.purpose) &&
        !candidate.archivedAt,
    )
    if (!account)
      throw new Error("Choose an active bank or clearing account in this book.")
    return account
  }

  async function readCurrentRevision(token: number, accountId: string) {
    const options = trpc.finance.bankStatements.history.queryOptions(
      { bookId: book.id, accountId, limit: 1 },
      { staleTime: 0, retry: false },
    )
    const result = await fresh(options.queryKey, token, () =>
      client.fetchQuery(options),
    )
    if (result.bookId !== book.id || result.accountId !== accountId)
      throw new Error("Bank history belongs to a different account or book.")
    return result.snapshotRevision
  }

  async function selectFile(file: File | undefined) {
    const token = ++generation.current
    setReading(false)
    setError(null)
    setCsv("")
    setFileName("")
    setHeaders([])
    setReview(null)
    if (!file) return
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a CSV file.")
      return
    }
    if (file.size < 1 || file.size > FINANCE_BANK_STATEMENT_MAX_CSV_BYTES) {
      setError("CSV statements must be between 1 byte and 512 KiB.")
      return
    }
    setReading(true)
    try {
      const text = decodeFinanceBankStatementCsv(await file.arrayBuffer())
      if (!current(token)) return
      const columns = financeBankStatementCsvHeaders(text)
      if (columns.length < 4)
        throw new Error(
          "Map transaction ID, date, amount and description columns.",
        )
      setCsv(text)
      setFileName(file.name)
      setHeaders(columns)
      form.setValue(
        "transactionIdColumn",
        guessHeader(columns, /transaction.?id|^id$|reference.?id/),
      )
      form.setValue("dateColumn", guessHeader(columns, /date/))
      form.setValue("amountColumn", guessHeader(columns, /amount|signed/))
      form.setValue(
        "descriptionColumn",
        guessHeader(columns, /description|narration|details/),
      )
    } catch (failure) {
      if (current(token))
        setError(
          failure instanceof Error
            ? failure.message
            : "The CSV file could not be read.",
        )
    } finally {
      if (current(token)) setReading(false)
    }
  }

  async function prepare(values: Values) {
    if (preparing || !command.ready) return
    const token = ++generation.current
    setPreparing(true)
    setError(null)
    try {
      await assertScope(token)
      const account = await readActiveAccount(token, values.accountId)
      await assertScope(token)
      const currentRevision = await readCurrentRevision(token, values.accountId)
      assertCurrent(token)
      let expectedRevision = currentRevision
      const saved = command.recoveryMetadata
      if (command.uncertain) {
        if (
          !saved?.accountId ||
          !saved.expectedBankRevision ||
          saved.accountId !== values.accountId
        )
          throw new Error(
            "Re-enter the original account and statement details for this unresolved import.",
          )
        expectedRevision = saved.expectedBankRevision
      }
      const preview = prepareFinanceBankStatementPreview({
        csv,
        columns: {
          transactionId: values.transactionIdColumn,
          date: values.dateColumn,
          amount: values.amountColumn,
          description: values.descriptionColumn,
        },
        units: values.units,
        startsOn: values.startsOn,
        endsOn: values.endsOn,
        openingBalance: values.openingBalance,
        closingBalance: values.closingBalance,
        bookStartsAt: book.startsAt,
      })
      assertCurrent(token)
      setReview({
        accountName: account.name,
        payload: {
          bookId: book.id,
          accountId: account.id,
          expectedRevision,
          currencyCode: book.currencyCode,
          reference: values.reference.trim(),
          startsAt: preview.startsAt,
          endsAt: preview.endsAt,
          openingBalanceMinor: preview.openingBalanceMinor,
          closingBalanceMinor: preview.closingBalanceMinor,
          csv,
          columns: {
            transactionId: values.transactionIdColumn,
            date: values.dateColumn,
            amount: values.amountColumn,
            description: values.descriptionColumn,
          },
          units: values.units,
        },
        rows: preview.rows,
        openingBalanceMinor: preview.openingBalanceMinor,
        closingBalanceMinor: preview.closingBalanceMinor,
        transactionTotalMinor: preview.transactionTotalMinor,
        rowCount: preview.rows.length,
        fileName,
        generation: token,
        recoveryReentry: Boolean(command.uncertain),
      })
    } catch (failure) {
      if (current(token))
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to prepare this statement review.",
        )
    } finally {
      if (current(token)) setPreparing(false)
    }
  }

  async function confirmImport() {
    if (!review || confirming || command.pending || command.saved) return
    const attempt = review
    const token = attempt.generation
    setConfirming(true)
    setError(null)
    try {
      assertCurrent(token)
      await assertScope(token)
      await readActiveAccount(token, attempt.payload.accountId)
      const currentRevision = await readCurrentRevision(
        token,
        attempt.payload.accountId,
      )
      assertCurrent(token)
      const saved = command.recoveryMetadata
      if (
        command.uncertain &&
        (saved?.accountId !== attempt.payload.accountId ||
          saved.expectedBankRevision !== attempt.payload.expectedRevision)
      )
        throw new Error("Retry only the saved account and evidence revision.")
      if (
        !command.uncertain &&
        currentRevision !== attempt.payload.expectedRevision
      ) {
        setReview(null)
        throw new Error(
          "Bank evidence changed after review. Prepare a fresh statement review.",
        )
      }
      assertCurrent(token)
      await command.run({
        payload: attempt.payload,
        recoveryMetadata: {
          accountId: attempt.payload.accountId,
          expectedBankRevision: attempt.payload.expectedRevision,
        },
        write: async (clientCommandId) => {
          assertCurrent(token)
          await assertScope(token)
          await readActiveAccount(token, attempt.payload.accountId)
          const latestRevision = await readCurrentRevision(
            token,
            attempt.payload.accountId,
          )
          assertCurrent(token)
          if (
            !command.uncertain &&
            latestRevision !== attempt.payload.expectedRevision
          )
            throw new Error(
              "Bank evidence changed before submission. Review the statement again.",
            )
          await assertScope(token)
          assertCurrent(token)
          return mutation.mutateAsync({
            ...attempt.payload,
            clientCommandId,
          })
        },
      })
    } catch (failure) {
      if (current(token))
        setError(
          failure instanceof Error
            ? failure.message
            : "The statement import could not be confirmed.",
        )
    } finally {
      if (current(token)) setConfirming(false)
    }
  }

  if (accounts.length === 0)
    return (
      <p>
        Create an active bank or clearing account before importing a statement.
      </p>
    )

  if (
    command.uncertain &&
    savedAccountId &&
    !accounts.some((account) => account.id === savedAccountId)
  )
    return (
      <Alert appearance="dashboard">
        <AlertDescription>
          The saved bank account is no longer active in this finance book. The
          unresolved import cannot be retried from this sheet.
        </AlertDescription>
      </Alert>
    )

  if (
    currentScope.current.actorUserId !== initialScope.current.actorUserId ||
    currentScope.current.tenantId !== initialScope.current.tenantId ||
    currentScope.current.bookId !== initialScope.current.bookId
  )
    return (
      <Alert appearance="dashboard">
        <AlertDescription>
          The finance scope changed. Close and reopen this import sheet before
          continuing.
        </AlertDescription>
      </Alert>
    )

  if (review) {
    const reviewCommand = {
      ...command,
      pending: command.pending || confirming,
    }
    return (
      <FinanceReview
        command={reviewCommand}
        onBack={() => setReview(null)}
        onConfirm={() => void confirmImport()}
        confirmDisabled={confirming || !online}
        backDisabled={!review.recoveryReentry && command.uncertain}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Statement</p>
            <p className="font-medium">{review.payload.reference}</p>
            <p className="text-sm text-muted-foreground">
              {review.fileName} · {review.rowCount} transactions
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Bank account</p>
            <p className="font-medium">{review.accountName}</p>
            <p className="text-sm text-muted-foreground">
              {review.payload.startsAt.toISOString().slice(0, 10)} –{" "}
              {review.payload.endsAt.toISOString().slice(0, 10)} · evidence
              revision {review.payload.expectedRevision}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <BalanceSummary
            label="Opening balance"
            value={review.openingBalanceMinor}
            currencyCode={book.currencyCode}
          />
          <BalanceSummary
            label="Transactions"
            value={review.transactionTotalMinor}
            currencyCode={book.currencyCode}
          />
          <BalanceSummary
            label="Closing balance"
            value={review.closingBalanceMinor}
            currencyCode={book.currencyCode}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Opening balance plus signed transactions equals closing balance.
          Importing preserves the original bank evidence; it does not post money
          to the ledger.
        </p>
        <p className="text-xs text-muted-foreground">
          Columns: ID “{review.payload.columns.transactionId}”, date “
          {review.payload.columns.date}”, amount “
          {review.payload.columns.amount}”, description “
          {review.payload.columns.description}” ·{" "}
          {review.payload.units === "MAJOR" ? "major" : "minor"} units.
        </p>
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
        <div className="max-h-[min(48vh,32rem)] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Transaction ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Signed amount</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {review.rows.map((row) => (
                <TableRow key={row.externalId}>
                  <TableCell className="font-mono text-xs">
                    {row.externalId}
                  </TableCell>
                  <TableCell>
                    {row.occurredAt.toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatFinanceMoney(
                      row.amountMinor.toString(),
                      book.currencyCode,
                    )}
                  </TableCell>
                  <TableCell className="max-w-sm whitespace-pre-wrap">
                    {row.description}
                  </TableCell>
                </TableRow>
              ))}
              {review.rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-6 text-center text-muted-foreground"
                  >
                    This statement has no transaction rows. Its opening and
                    closing balances match.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </FinanceReview>
    )
  }

  return (
    <form onSubmit={form.handleSubmit((values) => void prepare(values))}>
      <FieldGroup className="min-w-0 grid gap-5">
        <p className="text-sm text-muted-foreground">
          Import a completed bank statement as original evidence. Transactions
          are not posted to the finance ledger.
        </p>
        {command.uncertain ? (
          <Alert appearance="dashboard">
            <AlertDescription>
              An earlier import is unresolved. Re-select the original CSV and
              re-enter its exact statement details. The saved account and
              evidence revision will be reused; changed details cannot start a
              new import until recovery is resolved.
            </AlertDescription>
          </Alert>
        ) : null}
        <FinanceField label="CSV statement">
          <Input
            type="file"
            accept=".csv,text/csv,application/csv,text/plain,application/vnd.ms-excel"
            disabled={reading || preparing || command.pending || command.saved}
            onChange={(event) => {
              const selected = event.currentTarget.files?.[0]
              event.currentTarget.value = ""
              void selectFile(selected)
            }}
            aria-invalid={Boolean(error)}
          />
        </FinanceField>
        {fileName ? (
          <p
            className="truncate text-sm text-muted-foreground"
            title={fileName}
          >
            {fileName} · {csv.length.toLocaleString("en-NG")} characters · up to{" "}
            {FINANCE_BANK_STATEMENT_MAX_ROWS} rows
          </p>
        ) : null}
        {headers.length > 0 ? (
          <>
            <FinanceField
              label="Bank or clearing account"
              error={form.formState.errors.accountId?.message}
            >
              <FormSelectControl
                control={form.control}
                name="accountId"
                disabled={
                  Boolean(savedAccountId) || preparing || command.pending
                }
                options={accounts.map((account) => ({
                  value: account.id,
                  label: account.name,
                }))}
              />
            </FinanceField>
            <FinanceField
              label="Statement reference"
              error={form.formState.errors.reference?.message}
            >
              <Input
                {...form.register("reference")}
                maxLength={160}
                placeholder="Bank statement · January 2025"
              />
            </FinanceField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FinanceField
                label="Statement starts (UTC)"
                error={form.formState.errors.startsOn?.message}
              >
                <FormDateControl
                  control={form.control}
                  name="startsOn"
                  type="date"
                  min={new Date(book.startsAt).toISOString().slice(0, 10)}
                  max={yesterdayUtc()}
                  disabled={preparing}
                />
              </FinanceField>
              <FinanceField
                label="Statement ends (UTC)"
                error={form.formState.errors.endsOn?.message}
              >
                <FormDateControl
                  control={form.control}
                  name="endsOn"
                  type="date"
                  min={new Date(book.startsAt).toISOString().slice(0, 10)}
                  max={yesterdayUtc()}
                  disabled={preparing}
                />
              </FinanceField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FinanceField
                label={`Opening balance (${book.currencyCode})`}
                error={form.formState.errors.openingBalance?.message}
              >
                <Input
                  {...form.register("openingBalance")}
                  inputMode="decimal"
                  placeholder="0.00 or -0.00"
                  disabled={preparing}
                />
              </FinanceField>
              <FinanceField
                label={`Closing balance (${book.currencyCode})`}
                error={form.formState.errors.closingBalance?.message}
              >
                <Input
                  {...form.register("closingBalance")}
                  inputMode="decimal"
                  placeholder="0.00 or -0.00"
                  disabled={preparing}
                />
              </FinanceField>
            </div>
            <div>
              <h3 className="mb-3 font-medium">Map the original CSV columns</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <ColumnSelect
                  label="Original transaction ID"
                  control={form.control}
                  name="transactionIdColumn"
                  headers={headers}
                  error={form.formState.errors.transactionIdColumn?.message}
                  disabled={preparing}
                />
                <ColumnSelect
                  label="Transaction date"
                  control={form.control}
                  name="dateColumn"
                  headers={headers}
                  error={form.formState.errors.dateColumn?.message}
                  disabled={preparing}
                />
                <ColumnSelect
                  label="Signed amount"
                  control={form.control}
                  name="amountColumn"
                  headers={headers}
                  error={form.formState.errors.amountColumn?.message}
                  disabled={preparing}
                />
                <ColumnSelect
                  label="Description"
                  control={form.control}
                  name="descriptionColumn"
                  headers={headers}
                  error={form.formState.errors.descriptionColumn?.message}
                  disabled={preparing}
                />
              </div>
            </div>
            <FinanceField
              label="CSV amount units"
              error={form.formState.errors.units?.message}
            >
              <FormSelectControl
                control={form.control}
                name="units"
                disabled={preparing}
                options={[
                  { value: "MAJOR", label: "Major units (for example 125.50)" },
                  { value: "MINOR", label: "Minor units (for example 12550)" },
                ]}
              />
            </FinanceField>
          </>
        ) : null}
        {error && !review ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
        <FormActions>
          <SubmitButton
            type="submit"
            isSubmitting={reading || preparing}
            disabled={
              !csv ||
              reading ||
              preparing ||
              !command.ready ||
              !online ||
              command.pending ||
              command.saved
            }
          >
            {reading
              ? "Reading CSV…"
              : preparing
                ? "Checking statement…"
                : "Review statement"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}

function BalanceSummary({
  label,
  value,
  currencyCode,
}: {
  label: string
  value: string
  currencyCode: string
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">
        {formatFinanceMoney(value, currencyCode)}
      </p>
    </div>
  )
}

function ColumnSelect({
  label,
  control,
  name,
  headers,
  error,
  disabled,
}: {
  label: string
  control: Control<Values>
  name:
    | "transactionIdColumn"
    | "dateColumn"
    | "amountColumn"
    | "descriptionColumn"
  headers: readonly string[]
  error?: string
  disabled?: boolean
}) {
  return (
    <FinanceField label={label} error={error}>
      <FormSelectControl
        control={control}
        name={name}
        disabled={disabled}
        options={[
          { value: "", label: "Choose a CSV column" },
          ...headers.map((header) => ({ value: header, label: header })),
        ]}
      />
    </FinanceField>
  )
}
