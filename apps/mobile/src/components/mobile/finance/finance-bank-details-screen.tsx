import { ActionButton } from "@/components/mobile/action-button"
import { ClassicCustomerBookFilter } from "@/components/mobile/appearances/classic/customer-book-screen"
import { FormField } from "@/components/mobile/form-field"
import {
  accountNumberError,
  accountNumberInput,
  errorCode,
  errorMessage,
  newOperationId,
} from "@/components/mobile/payment-links/payment-link-model"
import { InfoNote } from "@/components/mobile/payment-links/payment-link-parts"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import {
  type AlertDraft,
  alertSettingsFrom,
  alertsSubmission,
  initialDraft,
} from "@ewatrade/utils/payment-alerts-view"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useRouter } from "expo-router"
import { useState } from "react"
import { FinanceFormBody } from "./finance-form-body"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { PaymentAlertsEditor } from "./payment-alerts-editor"

const COMMON_BANKS = [
  "Access Bank",
  "First Bank",
  "GTBank",
  "Kuda",
  "Moniepoint",
  "OPay",
  "PalmPay",
  "UBA",
  "Wema Bank",
  "Zenith Bank",
] as const

/**
 * Bank details customers see on payment links. Without an account id this
 * adds a new bank money account; otherwise it edits one. Owner/Admin only.
 */
