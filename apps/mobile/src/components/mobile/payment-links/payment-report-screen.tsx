import { ActionButton } from "@/components/mobile/action-button"
import { ClassicCustomerBookFilter } from "@/components/mobile/appearances/classic/customer-book-screen"
import { FinanceBankDateField } from "@/components/mobile/finance/finance-bank-date-field"
import { FinanceFormBody } from "@/components/mobile/finance/finance-form-body"
import { FinanceChoice } from "@/components/mobile/finance/finance-ledger-layout"
import { PaymentAlertDeliveries } from "@/components/mobile/finance/payment-alert-deliveries"
import { FormField } from "@/components/mobile/form-field"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import {
  SectionHeader,
  StatusPill,
  ToggleRow,
} from "@/components/mobile/green-till/kit"
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
import { type Href, useRouter } from "expo-router"
import { useRef, useState } from "react"
import { ClaimReceipt } from "./claim-receipt"
import { CustomerMessageEditor } from "./customer-message-editor"
import {
  type SavedAllocationOutcome,
  customerPreferenceFacts,
  excessSplit,
  excessTreatmentText,
  savedAllocationOutcome,
  usableFundsReview,
} from "./excess-allocation-model"
import {
  NOT_RECEIVED_REASONS,
  NOT_RECEIVED_REASON_MAX,
  accountSuffix,
  errorCode,
  errorMessage,
  isNibssSessionId,
  localDay,
  receivedAtFor,
  receivedDecision,
  shortDateTime,
  transferAccounts,
  verifiedPayment,
} from "./payment-link-model"
import {
  type Fact,
  FactCard,
  InfoNote,
  PaymentReferenceCard,
  VerifiedStamp,
} from "./payment-link-parts"
import { ReceiptCheck } from "./receipt-check"
import {
  receiptAssessmentPollDelay,
  receiptAssessmentPollKey,
} from "./receipt-check-model"
import { usePaymentScreenActive } from "./use-payment-screen-active"

type Report = RouterOutputs["businessBanking"]["report"]
type Decision = RouterOutputs["businessBanking"]["reviewReport"]
type Step = "check" | "confirm" | "not_received" | "result"

