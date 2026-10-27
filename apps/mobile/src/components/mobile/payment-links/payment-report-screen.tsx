import { ActionButton } from "@/components/mobile/action-button"
import { ClassicCustomerBookFilter } from "@/components/mobile/appearances/classic/customer-book-screen"
import { FinanceBankDateField } from "@/components/mobile/finance/finance-bank-date-field"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { FinanceChoice } from "@/components/mobile/finance/finance-ledger-layout"
import { PaymentAlertDeliveries } from "@/components/mobile/finance/payment-alert-deliveries"
import { FormField } from "@/components/mobile/form-field"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { SectionHeader, StatusPill } from "@/components/mobile/green-till/kit"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { useWorkflowHeader } from "@/components/mobile/workflow-modal-screen"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { Textarea } from "@/components/ui/textarea"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  formatMinorMoney,
  majorToMinor,
  minorToMajorInput,
} from "@ewatrade/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { ClaimReceipt } from "./claim-receipt"
import { CustomerMessageEditor } from "./customer-message-editor"
import {
  NOT_RECEIVED_REASONS,
  NOT_RECEIVED_REASON_MAX,
  accountSuffix,
  errorCode,
  errorMessage,
  localDay,
  receivedAtFor,
  shortDateTime,
  transferAccounts,
} from "./payment-link-model"
import { type Fact, FactCard, InfoNote } from "./payment-link-parts"

type Report = RouterOutputs["businessBanking"]["report"]
type Decision = RouterOutputs["businessBanking"]["reviewReport"]
type Step = "check" | "confirm" | "not_received" | "result"

/** Review one customer claim against what arrived in the business bank. */
export function PaymentReportScreen({ reportId }: { reportId: string }) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const report = useQuery(
    trpc.businessBanking.report.queryOptions(
      { reportId },
      {
        enabled: !offline && Boolean(reportId),
        retry: false,
        staleTime: 0,
        refetchOnMount: "always",
      },
    ),
  )
  if (offline)
    return (
      <View className="px-[18px]">
        <StatusBanner
          icon="WifiOff"
          title="Reconnect to check this payment"
          message="Confirming a payment needs the latest order balance."
          tone="warning"
        />
      </View>
    )
  if (report.isPending)
    return (
      <View className="px-[18px]">
        <SkeletonGroup accessibilityLabel="Loading payment to check">
          <View className="gap-4">
            <Skeleton height={220} radius={20} />
            <Skeleton height={180} radius={20} />
            <Skeleton height={240} radius={20} />
          </View>
        </SkeletonGroup>
      </View>
    )
  if (report.isError) {
    const code = errorCode(report.error)
    return (
      <View className="px-[18px]">
        <StatusBanner
          icon={code === "FORBIDDEN" ? "Lock" : "AlertCircle"}
          title={
            code === "FORBIDDEN"
              ? "Not permitted"
              : code === "NOT_FOUND"
                ? "Payment not found"
                : "Payment unavailable"
          }
          message={
            code === "FORBIDDEN"
              ? "Only staff who can take payments on orders can check customer payments."
              : code === "NOT_FOUND"
                ? "This payment notification is no longer available to you."
                : errorMessage(report.error, "Try again in a moment.")
          }
          tone="destructive"
          actionLabel={code === "FORBIDDEN" ? undefined : "Try again"}
          onActionPress={() => void report.refetch()}
        />
      </View>
    )
  }
  return (
    <ReviewFlow
      key={`${report.data.reportId}:${report.data.revision}`}
      report={report.data}
      onReload={() => void report.refetch()}
    />
  )
}

