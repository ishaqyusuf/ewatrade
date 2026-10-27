"use client"

import { useTRPC, useTRPCClient } from "@/trpc/client"
import { Skeleton } from "@ewatrade/ui"
import {
  formatCurrencyInput,
  getCurrencySymbol,
  majorToMinor,
  minorToMajorInput,
} from "@ewatrade/utils/currency"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { ClaimSheet } from "./claim-sheet"
import {
  type PublicPaymentLink,
  type PublicReportStatus,
  formatReportedAt,
  itemsSummary,
  lastDigits,
  money,
} from "./payment-format"
import {
  AmountField,
  BankDetails,
  BusinessHeader,
  ConfirmingRings,
  DetailList,
  FixedAmount,
  LiveIndicator,
  OrderDetails,
  OrderSummary,
  PaymentShell,
  ReceiptPicker,
  StatusCard,
  UpdatedAt,
  cardClass,
  primaryButtonClass,
} from "./payment-parts"
import { type ReportOutcome, resolvePaymentView } from "./payment-view"
import type { PickedReceipt } from "./receipt-file"
import {
  type StoredReport,
  clearStoredReport,
  hasPersistedReport,
  newClientReportId,
  readStoredReport,
  sameReportDetails,
  writeStoredReport,
} from "./report-storage"
import {
  ReportFlowError,
  type SendStep,
  sendPaymentReport,
  trpcErrorCode,
} from "./send-payment-report"
import { type StatusConnection, useReportStatus } from "./use-report-status"

/** Formats on the client only, so server and browser time zones never disagree. */
function LocalDate({ value }: { value: Date | string }) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    const date = new Date(value)
    setLabel(
      Number.isNaN(date.getTime())
        ? null
        : new Intl.DateTimeFormat("en-NG", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }).format(date),
    )
  }, [value])
  return label ? <>{label}</> : null
}

function PaymentHero({ link }: { link: PublicPaymentLink }) {
  const summary = itemsSummary(link.items)
  return (
    <section className="bg-[linear-gradient(150deg,#17684f,#0e4a38)] text-[#fff9ed]">
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-0.5 px-5 pt-10 pb-6 sm:pt-14">
        <h1 className="text-[13.5px] opacity-85">
          {link.businessName} · Order {link.orderNumber}
        </h1>
        <p className="text-[40px] leading-tight font-extrabold tracking-tight tabular-nums">
          <span className="sr-only">Amount to pay: </span>
          {money(link.amountPrefilledMinor, link.currencyCode)}
        </p>
        {summary ? <p className="text-sm opacity-85">{summary}</p> : null}
        <p className="mt-1 text-[13px] opacity-75">
          {link.paidMinor > 0
            ? `Part paid · ${money(link.balanceMinor, link.currencyCode)} left`
            : "Not paid yet"}
          {" · Link works until "}
          <LocalDate value={link.expiresAt} />
        </p>
        <div className="mt-2 text-foreground [&_summary]:text-[#fff9ed]">
          <OrderDetails link={link} />
        </div>
      </div>
    </section>
  )
}

function OutcomeCard({
  link,
  outcome,
  status,
  updatedAt,
}: {
  link: PublicPaymentLink
  outcome: ReportOutcome
  status: PublicReportStatus
  updatedAt: number
}) {
  const { businessName, currencyCode } = link
  const received = money(status.receivedAmountMinor ?? 0, currencyCode)
  const claimed = money(status.claimedAmountMinor, currencyCode)
  if (outcome === "not_received")
    return (
      <>
        <StatusCard
          tone="bad"
          big
          live
          title="Payment not found yet"
          footer={<UpdatedAt at={updatedAt} />}
        >
          {businessName} couldn't find your {claimed} transfer.
        </StatusCard>
        <div
          className={`${cardClass} flex flex-col gap-0.5 border-l-4 border-l-destructive px-3.5 py-3`}
        >
          <small className="text-[12.5px] text-muted-foreground">
            Their message
          </small>
          <b className="text-[15px] leading-relaxed">{status.message}</b>
        </div>
      </>
    )
  const short =
    (status.receivedAmountMinor ?? 0) < status.claimedAmountMinor
      ? ` You said ${claimed}. If that's wrong, reply to them where you got this link.`
      : ""
  if (outcome === "partially_paid")
    return (
      <StatusCard
        tone="ok"
        big
        live
        title={`${received} confirmed`}
        footer={<UpdatedAt at={updatedAt} />}
      >
        {businessName} confirmed they received {received}.{short}{" "}
        {money(status.balanceMinor, currencyCode)} is still to pay.
      </StatusCard>
    )
  return (
    <StatusCard
      tone="ok"
      big
      live
      title="Payment confirmed"
      footer={<UpdatedAt at={updatedAt} />}
    >
      {businessName} confirmed they received {received}.{short}
    </StatusCard>
  )
}