export function FinanceBankDetailsScreen({
  accountId,
}: { accountId?: string }) {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <BankDetailsWorkspace
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}:${accountId ?? "new"}`}
          {...workspace}
          accountId={accountId}
        />
      )}
    </FinanceWorkspaceGate>
  )
}

function BankDetailsWorkspace({
  book,
  accountId,
}: FinanceWorkspace & { accountId?: string }) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const accounts = useQuery(
    trpc.businessBanking.accounts.queryOptions(
      { bookId: book.id },
      { enabled: !offline && Boolean(accountId), retry: false },
    ),
  )
  if (!accountId) return <BankDetailsForm bookId={book.id} />
  if (accounts.isPending)
    return (
      <View className="gap-4 px-[18px]">
        <Skeleton className="h-16 rounded-[14px]" />
        <Skeleton className="h-16 rounded-[14px]" />
        <Skeleton className="h-16 rounded-[14px]" />
      </View>
    )
  const account = accounts.data?.find((candidate) => candidate.id === accountId)
  if (accounts.isError || !account)
    return (
      <View className="px-[18px]">
        <StatusBanner
          icon="AlertCircle"
          title="Bank account unavailable"
          message={
            accounts.isError
              ? errorMessage(accounts.error, "Try again in a moment.")
              : "Only active bank money accounts can hold bank details."
          }
          tone="destructive"
          actionLabel={accounts.isError ? "Try again" : undefined}
          onActionPress={() => void accounts.refetch()}
        />
      </View>
    )
  return (
    <BankDetailsForm
      bookId={book.id}
      existing={{
        id: account.id,
        name: account.name,
        bankName: account.bankName ?? "",
        accountNumber: account.bankAccountNumber ?? "",
        accountHolder: account.bankAccountHolder ?? "",
      }}
    />
  )
}

function BankDetailsForm({
  bookId,
  existing,
}: {
  bookId: string
  existing?: {
    id: string
    name: string
    bankName: string
    accountNumber: string
    accountHolder: string
  }
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [name, setName] = useState("")
  const [bankName, setBankName] = useState(existing?.bankName ?? "")
  const [accountNumber, setAccountNumber] = useState(
    existing?.accountNumber ?? "",
  )
  const [holder, setHolder] = useState(existing?.accountHolder ?? "")
  // One id per form attempt, so a retried add can't create two accounts.
  const [clientAccountId] = useState(() =>
    newOperationId("bank-account", Crypto.randomUUID()),
  )
  const [problem, setProblem] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  // Fresh each time the form opens: who can get alerts and what the plan allows now.
  const alertSettings = useQuery(
    trpc.businessBanking.notificationSettings.queryOptions(
      { bookId, accountId: existing?.id },
      {
        enabled: !offline,
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always",
        select: alertSettingsFrom,
      },
    ),
  )
  // Once edited, the draft keeps the revision it started from; refetches never move it.
  const [editedDraft, setDraft] = useState<AlertDraft | null>(null)
  const draft =
    editedDraft ??
    (alertSettings.isSuccess ? initialDraft(alertSettings.data) : null)
  const alerts = alertsSubmission({
    settings: alertSettings.data ?? null,
    draft,
    loading: alertSettings.isPending,
  })
  // Only alerts someone has set up can hold the save; bank details never wait on them.
  const alertsBlocked = alerts.problem !== null
  async function saved() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.businessBanking.accounts.pathFilter()),
      queryClient.invalidateQueries(
        trpc.businessBanking.linkCandidates.pathFilter(),
      ),
      queryClient.invalidateQueries(trpc.finance.balances.pathFilter()),
      queryClient.invalidateQueries(trpc.orders.paymentAccounts.pathFilter()),
    ])
    router.back()
  }
  // The server rechecks people, contacts and the plan. Any refusal keeps the draft, shows
  // its message and reloads the alert settings so the form shows what changed.
  const onError = (
    failure: unknown,
    variables: { paymentAlerts?: unknown },
  ) => {
    setProblem(
      errorCode(failure) === "FORBIDDEN" && !variables.paymentAlerts
        ? "Only owners and admins can change bank details."
        : errorMessage(failure, "The bank details couldn't be saved."),
    )
    void alertSettings.refetch()
  }
  const save = useMutation(
    trpc.businessBanking.saveBankDetails.mutationOptions({
      onError,
      onSuccess: saved,
    }),
  )
  const create = useMutation(
    trpc.businessBanking.createBankAccount.mutationOptions({
      onError,
      onSuccess: saved,
    }),
  )
  const pending = save.isPending || create.isPending
  const numberError = accountNumberError(accountNumber)
  const ready =
    !offline &&
    !pending &&
    Boolean(bankName.trim()) &&
    accountNumber.length === 10 &&
    Boolean(holder.trim()) &&
    (existing ? true : Boolean(name.trim()))
  return (
    <FinanceFormBody>
      {existing ? (
        <Text className="text-lg font-extrabold text-foreground">
          {existing.name}
        </Text>
      ) : (
        <FormField
          label="Account name"
          maxLength={100}
          onChangeText={setName}
          placeholder="GTBank current, Shop account…"
          value={name}
        />
      )}
      <View className="gap-1">
        <Text className="text-sm font-bold text-foreground">
          Bank details for customers
        </Text>
        <Text className="text-xs text-muted-foreground">
          When you pick this account on a payment link, customers see these
          details.
        </Text>
      </View>
      <FormField
        label="Bank"
        maxLength={100}
        onChangeText={setBankName}
        placeholder="Your bank's name"
        value={bankName}
      />
      <View className="flex-row flex-wrap gap-2">
        {COMMON_BANKS.map((bank) => (
          <ClassicCustomerBookFilter
            key={bank}
            active={bankName.trim() === bank}
            label={bank}
            onPress={() => setBankName(bank)}
          />
        ))}
      </View>
      <FormField
        error={numberError}
        keyboardType="number-pad"
        label="Account number"
        maxLength={10}
        onChangeText={(value) => setAccountNumber(accountNumberInput(value))}
        placeholder="10 digits"
        value={accountNumber}
      />
      <FormField
        autoCapitalize="characters"
        helper="Write it exactly as your bank shows it. Customers check this name before they pay."
        label="Account holder name"
        maxLength={160}
        onChangeText={setHolder}
        placeholder="As your bank shows it"
        value={holder}
      />
      <InfoNote>
        EwaTrade doesn't connect to this bank. Links already sent keep the
        details they were created with. You confirm each payment yourself.
      </InfoNote>
      <PaymentAlertsEditor
        settings={alertSettings.data}
        isPending={alertSettings.isPending && !offline}
        error={
          alertSettings.isError
            ? errorMessage(alertSettings.error, "Payment alerts couldn't load.")
            : offline && !alertSettings.data
              ? "Reconnect to see payment alerts."
              : null
        }
        draft={draft}
        onDraft={setDraft}
        onUseSaved={() => setDraft(null)}
        problem={tried ? alerts.problem : null}
        disabled={pending || offline}
        onRetry={() => void alertSettings.refetch()}
      />
      {offline ? (
        <StatusBanner
          icon="WifiOff"
          message="Reconnect to save bank details."
          tone="warning"
        />
      ) : null}
      {problem ? <StatusBanner tone="destructive" message={problem} /> : null}
      {tried && alertsBlocked && !offline ? (
        // The form scrolls, so say why Save did nothing next to it.
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs text-destructive"
        >
          Check payment alerts above before you save.
        </Text>
      ) : null}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <ActionButton
            disabled={pending}
            variant="outline"
            onPress={() => router.back()}
          >
            Cancel
          </ActionButton>
        </View>
        <View className="flex-1">
          <ActionButton
            disabled={!ready}
            isLoading={pending}
            loadingLabel="Saving…"
            onPress={() => {
              setProblem(null)
              setTried(true)
              if (alertsBlocked) return
              const details = {
                bookId,
                bankName: bankName.trim(),
                accountNumber,
                accountHolder: holder.trim(),
                ...(alerts.send ? { paymentAlerts: alerts.payload } : {}),
              }
              if (existing) save.mutate({ ...details, accountId: existing.id })
              else
                create.mutate({
                  ...details,
                  name: name.trim(),
                  clientAccountId,
                })
            }}
          >
            {existing ? "Save" : "Add account"}
          </ActionButton>
        </View>
      </View>
    </FinanceFormBody>
  )
}
