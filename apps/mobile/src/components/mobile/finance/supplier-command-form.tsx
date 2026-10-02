import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { financeUtcDate } from "@/lib/finance-expense-input"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import type { FinanceWorkspace } from "./finance-workspace-gate"
import {
  beginSupplierCommandPreparation,
  createSupplierCommandAuthority,
  invalidateSupplierCommandAuthority,
  isSupplierCommandPreparationCurrent,
  reconcileSupplierCommandScope,
} from "./supplier-command-authority"
import {
  type SupplierAdvancePayload,
  type SupplierOpeningPayload,
  type SupplierReversalPayload,
  prepareSupplierEntry,
  prepareSupplierIdentity,
  prepareSupplierReversal,
} from "./supplier-command-state"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

type Supplier = { id: string; code: string; name: string }
type IdentityPayload = ReturnType<typeof prepareSupplierIdentity>
type Review =
  | { mode: "create"; payload: IdentityPayload }
  | { mode: "opening"; payload: SupplierOpeningPayload }
  | {
      mode: "reversal"
      payload: SupplierReversalPayload
      sourceKind: string
      sourceDescription: string
    }
  | {
      mode: "advance"
      payload: SupplierAdvancePayload
      accountName: string
    }

export function SupplierCommandForm({
  book,
  actorUserId,
  tenantId,
  supplier,
  reversalEntry,
  onBack,
  onRecorded,
}: FinanceWorkspace & {
  supplier?: Supplier
  reversalEntry?: {
    id: string
    kind: string
    description: string
    effectiveAt: Date | string
    reversal: { id: string } | null
  }
  onBack: () => void
  onRecorded: () => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const command = useMobileFinanceCommand({
    actorUserId,
    tenantId,
    bookId: book.id,
  })
  const scope = [
    actorUserId,
    tenantId,
    book.id,
    supplier?.id ?? "new-supplier",
    reversalEntry?.id ?? "entry",
  ].join(":")
  const authority = useRef(createSupplierCommandAuthority(scope))
  authority.current = reconcileSupplierCommandScope(authority.current, scope)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const unsubscribe = useOperationalModeStore.subscribe((next, previous) => {
      if (!previous.isOfflineMode && next.isOfflineMode)
        authority.current = invalidateSupplierCommandAuthority(
          authority.current,
        )
    })
    return () => {
      mounted.current = false
      authority.current = invalidateSupplierCommandAuthority(authority.current)
      unsubscribe()
    }
  }, [])
  function isCurrent(token?: { generation: number; scope: string }) {
    const session = getSession()
    const profile = session?.profile
    const matchesActor =
      profile?.id === actorUserId &&
      profile.businessId === tenantId &&
      ["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? "")
    const online = !useOperationalModeStore.getState().isOfflineMode
    return (
      mounted.current &&
      matchesActor &&
      online &&
      (token
        ? isSupplierCommandPreparationCurrent(
            authority.current,
            token,
            scope,
            true,
          )
        : authority.current.scope === scope)
    )
  }
  const createMutation = useMutation(
    trpc.finance.createSupplier.mutationOptions(),
  )
  const openingMutation = useMutation(
    trpc.finance.recordSupplierOpening.mutationOptions(),
  )
  const advanceMutation = useMutation(
    trpc.finance.recordSupplierAdvance.mutationOptions(),
  )
  const reversalMutation = useMutation(
    trpc.finance.reverseSupplierEntry.mutationOptions(),
  )
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [entryMode, setEntryMode] = useState<"opening" | "advance">("advance")
  const [kind, setKind] = useState<"PAYABLE" | "ADVANCE">("PAYABLE")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [reason, setReason] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [moneyAccountId, setMoneyAccountId] = useState("")
  const [review, setReview] = useState<Review | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  useEffect(() => {
    if (offline && preparing) setPreparing(false)
  }, [offline, preparing])
  const accounts = book.accounts.filter(
    (account) =>
      account.kind === "ASSET" &&
      ["CASH", "BANK", "CLEARING"].includes(account.purpose) &&
      !account.archivedAt,
  )
  const startDate = new Date(book.startsAt).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const opening = entryMode === "opening"

  async function prepare() {
    if (preparing || !command.ready || command.pending || offline) return
    const preparation = beginSupplierCommandPreparation(authority.current, true)
    if (!preparation) return
    setPreparing(true)
    setFormError(null)
    try {
      if (!supplier) {
        if (!isCurrent(preparation)) return
        setReview({
          mode: "create",
          payload: prepareSupplierIdentity({ bookId: book.id, code, name }),
        })
        return
      }

      // Confirm current same-book supplier authority before making a monetary draft.
      const statement = await client.fetchQuery(
        trpc.finance.supplierStatement.queryOptions(
          { bookId: book.id, supplierId: supplier.id, limit: 1 },
          { staleTime: 0, retry: false },
        ),
      )
      if (!isCurrent(preparation)) return
      if (
        statement.supplier.id !== supplier.id ||
        statement.supplier.bookId !== book.id
      )
        throw new Error(
          "This supplier is not available in the current finance book.",
        )

      if (reversalEntry) {
        if (
          reversalEntry.reversal ||
          !["OPENING_PAYABLE", "OPENING_ADVANCE", "ADVANCE"].includes(
            reversalEntry.kind,
          )
        )
          throw new Error("This source entry cannot be reversed here.")
        setReview({
          mode: "reversal",
          payload: prepareSupplierReversal({
            bookId: book.id,
            entryId: reversalEntry.id,
            reason,
            date,
            originalAt: reversalEntry.effectiveAt,
            today,
          }),
          sourceKind: reversalEntry.kind,
          sourceDescription: reversalEntry.description,
        })
        return
      }

      if (opening) {
        setReview({
          mode: "opening",
          payload: prepareSupplierEntry({
            bookId: book.id,
            supplierId: supplier.id,
            amount,
            description,
            date,
            startsAt: book.startsAt,
            kind,
            opening: true,
          }),
        })
        return
      }

      // Refresh account authority instead of relying on the book object captured at mount.
      const currentBook = await client.fetchQuery(
        trpc.finance.book.queryOptions(undefined, {
          staleTime: 0,
          retry: false,
        }),
      )
      if (!isCurrent(preparation)) return
      if (currentBook?.id !== book.id)
        throw new Error("The active finance book could not be confirmed.")
      const currentAccounts = currentBook.accounts.filter(
        (account) =>
          account.kind === "ASSET" &&
          ["CASH", "BANK", "CLEARING"].includes(account.purpose) &&
          !account.archivedAt,
      )
      const account = currentAccounts.find((item) => item.id === moneyAccountId)
      if (!account)
        throw new Error(
          "Choose a currently active cash, bank, or clearing account.",
        )
      setReview({
        mode: "advance",
        payload: prepareSupplierEntry({
          bookId: book.id,
          supplierId: supplier.id,
          amount,
          description,
          date,
          startsAt: book.startsAt,
          today,
          moneyAccountId: account.id,
          activeMoneyAccountIds: currentAccounts.map((item) => item.id),
        }),
        accountName: account.name,
      })
    } catch (failure) {
      if (isCurrent(preparation))
        setFormError(
          failure instanceof Error
            ? failure.message
            : "Check the supplier entry details.",
        )
    } finally {
      if (isCurrent(preparation)) setPreparing(false)
    }
  }

  async function confirm() {
    if (!review || offline) return
    const preparation = beginSupplierCommandPreparation(authority.current, true)
    if (!preparation) return
    let accepted = false
    if (review.mode === "create") {
      const payload = review.payload
      accepted = await command.run(
        "createSupplier",
        payload,
        (clientCommandId) =>
          createMutation.mutateAsync({ ...payload, clientCommandId }),
        "Supplier added to this finance book.",
      )
    } else if (review.mode === "opening") {
      const payload = review.payload
      accepted = await command.run(
        "recordSupplierOpening",
        payload,
        (clientCommandId) =>
          openingMutation.mutateAsync({ ...payload, clientCommandId }),
        "Supplier opening entry recorded.",
      )
    } else if (review.mode === "reversal") {
      const payload = review.payload
      accepted = await command.run(
        "reverseSupplierEntry",
        payload,
        (clientCommandId) =>
          reversalMutation.mutateAsync({ ...payload, clientCommandId }),
        "Supplier entry reversal recorded.",
      )
    } else {
      const payload = review.payload
      accepted = await command.run(
        "recordSupplierAdvance",
        payload,
        (clientCommandId) =>
          advanceMutation.mutateAsync({ ...payload, clientCommandId }),
        "Supplier advance recorded.",
      )
    }
    if (accepted && isCurrent(preparation)) onRecorded()
  }

  function handleRecorded() {
    if (isCurrent()) onRecorded()
  }

  const disabled = !command.ready || command.pending || offline || preparing
  return (
    <KeyboardAwareScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pb-12"
      keyboardShouldPersistTaps="handled"
    >
      <ActionButton variant="ghost" disabled={command.pending} onPress={onBack}>
        ‹ {supplier ? "Supplier account" : "Suppliers"}
      </ActionButton>
      <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Supplier accounts · {book.currencyCode}
      </Text>
      <Text className="text-2xl font-bold">
        {review
          ? review.mode === "reversal"
            ? "Review supplier correction"
            : "Review before recording"
          : supplier
            ? "Record supplier entry"
            : "Add supplier"}
      </Text>
      <Text className="text-sm text-muted-foreground">
        {review?.mode === "create"
          ? "This creates a supplier identity only. It does not record a balance, purchase, or cash movement."
          : review?.mode === "reversal"
            ? "This posts a linked opposite entry and keeps the original in history. Advance reversals are refused until consumed portions are released."
            : review?.mode === "opening"
              ? "Opening balances use the bookkeeping start date. Payables and held advances remain separate."
              : review?.mode === "advance"
                ? "This records a reported payment into supplier advances. It does not initiate a transfer or confirm an inventory receipt."
                : supplier
                  ? `${supplier.code} · ${supplier.name}. Each submission is checked against the current finance book before review.`
                  : "Create the supplier identity first. Opening balances and paid advances are separate dated entries."}
      </Text>
      <FinanceCommandFeedback
        command={command}
        onRecorded={handleRecorded}
        onRejected={() => setReview(null)}
      />
      {formError ? (
        <StatusBanner
          title="Check these details"
          message={formError}
          tone="destructive"
        />
      ) : null}
      {review ? (
        <View className="gap-3 rounded-2xl border border-border bg-card p-4">
          <Text className="text-base font-semibold">
            {review.mode === "create"
              ? "New supplier"
              : review.mode === "reversal"
                ? `Correct ${review.sourceKind.replaceAll("_", " ")}`
                : review.mode === "opening"
                  ? review.payload.kind === "PAYABLE"
                    ? "Opening payable"
                    : "Opening held advance"
                  : "Paid supplier advance"}
          </Text>
          {review.mode === "create" ? (
            <>
              <Text>Code · {review.payload.code}</Text>
              <Text>Name · {review.payload.name}</Text>
            </>
          ) : review.mode === "reversal" ? (
            <>
              <Text>
                {supplier?.code} · {supplier?.name}
              </Text>
              <Text>Original · {review.sourceKind.replaceAll("_", " ")}</Text>
              <Text>{review.sourceDescription}</Text>
              <Text>
                Correction date ·{" "}
                {review.payload.effectiveAt.toISOString().slice(0, 10)} UTC
              </Text>
              <Text>Reason · {review.payload.reason}</Text>
            </>
          ) : (
            <>
              <Text>
                {supplier?.code} · {supplier?.name}
              </Text>
              <Text className="text-xl font-bold">
                {formatFinanceMoney(
                  review.payload.amountMinor,
                  book.currencyCode,
                )}
              </Text>
              <Text>
                {review.payload.effectiveAt.toISOString().slice(0, 10)} UTC
                {review.mode === "advance"
                  ? ` · paid from ${review.accountName}`
                  : ""}
              </Text>
              <Text>{review.payload.description}</Text>
            </>
          )}
          <ActionButton
            disabled={disabled}
            isLoading={command.pending}
            onPress={() => void confirm()}
          >
            Confirm and record
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={() => setReview(null)}
          >
            Back to details
          </ActionButton>
        </View>
      ) : !supplier ? (
        <View className="gap-4">
          <FormField
            label="Supplier code"
            value={code}
            onChangeText={setCode}
            maxLength={40}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <FormField
            label="Supplier name"
            value={name}
            onChangeText={setName}
            maxLength={160}
            autoCapitalize="words"
          />
          <ActionButton
            disabled={disabled}
            isLoading={preparing}
            onPress={() => void prepare()}
          >
            Review supplier
          </ActionButton>
        </View>
      ) : reversalEntry ? (
        <View className="gap-4">
          <StatusBanner
            title="Original supplier entry"
            message={`${reversalEntry.kind.replaceAll("_", " ")} · ${new Date(reversalEntry.effectiveAt).toISOString().slice(0, 10)} UTC · ${reversalEntry.description}. The original source remains in history.`}
            tone="warning"
          />
          <FormField
            label="Correction reason"
            value={reason}
            onChangeText={setReason}
            maxLength={400}
            multiline
          />
          <FormField
            label="Correction date (YYYY-MM-DD, UTC)"
            value={date}
            onChangeText={setDate}
            maxLength={10}
            autoCapitalize="none"
          />
          <ActionButton
            disabled={disabled}
            isLoading={preparing}
            onPress={() => void prepare()}
          >
            Review correction
          </ActionButton>
        </View>
      ) : (
        <View className="gap-4">
          <View className="flex-row gap-2">
            <ActionButton
              className="flex-1"
              variant={opening ? "secondary" : "outline"}
              disabled={disabled}
              onPress={() => {
                setEntryMode("opening")
                setDate(startDate)
              }}
            >
              Opening entry
            </ActionButton>
            <ActionButton
              className="flex-1"
              variant={!opening ? "secondary" : "outline"}
              disabled={disabled}
              onPress={() => {
                setEntryMode("advance")
                setDate(today)
              }}
            >
              Paid advance
            </ActionButton>
          </View>
          {opening ? (
            <View className="flex-row gap-2">
              {(["PAYABLE", "ADVANCE"] as const).map((value) => (
                <ActionButton
                  key={value}
                  className="flex-1"
                  variant={kind === value ? "secondary" : "outline"}
                  disabled={disabled}
                  onPress={() => setKind(value)}
                >
                  {value === "PAYABLE" ? "Opening payable" : "Held advance"}
                </ActionButton>
              ))}
            </View>
          ) : null}
          <Text className="text-sm text-muted-foreground">
            {opening
              ? `Opening entries use ${startDate} UTC. Each supplier can have one source of each type, even if an earlier entry was reversed.`
              : "Choose a date from the book start date through today (UTC)."}
          </Text>
          <MoneyField
            currencyCode={book.currencyCode}
            label={`Amount (${book.currencyCode})`}
            value={amount}
            onChangeValue={setAmount}
          />
          {!opening ? (
            <View className="gap-2">
              <Text className="text-xs font-bold uppercase tracking-[1.4px]">
                Paid from · active accounts
              </Text>
              {accounts.length ? (
                accounts.map((account) => (
                  <ActionButton
                    key={account.id}
                    variant={
                      moneyAccountId === account.id ? "secondary" : "outline"
                    }
                    disabled={disabled}
                    onPress={() => setMoneyAccountId(account.id)}
                  >
                    {account.name} · {account.purpose.toLowerCase()}
                  </ActionButton>
                ))
              ) : (
                <StatusBanner
                  message="Create an active cash, bank, or clearing account before recording a paid supplier advance."
                  tone="warning"
                />
              )}
            </View>
          ) : null}
          <FormField
            label="Description"
            value={description}
            onChangeText={setDescription}
            maxLength={400}
            multiline
          />
          {!opening ? (
            <FormField
              label="Date (YYYY-MM-DD, UTC)"
              value={date}
              onChangeText={setDate}
              maxLength={10}
              autoCapitalize="none"
            />
          ) : null}
          <ActionButton
            disabled={disabled || (!opening && accounts.length === 0)}
            isLoading={preparing}
            onPress={() => void prepare()}
          >
            Review entry
          </ActionButton>
        </View>
      )}
    </KeyboardAwareScrollView>
  )
}