/** Review one customer claim against what arrived in the business bank. */
export function PaymentReportScreen({ reportId }: { reportId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const active = usePaymentScreenActive()
  const [pausedReportId, setPausedReportId] = useState<string | null>(null)
  const paused = pausedReportId === reportId
  const pollWindow = useRef<{ key: string; startedAt: number } | null>(null)
  const report = useQuery(
    trpc.businessBanking.report.queryOptions(
      { reportId },
      {
        enabled: active && !offline && Boolean(reportId) && !paused,
        retry: false,
        staleTime: 0,
        refetchOnMount: "always",
        refetchIntervalInBackground: false,
        refetchInterval: (query) => {
          if (!active || offline || paused || query.state.status === "error")
            return false
          const assessment = query.state.data?.receiptAssessment
          const generationKey = receiptAssessmentPollKey(assessment)
          if (!generationKey) return false
          const key = `${reportId}:${generationKey}`
          const now = Date.now()
          let window = pollWindow.current
          if (!window || window.key !== key) {
            window = { key, startedAt: now }
            pollWindow.current = window
          }
          return receiptAssessmentPollDelay({
            assessment,
            active,
            offline,
            elapsedMs: now - window.startedAt,
          })
        },
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
      reloading={report.isRefetching}
      onReviewStart={async () => {
        setPausedReportId(reportId)
        // Cancel only this read before posting, so a late poll cannot replace
        // the saved result/draft with its new financial revision.
        await queryClient.cancelQueries(
          trpc.businessBanking.report.queryFilter({ reportId }),
        )
      }}
      onReviewFailed={() => setPausedReportId(null)}
    />
  )
}

function ReviewFlow({
  report,
  onReload,
  reloading,
  onReviewStart,
  onReviewFailed,
}: {
  report: Report
  onReload: () => void
  reloading: boolean
  onReviewStart: () => Promise<void>
  onReviewFailed: () => void
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
  const [amount, setAmountValue] = useState("")
  const [accountId, setAccountIdValue] = useState<string | null>(null)
  const [day, setDayValue] = useState(() => localDay(new Date()))
  // The bank check covers amount, account and date, so changing one clears it.
  const [bankChecked, setBankChecked] = useState(false)
  const [nibssSession, setNibssSession] = useState(false)
  const setAmount = (value: string) => {
    if (value === amount) return
    setAmountValue(value)
    setBankChecked(false)
  }
  const setAccountId = (value: string) => {
    if (value === account?.id) return
    setAccountIdValue(value)
    setBankChecked(false)
  }
  const setDay = (value: string) => {
    if (value === day) return
    setDayValue(value)
    setBankChecked(false)
  }
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
  // More than the balance is only possible with the Finance-only snapshot.
  const fundsReview = pending ? usableFundsReview(report) : null
  const excess = excessSplit(receivedMinor, fundsReview)
  const amountValid =
    receivedMinor !== null &&
    receivedMinor > 0 &&
    (receivedMinor <= report.balanceMinor || excess !== null)
  const dayValid = /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today
  const canConfirm =
    pending && amountValid && Boolean(account) && dayValid && bankChecked
  const nibssReference = isNibssSessionId(reference)
  const verified = verifiedPayment(
    report.verification,
    report.customerReceiptId,
  )
  const left = amountValid
    ? Math.max(0, report.balanceMinor - (receivedMinor ?? 0))
    : null
  const preferenceFacts = customerPreferenceFacts(report, report.currencyCode)
  const fundsAccountId =
    report.customerFundsReview?.expectedCustomerFundsAccountId ?? null
  // Opens the saved refund request in the customer record, when both IDs exist.
  const refundLink = (requestId: string | null) => {
    if (!requestId || !fundsAccountId) return undefined
    return () =>
      router.push({
        pathname: "/customer-ledger-action/[accountId]",
        params: {
          accountId: fundsAccountId,
          mode: "refund-request",
          entryId: requestId,
        },
      } as Href)
  }
  const receiptCheck = (
    <ReceiptCheck
      assessment={report.receiptAssessment}
      extraction={report.receiptExtraction}
      onRefresh={pending ? onReload : undefined}
      refreshing={reloading}
    />
  )

  const review = useMutation(
    trpc.businessBanking.reviewReport.mutationOptions({
      onMutate: onReviewStart,
      onError: (failure) => {
        onReviewFailed()
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
          // Extra kept as credit (or a refund request) changes customer funds.
          ...(result.customerReceiptId
            ? [
                queryClient.invalidateQueries({
                  queryKey: trpc.customerLedger.pathKey(),
                }),
                queryClient.invalidateQueries({
                  queryKey: trpc.finance.pathKey(),
                }),
              ]
            : []),
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
          ...preferenceFacts,
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
  const referenceCard = report.paymentReference ? (
    <PaymentReferenceCard paymentReference={report.paymentReference} />
  ) : null
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
    const balanceLine =
      decision.balanceMinor > 0
        ? `Part paid · ${money(decision.balanceMinor)} still to pay.`
        : "Paid in full."
    const bankReference = received ? reference.trim() : ""
    // The saved breakdown from the server, not the split that was sent.
    const saved = savedAllocationOutcome(
      received ? decision.confirmedAllocation : null,
      report.orderNumber,
      decision.currencyCode,
    )
    const recorded = `${money(decision.receivedAmountMinor ?? 0)} recorded ${saved.recordedOn}`
    return (
      <FinanceFormBody>
        {received &&
        verifiedPayment(decision.verification, decision.customerReceiptId) ? (
          <VerifiedStamp
            verification={decision.verification}
            customerReceiptId={decision.customerReceiptId}
            message={`${recorded}. ${balanceLine}`}
          />
        ) : (
          <StatusBanner
            icon={received ? "CircleCheck" : "XCircle"}
            title={received ? recorded : "Not received"}
            message={
              received
                ? balanceLine
                : `${reason.trim()} ${report.orderNumber} is unchanged.`
            }
            tone={received ? "success" : "warning"}
          />
        )}
        {decision.paymentReference ? (
          <PaymentReferenceCard paymentReference={decision.paymentReference} />
        ) : null}
        <FactCard
          facts={[
            ...(bankReference
              ? [{ label: "Bank reference", value: bankReference }]
              : []),
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
        {received ? (
          <FundsOutcome
            outcome={saved}
            onOpenRefund={refundLink(decision.customerFundsRefundRequestId)}
          />
        ) : null}
        <View>
          <SectionHeader title={`Tell ${report.payerName}`} />
          <CustomerMessageEditor
            initialText={decision.copyText}
            label="Message to the customer"
            noPhoneMessage={`${report.orderNumber} has no saved customer phone. Enter one to open a WhatsApp draft, or copy the message.`}
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

  if (
    step === "confirm" &&
    account &&
    receivedMinor !== null &&
    confirmedAt &&
    bankChecked
  ) {
    const receivedAt = receivedAtFor(day, confirmedAt)
    const decisionInput = receivedDecision({
      reportId: report.reportId,
      expectedRevision: report.revision,
      receivedAmountMinor: receivedMinor,
      moneyAccountId: account.id,
      receivedAt,
      reference,
      note,
      bankChecked,
      nibssSession,
      excess,
    })
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
            ...(excess
              ? [
                  {
                    label: `Applied to ${report.orderNumber}`,
                    value: money(excess.orderAmountMinor),
                    numeric: true,
                  },
                  {
                    label: "Kept as customer credit",
                    value: money(excess.excessMinor),
                    numeric: true,
                    strong: true,
                  },
                  ...preferenceFacts,
                ]
              : []),
            { label: "Into", value: account.name },
            {
              label: "Date",
              value: receivedAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            },
            ...(report.paymentReference
              ? [
                  {
                    label: "Payment reference",
                    value: report.paymentReference,
                  },
                ]
              : []),
            {
              label: "Bank reference",
              value: reference.trim()
                ? decisionInput?.transferReferenceNamespace
                  ? `${reference.trim()} · NIBSS session ID`
                  : reference.trim()
                : "—",
            },
            { label: "Bank check", value: "You checked the bank account" },
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
        {excess ? (
          <InfoNote>
            {`This records the receipt once. ${excessTreatmentText(report.allocationPreference, money(excess.excessMinor))} It can't be recorded twice.`}
          </InfoNote>
        ) : (
          <InfoNote>
            This records one payment on the order, the same as Record payment.
            It can't be recorded twice.
          </InfoNote>
        )}
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
              disabled={!decisionInput || review.isPending}
              icon="Check"
              isLoading={review.isPending}
              loadingLabel="Recording…"
              onPress={() => {
                if (!decisionInput) return
                review.mutate(decisionInput)
              }}
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

  if (!pending) {
    const saved = savedAllocationOutcome(
      report.status === "CONFIRMED" ? report.confirmedAllocation : null,
      report.orderNumber,
      report.currencyCode,
    )
    const recordedOn = saved.recordedOn
    const nothingMore =
      saved.known && !saved.actionNeeded ? " Nothing more to do." : ""
    return (
      <FinanceFormBody>
        {report.status === "CONFIRMED" && verified ? (
          <VerifiedStamp
            verification={report.verification}
            customerReceiptId={report.customerReceiptId}
            message={`${money(report.receivedAmountMinor ?? 0)} is recorded once ${recordedOn}.${nothingMore}`}
          />
        ) : (
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
                ? `${money(report.receivedAmountMinor ?? 0)} was confirmed ${shortDateTime(report.decidedAt)}. It is recorded once ${recordedOn}.${nothingMore}`
                : report.status === "NOT_RECEIVED"
                  ? `Marked ${shortDateTime(report.decidedAt)}.${report.decisionNote ? ` Reason: ${report.decisionNote}` : ""}`
                  : "The customer hasn't finished sending this payment notification."
            }
            tone={report.status === "CONFIRMED" ? "success" : "muted"}
          />
        )}
        {claim}
        {receiptCheck}
        {referenceCard}
        <FactCard
          facts={
            report.bankReference
              ? [
                  { label: "Bank reference", value: report.bankReference },
                  ...orderFacts,
                ]
              : orderFacts
          }
        />
        {report.status === "CONFIRMED" ? (
          <FundsOutcome
            outcome={saved}
            onOpenRefund={refundLink(report.customerFundsRefundRequestId)}
          />
        ) : null}
        <ActionButton variant="outline" onPress={openOrder}>
          View order
        </ActionButton>
      </FinanceFormBody>
    )
  }

  const liveLine =
    receivedMinor === null || receivedMinor <= 0
      ? { tone: "muted", text: "Enter what you can see in your bank app." }
      : excess
        ? {
            tone: "warn",
            text: `More than the ${money(report.balanceMinor)} balance. ${money(excess.orderAmountMinor)} goes to ${report.orderNumber} and ${money(excess.excessMinor)} is kept as customer credit.`,
          }
        : receivedMinor > report.balanceMinor
          ? {
              tone: "error",
              text: fundsReview
                ? "That's more than one payment can record."
                : report.customerFundsReview
                  ? `That's more than the ${money(report.balanceMinor)} balance, and the Order changed. Refresh before recording the extra.`
                  : `That's more than the ${money(report.balanceMinor)} balance. Only an owner or admin can keep extra as customer credit, on an Order with a customer.`,
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
      {receiptCheck}
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
        {excess ? (
          <>
            <FactCard
              facts={[
                {
                  label: "You received",
                  value: money(excess.receivedMinor),
                  numeric: true,
                },
                {
                  label: `Applied to ${report.orderNumber}`,
                  value: money(excess.orderAmountMinor),
                  numeric: true,
                },
                {
                  label: "Kept as customer credit",
                  value: money(excess.excessMinor),
                  numeric: true,
                  strong: true,
                },
              ]}
            />
            <InfoNote>
              {excessTreatmentText(
                report.allocationPreference,
                money(excess.excessMinor),
              )}
            </InfoNote>
          </>
        ) : report.customerFundsReview &&
          !fundsReview &&
          receivedMinor !== null &&
          receivedMinor > report.balanceMinor ? (
          <ActionButton
            disabled={reloading}
            icon="RefreshCw"
            variant="outline"
            onPress={onReload}
          >
            Refresh
          </ActionButton>
        ) : null}
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
        {nibssReference ? (
          <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
            <ToggleRow
              title="This is the NIBSS session ID"
              sub="The 30-digit ID on the transfer. The same transfer then can't be recorded twice."
              value={nibssSession}
              onValueChange={setNibssSession}
            />
          </View>
        ) : null}
        <FormField
          label="Payment note (optional)"
          maxLength={500}
          onChangeText={setNote}
          value={note}
        />
      </View>
      {referenceCard}
      <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
        <ToggleRow
          title="I checked the bank account"
          sub="The actual amount, receiving account and date are correct."
          value={bankChecked}
          onValueChange={setBankChecked}
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

/**
 * The saved customer-funds outcome of a confirmed payment, from the server's
 * projection for this report. A refund request is only a request: nothing is
 * sent until Finance records the return.
 */
function FundsOutcome({
  outcome,
  onOpenRefund,
}: {
  outcome: SavedAllocationOutcome
  onOpenRefund?: () => void
}) {
  if (!outcome.known)
    return (
      <InfoNote>
        The saved breakdown for this payment isn't available. Check the Order's
        payments.
      </InfoNote>
    )
  if (!outcome.hasExtra) return null
  return (
    <View className="gap-3">
      <SectionHeader title="Extra money" />
      <FactCard facts={outcome.facts} />
      {outcome.note ? <InfoNote>{outcome.note}</InfoNote> : null}
      {outcome.canOpenRefund && onOpenRefund ? (
        <ActionButton
          icon="ArrowRight"
          variant="outline"
          onPress={onOpenRefund}
        >
          Open refund request
        </ActionButton>
      ) : null}
    </View>
  )
}