function ReviewFlow({
  report,
  onReload,
}: {
  report: Report
  onReload: () => void
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const money = (minor: number) => formatMinorMoney(minor, report.currencyCode)
  const accountsQuery = useQuery(
    trpc.orders.paymentAccounts.queryOptions(undefined, { retry: false }),
  )
  const eligible = transferAccounts(accountsQuery.data?.accounts ?? [])
  const [step, setStep] = useState<Step>("check")
  const [amount, setAmount] = useState("")
  const [accountId, setAccountId] = useState<string | null>(null)
  const [day, setDay] = useState(() => localDay(new Date()))
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [reason, setReason] = useState("")
  const [confirmedAt, setConfirmedAt] = useState<Date | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [problem, setProblem] = useState<{
    code: string | null
    message: string
  } | null>(null)
  const pending = report.status === "SUBMITTED"

  const account =
    eligible.find((candidate) => candidate.id === accountId) ??
    eligible.find((candidate) => candidate.id === report.bankAccountId) ??
    (eligible.length === 1 ? eligible[0] : undefined)
  const receivedMinor = majorToMinor(amount)
  const today = localDay(new Date())
  const amountValid =
    receivedMinor !== null &&
    receivedMinor > 0 &&
    receivedMinor <= report.balanceMinor
  const dayValid = /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today
  const canConfirm = pending && amountValid && Boolean(account) && dayValid
  const left = amountValid ? report.balanceMinor - (receivedMinor ?? 0) : null

  const review = useMutation(
    trpc.businessBanking.reviewReport.mutationOptions({
      onError: (failure) => {
        const code = errorCode(failure)
        setProblem({
          code,
          message: errorMessage(failure, "This payment couldn't be saved."),
        })
        if (code === "CONFLICT" || code === "NOT_FOUND") {
          setStep("check")
          void queryClient.invalidateQueries(
            trpc.businessBanking.report.queryFilter({
              reportId: report.reportId,
            }),
          )
        }
      },
      onSuccess: async (result) => {
        setProblem(null)
        setDecision(result)
        setStep("result")
        await Promise.all([
          queryClient.invalidateQueries(
            trpc.businessBanking.pendingReports.pathFilter(),
          ),
          queryClient.invalidateQueries(trpc.orders.get.queryFilter()),
          queryClient.invalidateQueries(trpc.orders.timeline.queryFilter()),
          queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
          queryClient.invalidateQueries(trpc.orders.listPage.pathFilter()),
          queryClient.invalidateQueries(trpc.orders.payments.pathFilter()),
          queryClient.invalidateQueries(
            trpc.businessBanking.linkCandidates.pathFilter(),
          ),
        ])
      },
    }),
  )

  const titles: Record<Step, string> = {
    check: `Payment from ${report.payerName}`,
    confirm: "Record this payment?",
    not_received: "Not received",
    result:
      decision?.status === "NOT_RECEIVED"
        ? "Marked not received"
        : "Payment recorded",
  }
  useWorkflowHeader({
    backLabel: "Back",
    onBack: () =>
      step === "confirm" || step === "not_received"
        ? setStep("check")
        : router.canGoBack()
          ? router.back()
          : router.replace("/dashboard"),
    title: titles[step],
  })
  const openOrder = () =>
    router.push(`/order/${encodeURIComponent(report.orderId)}` as never)

  const claim = (
    <View className="gap-3 rounded-[20px] bg-card p-3.5 shadow-sm">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xs text-muted-foreground">
            Customer says they paid
          </Text>
          <Text className="text-2xl font-extrabold tabular-nums text-foreground">
            {money(report.claimedAmountMinor)}
          </Text>
        </View>
        <StatusPill
          label={
            report.status === "CONFIRMED"
              ? "Confirmed"
              : report.status === "NOT_RECEIVED"
                ? "Not received"
                : report.status === "DRAFT"
                  ? "Draft"
                  : "To check"
          }
          tone={
            report.status === "CONFIRMED"
              ? "ok"
              : report.status === "NOT_RECEIVED"
                ? "danger"
                : "warn"
          }
        />
      </View>
      <FactCard
        facts={[
          { label: "Name they gave", value: report.payerName },
          { label: "Submitted", value: shortDateTime(report.submittedAt) },
          {
            label: "Link pays into",
            value: `${report.bank.name} ${accountSuffix(report.bank.accountNumber)} · ${report.bank.accountHolder}`,
          },
        ]}
      />
      <ClaimReceipt
        contentType={report.receiptContentType}
        orderNumber={report.orderNumber}
        receiptPath={report.receiptPath}
        sizeBytes={report.receiptSizeBytes}
      />
      <Text className="text-xs text-muted-foreground">
        {report.status === "CONFIRMED"
          ? `The customer said ${money(report.claimedAmountMinor)}. ${money(report.receivedAmountMinor ?? 0)} was recorded from this report.`
          : report.status === "NOT_RECEIVED"
            ? "Marked not received. No money was recorded from this report."
            : report.status === "DRAFT"
              ? "The customer hasn't finished sending this. Nothing is recorded."
              : "This is what the customer told us. Nothing is recorded until you confirm."}
      </Text>
      <PaymentAlertDeliveries
        reportId={report.reportId}
        deliveries={report.alertDeliveries}
      />
    </View>
  )
  const orderFacts: Fact[] = [
    { label: "Order", value: report.orderNumber },
    { label: "Total", value: money(report.totalMinor), numeric: true },
    {
      label: pending ? "Paid before" : "Paid so far",
      value: money(report.paidMinor),
      numeric: true,
    },
    {
      label: "Balance due",
      value: money(report.balanceMinor),
      numeric: true,
      strong: true,
    },
    ...(pending && left !== null
      ? [
          {
            label: "After this",
            value: left > 0 ? `${money(left)} to pay` : "Paid in full",
            numeric: true,
            strong: true,
          },
        ]
      : []),
  ]

  if (step === "result" && decision) {
    const received = decision.status === "CONFIRMED"
    return (
      <FinanceFormBody>
        <StatusBanner
          icon={received ? "CircleCheck" : "XCircle"}
          title={
            received
              ? `${money(decision.receivedAmountMinor ?? 0)} recorded on ${report.orderNumber}`
              : "Not received"
          }
          message={
            received
              ? decision.balanceMinor > 0
                ? `Part paid · ${money(decision.balanceMinor)} still to pay.`
                : "Paid in full."
              : `${reason.trim()} ${report.orderNumber} is unchanged.`
          }
          tone={received ? "success" : "warning"}
        />
        <FactCard
          facts={[
            {
              label: "Order total",
              value: formatMinorMoney(
                decision.totalMinor,
                decision.currencyCode,
              ),
              numeric: true,
            },
            {
              label: "Paid so far",
              value: formatMinorMoney(
                decision.paidMinor,
                decision.currencyCode,
              ),
              numeric: true,
            },
            {
              label: "Balance due",
              value: formatMinorMoney(
                decision.balanceMinor,
                decision.currencyCode,
              ),
              numeric: true,
              strong: true,
            },
          ]}
        />
        <View>
          <SectionHeader title={`Tell ${report.payerName}`} />
          <CustomerMessageEditor
            initialText={decision.copyText}
            label="Message to the customer"
            noPhoneMessage={`${report.orderNumber} has no saved customer phone. Copy the message and send it yourself.`}
            whatsappUrl={decision.whatsappUrl}
          />
        </View>
        <InfoNote>
          The saved status is available on the customer's payment page.
        </InfoNote>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <ActionButton variant="outline" onPress={openOrder}>
              View order
            </ActionButton>
          </View>
          <View className="flex-1">
            <ActionButton
              onPress={() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace("/dashboard")
              }
            >
              Done
            </ActionButton>
          </View>
        </View>
      </FinanceFormBody>
    )
  }

  const problemBanner = problem ? (
    <StatusBanner
      icon={problem.code === "FORBIDDEN" ? "Lock" : "AlertCircle"}
      title={
        problem.code === "FORBIDDEN"
          ? "Not permitted"
          : problem.code === "CONFLICT"
            ? "Check it again"
            : "Not saved"
      }
      message={
        problem.code === "FORBIDDEN"
          ? "You can see this, but only staff who can take payments in this Store can confirm it."
          : problem.message
      }
      tone="destructive"
      actionLabel={problem.code === "CONFLICT" ? "Reload" : undefined}
      onActionPress={problem.code === "CONFLICT" ? onReload : undefined}
    />
  ) : null

  if (step === "confirm" && account && receivedMinor !== null && confirmedAt) {
    const receivedAt = receivedAtFor(day, confirmedAt)
    return (
      <FinanceFormBody>
        <HeroCard
          label={`Record on ${report.orderNumber}`}
          amount={money(receivedMinor)}
          sub={`Received into ${account.name} on ${receivedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
        />
        <FactCard
          facts={[
            {
              label: "Customer said",
              value: money(report.claimedAmountMinor),
              numeric: true,
            },
            {
              label: "You received",
              value: money(receivedMinor),
              numeric: true,
              strong: true,
            },
            { label: "Into", value: account.name },
            {
              label: "Date",
              value: receivedAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            },
            { label: "Reference", value: reference.trim() || "—" },
            { label: "Note", value: note.trim() || "—" },
            {
              label: `${report.orderNumber} after this`,
              value:
                (left ?? 0) > 0
                  ? `${money(left ?? 0)} to pay · Part paid`
                  : "Paid in full",
              numeric: true,
              strong: true,
            },
          ]}
        />
        <InfoNote>
          This records one payment on the order, the same as Record payment. It
          can't be recorded twice.
        </InfoNote>
        {problemBanner}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <ActionButton
              disabled={review.isPending}
              variant="outline"
              onPress={() => setStep("check")}
            >
              Back
            </ActionButton>
          </View>
          <View className="flex-1">
            <ActionButton
              disabled={review.isPending}
              icon="Check"
              isLoading={review.isPending}
              loadingLabel="Recording…"
              onPress={() =>
                review.mutate({
                  reportId: report.reportId,
                  expectedRevision: report.revision,
                  outcome: "received",
                  receivedAmountMinor: receivedMinor,
                  moneyAccountId: account.id,
                  receivedAt,
                  reference: reference.trim() || undefined,
                  note: note.trim() || undefined,
                })
              }
            >
              {`Record ${money(receivedMinor)}`}
            </ActionButton>
          </View>
        </View>
      </FinanceFormBody>
    )
  }

  if (step === "not_received") {
    const trimmed = reason.trim()
    return (
      <FinanceFormBody>
        <Text className="text-lg font-extrabold text-foreground">
          {`Why can't you confirm ${money(report.claimedAmountMinor)} from ${report.payerName}?`}
        </Text>
        <View className="gap-2">
          <Text className="text-sm font-bold text-foreground">
            Reason the customer will see
          </Text>
          <Textarea
            accessibilityLabel="Reason the customer will see"
            className="min-h-28 rounded-2xl border-0 bg-card px-3.5 py-3 text-base"
            maxLength={NOT_RECEIVED_REASON_MAX}
            numberOfLines={5}
            onChangeText={setReason}
            placeholder="Write what you checked"
            value={reason}
          />
          <Text className="text-xs tabular-nums text-muted-foreground">
            {reason.length} / {NOT_RECEIVED_REASON_MAX} · required
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {NOT_RECEIVED_REASONS.map((option) => (
            <ClassicCustomerBookFilter
              key={option}
              active={trimmed === option}
              label={option}
              onPress={() => setReason(option)}
            />
          ))}
        </View>
        <InfoNote>
          {`Nothing is recorded. ${report.orderNumber} stays as it is. If some money did arrive, go back and record what arrived instead.`}
        </InfoNote>
        {problemBanner}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <ActionButton
              disabled={review.isPending}
              variant="outline"
              onPress={() => setStep("check")}
            >
              Back
            </ActionButton>
          </View>
          <View className="flex-1">
            <ActionButton
              disabled={!trimmed || review.isPending}
              isLoading={review.isPending}
              loadingLabel="Saving…"
              variant="destructive"
              onPress={() =>
                review.mutate({
                  reportId: report.reportId,
                  expectedRevision: report.revision,
                  outcome: "not_received",
                  note: trimmed,
                })
              }
            >
              Mark not received
            </ActionButton>
          </View>
        </View>
      </FinanceFormBody>
    )
  }

  if (!pending)
    return (
      <FinanceFormBody>
        <StatusBanner
          icon={report.status === "CONFIRMED" ? "CircleCheck" : "XCircle"}
          title={
            report.status === "CONFIRMED"
              ? "Already confirmed"
              : report.status === "NOT_RECEIVED"
                ? "Already marked not received"
                : "Not ready to check"
          }
          message={
            report.status === "CONFIRMED"
              ? `${money(report.receivedAmountMinor ?? 0)} was confirmed ${shortDateTime(report.decidedAt)}. It is recorded once on ${report.orderNumber}. Nothing more to do.`
              : report.status === "NOT_RECEIVED"
                ? `Marked ${shortDateTime(report.decidedAt)}.${report.decisionNote ? ` Reason: ${report.decisionNote}` : ""}`
                : "The customer hasn't finished sending this payment notification."
          }
          tone={report.status === "CONFIRMED" ? "success" : "muted"}
        />
        {claim}
        <FactCard facts={orderFacts} />
        <ActionButton variant="outline" onPress={openOrder}>
          View order
        </ActionButton>
      </FinanceFormBody>
    )

  const liveLine =
    receivedMinor === null || receivedMinor <= 0
      ? { tone: "muted", text: "Enter what you can see in your bank app." }
      : receivedMinor > report.balanceMinor
        ? {
            tone: "error",
            text: `That's more than the ${money(report.balanceMinor)} balance.`,
          }
        : receivedMinor < report.claimedAmountMinor
          ? {
              tone: "warn",
              text: `Records ${money(receivedMinor)}. That's ${money(report.claimedAmountMinor - receivedMinor)} less than the customer said. ${left ? `${money(left)} still to pay.` : "Paid in full."}`,
            }
          : {
              tone: "ok",
              text: `Records ${money(receivedMinor)}. ${left ? `${money(left)} still to pay.` : "Paid in full."}`,
            }
  const minimumDay = localDay(new Date(Date.now() - 90 * 86_400_000))
  return (
    <FinanceFormBody>
      {problemBanner}
      {claim}
      <FactCard facts={orderFacts} />
      <View className="gap-3">
        <SectionHeader title="What arrived in your account" />
        <MoneyField
          currencyCode={report.currencyCode}
          label="Amount received"
          onChangeValue={setAmount}
          value={amount}
        />
        <View className="flex-row">
          <ClassicCustomerBookFilter
            active={receivedMinor === report.claimedAmountMinor}
            label={`Same as claim: ${money(report.claimedAmountMinor)}`}
            onPress={() =>
              setAmount(minorToMajorInput(report.claimedAmountMinor))
            }
          />
        </View>
        <Text
          accessibilityLiveRegion="polite"
          className={cn(
            "text-xs",
            liveLine.tone === "error"
              ? "text-destructive"
              : liveLine.tone === "warn"
                ? "font-bold text-foreground"
                : "text-muted-foreground",
          )}
        >
          {liveLine.text}
        </Text>
        <Text className="mt-1 text-sm font-bold text-foreground">
          Received into
        </Text>
        {accountsQuery.isPending ? (
          <Skeleton height={48} radius={14} />
        ) : accountsQuery.isError ? (
          <StatusBanner
            message={errorMessage(
              accountsQuery.error,
              "Accounts couldn't be loaded.",
            )}
            tone="destructive"
            actionLabel="Try again"
            onActionPress={() => void accountsQuery.refetch()}
          />
        ) : eligible.length === 0 ? (
          <StatusBanner
            icon="Building2"
            message="No bank money account takes transfers for order payments. An owner or admin can set this up in Finance."
            tone="warning"
          />
        ) : (
          <View className="gap-2">
            {eligible.map((candidate) => (
              <FinanceChoice
                key={candidate.id}
                label={candidate.name}
                selected={account?.id === candidate.id}
                onPress={() => setAccountId(candidate.id)}
              />
            ))}
          </View>
        )}
        <FinanceBankDateField
          label="Date received"
          value={day}
          onChange={setDay}
          minimum={minimumDay}
          maximum={today}
        />
        <FormField
          label="Bank reference (optional)"
          maxLength={160}
          onChangeText={setReference}
          placeholder="From your bank app"
          value={reference}
        />
        <FormField
          label="Payment note (optional)"
          maxLength={500}
          onChangeText={setNote}
          value={note}
        />
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <ActionButton
            variant="outline"
            onPress={() => {
              setProblem(null)
              setStep("not_received")
            }}
          >
            Not received
          </ActionButton>
        </View>
        <View className="flex-1">
          <ActionButton
            disabled={!canConfirm}
            icon="Check"
            onPress={() => {
              setProblem(null)
              // Kept for retries so the server sees the same decision.
              setConfirmedAt((value) => value ?? new Date())
              setStep("confirm")
            }}
          >
            Confirm received
          </ActionButton>
        </View>
      </View>
    </FinanceFormBody>
  )
}
