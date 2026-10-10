import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { createSupplierFixture } from "@/internal-tooling/fixture-recipes"
import { financeUtcDate } from "@/lib/finance-expense-input"
import { getSession } from "@/lib/session-store"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { ClassicCustomerBookFilter } from "../appearances/classic/customer-book-screen"
import { ListCard } from "../green-till/kit"
import { FinanceBankDateField } from "./finance-bank-date-field"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { financeDisplayDate } from "./finance-display"
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
  const quickFillSnapshot = useRef<{ code: string; name: string } | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
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
      contentContainerClassName="gap-4 px-[18px] pb-12"
      keyboardShouldPersistTaps="handled"
    >
      {/* The modal bar names this step and steps back. */}
      <Text className="px-0.5 text-xs text-muted-foreground">
        {review?.mode === "create"
          ? "This creates the supplier only. It records no balance, purchase or payment."
          : review?.mode === "reversal"
            ? "This adds a linked opposite entry and keeps the original."
            : review?.mode === "opening"
              ? "Opening balances use the book start date. Payables and advances stay separate."
              : review?.mode === "advance"
                ? "This records money already paid to the supplier. It does not send money or receive stock."
                : supplier
                  ? `${supplier.name} · ${supplier.code} · ${book.currencyCode}`
                  : "Add the supplier first. Balances and advances are recorded afterwards."}
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
        <View className="gap-4">
          <ListCard>
            {(review.mode === "create"
              ? [
                  ["New supplier", review.payload.name],
                  ["Code", review.payload.code],
                ]
              : review.mode === "reversal"
                ? [
                    ["Correct", supplierEntryLabel(review.sourceKind)],
                    ["Original", review.sourceDescription],
                    ["Date", financeDisplayDate(review.payload.effectiveAt)],
                    ["Reason", review.payload.reason],
                  ]
                : [
                    [
                      review.mode === "opening"
                        ? review.payload.kind === "PAYABLE"
                          ? "Opening payable"
                          : "Opening held advance"
                        : "Paid advance",
                      formatFinanceMoney(
                        review.payload.amountMinor,
                        book.currencyCode,
                      ),
                    ],
                    ["Date", financeDisplayDate(review.payload.effectiveAt)],
                    ...(review.mode === "advance"
                      ? [["Paid from", review.accountName]]
                      : []),
                    ["Description", review.payload.description],
                  ]
            ).map(([label, value]) => (
              <View
                key={label}
                className="min-h-11 flex-row items-start justify-between gap-3 py-3"
              >
                <Text className="text-sm text-muted-foreground">{label}</Text>
                <Text className="min-w-0 flex-1 text-right text-sm font-bold text-foreground">
                  {value}
                </Text>
              </View>
            ))}
          </ListCard>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <ActionButton
                variant="outline"
                disabled={command.pending}
                onPress={() => setReview(null)}
              >
                Back
              </ActionButton>
            </View>
            <View className="flex-1">
              <ActionButton
                disabled={disabled}
                isLoading={command.pending}
                onPress={() => void confirm()}
              >
                Confirm
              </ActionButton>
            </View>
          </View>
          <Text className="px-0.5 text-xs text-muted-foreground">
            Nothing is saved until you confirm.
          </Text>
        </View>
      ) : !supplier ? (
        <View className="gap-4">
          <QaQuickFillButton
            canUndo={canUndoQuickFill}
            formId="mobile.finance.supplier"
            isDirty={Boolean(code || name)}
            onFill={(context, sequence) => {
              quickFillSnapshot.current = { code, name }
              const fixture = createSupplierFixture(context, sequence)
              setCode(fixture.code)
              setName(fixture.name)
              setFormError(null)
              setCanUndoQuickFill(true)
            }}
            onUndo={() => {
              const snapshot = quickFillSnapshot.current
              if (!snapshot) return
              setCode(snapshot.code)
              setName(snapshot.name)
              quickFillSnapshot.current = null
              setCanUndoQuickFill(false)
            }}
          />
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
          <View className="gap-0.5 rounded-[20px] bg-card px-4 py-3 shadow-sm">
            <Text className="text-xs font-bold text-muted-foreground">
              {supplierEntryLabel(reversalEntry.kind)} ·{" "}
              {financeDisplayDate(reversalEntry.effectiveAt)}
            </Text>
            <Text className="text-sm text-foreground">
              {reversalEntry.description}
            </Text>
          </View>
          <FormField
            label="Correction reason"
            value={reason}
            onChangeText={setReason}
            maxLength={400}
            multiline
          />
          <FinanceBankDateField
            label="Correction date"
            value={date}
            onChange={setDate}
            minimum={new Date(reversalEntry.effectiveAt)
              .toISOString()
              .slice(0, 10)}
            maximum={today}
            disabled={disabled}
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
          <Segmented
            label="Type"
            disabled={disabled}
            options={[
              ["opening", "Opening entry"],
              ["advance", "Paid advance"],
            ]}
            value={entryMode}
            onChange={(value) => {
              setEntryMode(value)
              setDate(value === "opening" ? startDate : today)
            }}
          />
          {opening ? (
            <Segmented
              label="Opening balance"
              hint={`Uses the book start date, ${financeDisplayDate(`${startDate}T00:00:00.000Z`)}. One opening source of each type per supplier.`}
              disabled={disabled}
              options={[
                ["PAYABLE", "Payable"],
                ["ADVANCE", "Held advance"],
              ]}
              value={kind}
              onChange={setKind}
            />
          ) : null}
          <MoneyField
            currencyCode={book.currencyCode}
            label={`Amount (${book.currencyCode})`}
            value={amount}
            onChangeValue={setAmount}
          />
          {!opening ? (
            <View className="gap-2">
              <Text className="px-0.5 text-xs font-bold text-muted-foreground">
                Paid from
              </Text>
              {accounts.length ? (
                <View className="flex-row flex-wrap gap-2">
                  {accounts.map((account) => (
                    <ClassicCustomerBookFilter
                      key={account.id}
                      active={moneyAccountId === account.id}
                      label={account.name}
                      onPress={() => {
                        if (!disabled) setMoneyAccountId(account.id)
                      }}
                    />
                  ))}
                </View>
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
            <FinanceBankDateField
              label="Date paid"
              value={date}
              onChange={setDate}
              minimum={startDate}
              maximum={today}
              disabled={disabled}
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

function supplierEntryLabel(kind: string) {
  const words = kind.replaceAll("_", " ").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Two-choice segmented control inside a card, per the 22/01 entry form. */
function Segmented<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  options: readonly (readonly [T, string])[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <View className="gap-1.5">
      <Text className="px-0.5 text-xs font-bold text-muted-foreground">
        {label}
      </Text>
      <View className="flex-row gap-1.5 rounded-xl bg-muted p-1">
        {options.map(([option, text]) => {
          const selected = option === value
          return (
            <View
              key={option}
              className={cn(
                "flex-1 rounded-[10px]",
                selected && "bg-card shadow-sm",
              )}
            >
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled }}
                className="min-h-10 items-center justify-center rounded-[10px] px-2"
                disabled={disabled}
                haptic
                onPress={() => onChange(option)}
              >
                <Text
                  className={cn(
                    "text-[13px] font-extrabold",
                    selected ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {text}
                </Text>
              </Pressable>
            </View>
          )
        })}
      </View>
      {hint ? (
        <Text className="px-0.5 text-xs text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  )
}