function WaitingView({
  link,
  status,
  record,
  connection,
  onReload,
  canRecover,
}: {
  link: PublicPaymentLink
  status: PublicReportStatus
  record: StoredReport | null
  connection: StatusConnection
  onReload: () => void
  canRecover: boolean
}) {
  const reportedAt = formatReportedAt(record?.reportedAt ?? null)
  return (
    <PaymentShell>
      <BusinessHeader
        businessName={link.businessName}
        orderNumber={link.orderNumber}
      />
      <section
        className={`${cardClass} flex flex-col items-center gap-2 px-4.5 pt-6.5 pb-4.5 text-center`}
        aria-live="polite"
      >
        <ConfirmingRings />
        <h2 className="mt-1.5 text-[21px] font-extrabold">
          Your payment is being confirmed
        </h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {link.businessName} is checking their account for your transfer. This
          page updates when they confirm.
        </p>
        <LiveIndicator connection={connection} onReload={onReload} />
      </section>
      <DetailList
        rows={[
          {
            label: "You said you paid",
            value: (
              <b className="tabular-nums">
                {money(status.claimedAmountMinor, status.currencyCode)}
              </b>
            ),
          },
          ...(record?.payerName
            ? [{ label: "Your name", value: record.payerName }]
            : []),
          {
            label: "Sent to",
            value: `${link.bank.name} · ${lastDigits(link.bank.accountNumber)}`,
          },
          ...(reportedAt ? [{ label: "Told them", value: reportedAt }] : []),
          ...(record?.payerName
            ? [
                {
                  label: "Receipt",
                  value: record.receipt?.fileName ?? "No receipt",
                },
              ]
            : []),
        ]}
      />
      <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
        {canRecover
          ? "You can close this page. Open the same link in this browser later to see the result."
          : "Keep this page open to see the result. Your browser couldn't save this report for a later visit."}
      </p>
    </PaymentShell>
  )
}

function LoadingView() {
  return (
    <PaymentShell>
      <div className="flex items-center gap-3" aria-busy="true">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
      <output className="sr-only">Loading payment page</output>
    </PaymentShell>
  )
}

const ALREADY_CHECKING =
  "A payment report for this link is already being checked. If you told them from another phone or browser, open this link there to see the result."

export function PaymentPage({
  token,
  initialLink,
}: { token: string; initialLink?: PublicPaymentLink }) {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const queryClient = useQueryClient()
  const linkOptions = trpc.businessBanking.paymentLink.queryOptions({ token })
  const linkQuery = useQuery({ ...linkOptions, initialData: initialLink })
  const link = linkQuery.data

  const [record, setRecord] = useState<StoredReport | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  useEffect(() => {
    setRecord(readStoredReport(token))
    setStorageReady(true)
  }, [token])

  const reportToken = storageReady ? (record?.reportToken ?? null) : null
  const {
    query: statusQuery,
    connection,
    reload: reloadStatus,
  } = useReportStatus(reportToken)
  const status = statusQuery.data
  const statusCode = trpcErrorCode(statusQuery.error)
  const linkCode = trpcErrorCode(linkQuery.error)

  // A stored report token that expired or vanished is forgotten, never retried.
  useEffect(() => {
    if (!reportToken) return
    if (statusCode !== "NOT_FOUND" && statusCode !== "BAD_REQUEST") return
    clearStoredReport(token)
    setRecord(null)
  }, [reportToken, statusCode, token])

  // A decision changes the order balance: read the link again.
  const decision =
    status && status.state !== "checking"
      ? `${status.reportId}:${status.revision}`
      : null
  const linkKey = linkOptions.queryKey
  useEffect(() => {
    if (decision) void queryClient.invalidateQueries({ queryKey: linkKey })
  }, [decision, queryClient, linkKey])

  const view = resolvePaymentView({
    link,
    linkError: linkQuery.error
      ? linkCode === "NOT_FOUND" || linkCode === "BAD_REQUEST"
        ? "not_found"
        : "error"
      : null,
    hasReportToken: Boolean(reportToken),
    status,
    statusPending: statusQuery.isPending,
    statusError:
      statusQuery.error && !status
        ? statusCode === "NOT_FOUND" || statusCode === "BAD_REQUEST"
          ? "not_found"
          : "error"
        : null,
  })

  // Amount: fixed, or editable up to the amount due when the business allows it.
  const dueMinor = link?.amountPrefilledMinor ?? 0
  const [amountText, setAmountText] = useState<string | null>(null)
  const [amountError, setAmountError] = useState<string | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the amount due changes
  useEffect(() => {
    setAmountText(null)
    setAmountError(null)
  }, [dueMinor])
  const shownAmountText =
    amountText ?? formatCurrencyInput(minorToMajorInput(dueMinor))

  const [receipt, setReceipt] = useState<PickedReceipt | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [step, setStep] = useState<SendStep | null>(null)
  const [flowError, setFlowError] = useState<string | null>(null)
  const sendingRef = useRef(false)

  const finishing = view.kind === "unfinished" && Boolean(record?.reportToken)
  const claimMinor = finishing
    ? (record?.claimedAmountMinor ?? 0)
    : link?.allowPartial
      ? (majorToMinor(shownAmountText) ?? 0)
      : dueMinor

  // The link closed or expired while the sheet was open.
  useEffect(() => {
    if (link && link.state !== "active" && step === null && !finishing)
      setSheetOpen(false)
  }, [link, step, finishing])

  const openClaim = () => {
    setFlowError(null)
    if (!finishing && link?.allowPartial) {
      const value = majorToMinor(shownAmountText)
      const problem =
        value === null || value <= 0
          ? "Enter the amount you sent."
          : value > dueMinor
            ? `Enter up to ${money(dueMinor, link.currencyCode)}.`
            : null
      setAmountError(problem)
      if (problem) {
        amountRef.current?.focus()
        return
      }
    }
    setSheetOpen(true)
  }

  const recoverConflict = useCallback(
    async (attempt: StoredReport) => {
      const candidates = [
        attempt.reportToken,
        attempt.previousReportToken,
      ].filter((value): value is string => Boolean(value))
      for (const candidate of candidates) {
        try {
          const existing = await client.businessBanking.reportStatus.query({
            reportToken: candidate,
          })
          if (existing.state !== "checking" || existing.status !== "SUBMITTED")
            continue
          const own = candidate === attempt.reportToken
          const recovered: StoredReport = {
            ...attempt,
            reportToken: candidate,
            payerName: own ? attempt.payerName : "",
            receipt: own ? attempt.receipt : null,
            claimedAmountMinor: existing.claimedAmountMinor,
            reportedAt: own ? attempt.reportedAt : null,
          }
          writeStoredReport(token, recovered)
          setRecord(recovered)
          return true
        } catch {
          /* Try the next stored token. */
        }
      }
      return false
    },
    [client, token],
  )

  const confirm = async (payerName: string) => {
    if (!link || sendingRef.current) return
    setFlowError(null)
    let attempt: StoredReport
    if (finishing && record) {
      if (
        record.receipt &&
        receipt &&
        receipt.meta.contentDigest !== record.receipt.contentDigest
      ) {
        setFlowError(
          `This isn't the receipt you chose before. Add ${record.receipt.fileName} again.`,
        )
        return
      }
      attempt = record
    } else {
      const details = {
        payerName,
        claimedAmountMinor: claimMinor,
        receipt: link.receiptAllowed ? (receipt?.meta ?? null) : null,
      }
      attempt =
        record && !record.reportToken && sameReportDetails(record, details)
          ? record
          : {
              v: 1,
              clientReportId: newClientReportId(),
              ...details,
              reportToken: null,
              previousReportToken:
                record?.reportToken ?? record?.previousReportToken ?? null,
              reportedAt: null,
            }
    }
    // Persist before the first request so a retry reuses the same clientReportId.
    writeStoredReport(token, attempt)
    setRecord(attempt)
    sendingRef.current = true
    try {
      await sendPaymentReport({
        client,
        linkToken: token,
        report: attempt,
        file: link.receiptAllowed ? (receipt?.file ?? null) : null,
        onStep: setStep,
        onPrepared: (preparedToken) => {
          attempt = { ...attempt, reportToken: preparedToken }
          writeStoredReport(token, attempt)
        },
      })
      attempt = {
        ...attempt,
        reportedAt: attempt.reportedAt ?? new Date().toISOString(),
      }
      writeStoredReport(token, attempt)
      setRecord(attempt)
      setSheetOpen(false)
      setReceipt(null)
      setAmountText(null)
    } catch (error) {
      // Keep this visit's stable operation even when browser storage is denied.
      setRecord(attempt)
      if (!(error instanceof ReportFlowError)) {
        setFlowError("Something went wrong. Try again.")
        return
      }
      if (error.kind === "conflict") {
        if (await recoverConflict(attempt)) {
          setSheetOpen(false)
          return
        }
        if (/different details/i.test(error.message)) {
          const fresh = { ...attempt, clientReportId: newClientReportId() }
          writeStoredReport(token, fresh)
          setRecord(fresh)
          setFlowError("Something changed since you last tried. Try again.")
          return
        }
        setFlowError(
          /already being checked/i.test(error.message)
            ? ALREADY_CHECKING
            : error.message,
        )
        return
      }
      if (error.kind === "stale") {
        const fresh: StoredReport = {
          ...attempt,
          clientReportId: newClientReportId(),
          reportToken: null,
          previousReportToken: attempt.reportToken,
          reportedAt: null,
        }
        writeStoredReport(token, fresh)
        setRecord(fresh)
      }
      if (error.kind === "unavailable")
        void queryClient.invalidateQueries({ queryKey: linkKey })
      setFlowError(error.message)
    } finally {
      sendingRef.current = false
      setStep(null)
    }
  }

  const retryAll = () => {
    void linkQuery.refetch()
    if (reportToken) reloadStatus()
  }

  const sheet =
    link && (link.state === "active" || finishing) ? (
      <ClaimSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setFlowError(null)
        }}
        link={link}
        amountMinor={claimMinor}
        initialName={finishing ? (record?.payerName ?? "") : ""}
        detailsLocked={finishing && Boolean(record?.payerName)}
        receipt={receipt}
        onReceiptChange={setReceipt}
        step={step}
        error={flowError}
        onConfirm={(name) => void confirm(name)}
      />
    ) : null

  if (view.kind === "loading") return <LoadingView />
  if (view.kind === "not_found")
    return (
      <PaymentShell>
        <StatusCard tone="info" title="We can't find this page">
          The link may be wrong or incomplete. Ask the business that sent it for
          a new one.
        </StatusCard>
      </PaymentShell>
    )
  if (view.kind === "error")
    return (
      <PaymentShell>
        <StatusCard
          tone="info"
          title="We couldn't load this page"
          footer={
            <button
              type="button"
              className={`${primaryButtonClass} mt-3`}
              onClick={retryAll}
              disabled={linkQuery.isFetching}
            >
              Try again
            </button>
          }
        >
          Check your connection and try again.
        </StatusCard>
      </PaymentShell>
    )

  const viewLink = view.link
  if (view.kind === "waiting")
    return (
      <>
        <WaitingView
          link={viewLink}
          status={view.status}
          record={record}
          connection={connection}
          onReload={reloadStatus}
          canRecover={hasPersistedReport(token, reportToken)}
        />
        {sheet}
      </>
    )

  if (view.kind === "unfinished")
    return (
      <PaymentShell>
        <BusinessHeader
          businessName={viewLink.businessName}
          orderNumber={viewLink.orderNumber}
        />
        <StatusCard
          tone="wait"
          title="You haven't finished telling them"
          footer={
            <button
              type="button"
              className={`${primaryButtonClass} mt-3`}
              onClick={openClaim}
            >
              Finish telling them
            </button>
          }
        >
          Your report didn't reach {viewLink.businessName} yet. Send it again so
          they can check their account.
        </StatusCard>
        {record ? (
          <DetailList
            rows={[
              {
                label: "You said you paid",
                value: (
                  <b className="tabular-nums">
                    {money(record.claimedAmountMinor, viewLink.currencyCode)}
                  </b>
                ),
              },
              ...(record.payerName
                ? [{ label: "Your name", value: record.payerName }]
                : []),
              {
                label: "Receipt",
                value: record.receipt?.fileName ?? "No receipt",
              },
            ]}
          />
        ) : null}
        {sheet}
      </PaymentShell>
    )

  const outcome = view.outcome
  const outcomeCard = outcome ? (
    <OutcomeCard
      link={viewLink}
      outcome={outcome.state}
      status={outcome.status}
      updatedAt={statusQuery.dataUpdatedAt}
    />
  ) : null
  const header = (
    <BusinessHeader
      businessName={viewLink.businessName}
      orderNumber={viewLink.orderNumber}
    />
  )

  if (viewLink.state === "paid")
    return (
      <PaymentShell>
        {header}
        {outcomeCard ?? (
          <StatusCard tone="ok" title="This order is paid">
            {money(viewLink.totalMinor, viewLink.currencyCode)} confirmed by{" "}
            {viewLink.businessName}.
          </StatusCard>
        )}
        <OrderSummary link={viewLink} />
      </PaymentShell>
    )
  if (viewLink.state === "expired")
    return (
      <PaymentShell>
        {header}
        {outcomeCard}
        <StatusCard tone="info" title="This payment link has expired">
          Ask {viewLink.businessName} for a new link. Don't transfer using old
          details.
        </StatusCard>
      </PaymentShell>
    )
  if (viewLink.state === "unavailable")
    return (
      <PaymentShell>
        {header}
        {outcomeCard}
        <StatusCard tone="bad" title="This link no longer takes payments">
          The order was cancelled or the link was closed. Don't transfer using
          these details. If you think this is wrong, reply to{" "}
          {viewLink.businessName} where you got this link.
        </StatusCard>
      </PaymentShell>
    )

  const again = outcome?.state === "not_received"
  return (
    <PaymentShell hero={<PaymentHero link={viewLink} />}>
      {outcomeCard}
      <section className={`${cardClass} flex flex-col gap-3 p-4`}>
        {viewLink.allowPartial ? (
          <AmountField
            value={shownAmountText}
            onChange={(value) => {
              setAmountText(formatCurrencyInput(value))
              if (amountError) setAmountError(null)
            }}
            maxMinor={dueMinor}
            currencyCode={viewLink.currencyCode}
            currencySymbol={getCurrencySymbol(viewLink.currencyCode)}
            error={amountError}
            inputRef={amountRef}
          />
        ) : outcome ? (
          <FixedAmount
            amountMinor={dueMinor}
            currencyCode={viewLink.currencyCode}
          />
        ) : null}
        <BankDetails
          link={viewLink}
          amountMinor={viewLink.allowPartial ? null : dueMinor}
        />
        {viewLink.receiptAllowed ? (
          <ReceiptPicker receipt={receipt} onChange={setReceipt} />
        ) : null}
        <div className="sticky bottom-0 -mx-4 -mb-4 rounded-b-2xl bg-card px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={openClaim}
          >
            {again ? "I have paid · tell them again" : "I have paid"}
          </button>
        </div>
      </section>
      {sheet}
    </PaymentShell>
  )
}
