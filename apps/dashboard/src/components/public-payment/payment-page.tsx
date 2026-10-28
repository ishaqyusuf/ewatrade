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
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { ClaimReveal } from "./claim-reveal"
import {
  type IssuedAttempt,
  startNextPaymentAttempt,
} from "./next-payment-attempt"
import { initialPayerName } from "./payer-name"
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
  HeroAmountCopy,
  LiveIndicator,
  OrderDetails,
  OrderSummary,
  PaymentShell,
  ReceiptPicker,
  ReferenceValue,
  StatusCard,
  UpdatedAt,
  cardClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./payment-parts"
import {
  type ReportOutcome,
  outcomeNextStep,
  reportReference,
  resolvePaymentView,
  verifiedConfirmation,
} from "./payment-view"
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
        <HeroAmountCopy amountMinor={link.amountPrefilledMinor} />
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

/** Shown only for the server's canonical confirmation, never for a reference or receipt match. */
function VerifiedNote({
  businessName,
  status,
}: {
  businessName: string
  status: PublicReportStatus
}) {
  const verified = verifiedConfirmation(status)
  if (!verified) return null
  return (
    <p
      className={`${cardClass} flex flex-col gap-0.5 border-l-4 border-l-success-border px-3.5 py-3 text-sm leading-relaxed`}
    >
      <b>Payment verified</b>
      <span className="text-muted-foreground">
        Confirmed by {businessName}
        {verified.confirmedAt ? (
          <>
            {" · "}
            <LocalDate value={verified.confirmedAt} />
          </>
        ) : null}
        . The amounts below are the recorded result.
      </span>
    </p>
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
        {businessName} confirmed they received {received}.{short}
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
  const reference = reportReference(status)
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
          ...(reference
            ? [
                {
                  label: "Payment reference",
                  value: <ReferenceValue reference={reference} />,
                },
              ]
            : []),
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
      {reference ? (
        <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
          A matching reference helps {link.businessName} find your transfer.
          They still confirm it in their bank account.
        </p>
      ) : null}
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
  const dueMinor =
    view.kind === "link"
      ? view.link.amountPrefilledMinor
      : (link?.amountPrefilledMinor ?? 0)
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
  // "I have paid" opens the name step in place; a second explicit submit reports.
  const [revealed, setRevealed] = useState(false)
  // Set once when the step first opens, so refetches never replace what the customer typed.
  const [payerName, setPayerName] = useState<string | null>(null)
  const [step, setStep] = useState<SendStep | null>(null)
  const [flowError, setFlowError] = useState<string | null>(null)
  const sendingRef = useRef(false)
  const revealId = useId()
  const paidButtonRef = useRef<HTMLButtonElement>(null)
  // A decided report stays the whole page until the customer explicitly starts a new one, the
  // server issues its payment attempt, and the link shows that exact attempt.
  const [nextForm, setNextForm] = useState<{
    outcomeKey: string
    paymentAttemptId: string
  } | null>(null)
  const [nextNotice, setNextNotice] = useState<
    | { outcomeKey: string; kind: "error"; message: string }
    | { outcomeKey: string; kind: "changed"; attempt: IssuedAttempt }
    | null
  >(null)
  const [nextBusy, setNextBusy] = useState(false)
  const nextBusyRef = useRef(false)
  const newFormRef = useRef<HTMLElement>(null)
  const focusNewForm = useRef(false)

  const finishing = view.kind === "unfinished" && Boolean(record?.reportToken)
  const claimMinor = finishing
    ? (record?.claimedAmountMinor ?? 0)
    : link?.allowPartial
      ? (majorToMinor(shownAmountText) ?? 0)
      : dueMinor

  // The link closed or expired while the name step was open.
  useEffect(() => {
    if (link && link.state !== "active" && step === null && !finishing)
      setRevealed(false)
  }, [link, step, finishing])

  useEffect(() => {
    if (!nextForm || !focusNewForm.current) return
    focusNewForm.current = false
    newFormRef.current?.focus()
  }, [nextForm])

  const amountIsValid = () => {
    if (finishing || !link?.allowPartial) return true
    const value = majorToMinor(shownAmountText)
    const problem =
      value === null || value <= 0
        ? "Enter the amount you sent."
        : value > dueMinor
          ? `Enter up to ${money(dueMinor, link.currencyCode)}.`
          : null
    setAmountError(problem)
    if (problem) amountRef.current?.focus()
    return !problem
  }

  const openClaim = () => {
    setFlowError(null)
    if (!link || !amountIsValid()) return
    setPayerName(
      (current) =>
        current ??
        (finishing
          ? (record?.payerName ?? "")
          : initialPayerName({ record, customerName: link.customerName })),
    )
    setRevealed(true)
  }

  const closeClaim = () => {
    setRevealed(false)
    setFlowError(null)
    requestAnimationFrame(() => paidButtonRef.current?.focus())
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
            // The report being checked keeps the attempt it was made against.
            paymentAttemptId: existing.paymentAttemptId,
            paymentReference: existing.paymentReference,
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
        // Bound to the reference on screen; the server refuses it once it is not current.
        paymentAttemptId: link.paymentAttemptId,
      }
      attempt =
        record && !record.reportToken && sameReportDetails(record, details)
          ? record
          : {
              v: 1,
              clientReportId: newClientReportId(),
              ...details,
              paymentReference: link.paymentReference,
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
      setRevealed(false)
      setPayerName(null)
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
          setRevealed(false)
          return
        }
        if (/payment reference changed/i.test(error.message)) {
          // Show the current reference first; the next explicit submit binds to it.
          void queryClient.invalidateQueries({ queryKey: linkKey })
          setFlowError(
            "The payment reference changed. Check the reference above before you tell them.",
          )
          return
        }
        if (/start a new payment attempt/i.test(error.message)) {
          void queryClient.invalidateQueries({ queryKey: linkKey })
          setFlowError(
            "This payment reference was already used for a report that was decided. Open this link in the browser you used before, or ask the business for a new link.",
          )
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

  /** Pay remaining / Tell them again, with the decided report's proof. */
  const startNextAttempt = async (decided: PublicReportStatus, key: string) => {
    if (!record?.reportToken || nextBusyRef.current) return
    nextBusyRef.current = true
    setNextBusy(true)
    setNextNotice(null)
    try {
      const result = await startNextPaymentAttempt({
        client,
        record,
        decidedAttemptId: decided.paymentAttemptId,
        save: (saved) => {
          writeStoredReport(token, saved)
          setRecord(saved)
        },
        readLink: async () => {
          // Never settle for an older read that was already in flight.
          await queryClient.cancelQueries({ queryKey: linkKey })
          return queryClient.fetchQuery({ ...linkOptions, staleTime: 0 })
        },
      })
      if (result.kind === "ready") {
        focusNewForm.current = true
        setNextForm({
          outcomeKey: key,
          paymentAttemptId: result.attempt.paymentAttemptId,
        })
        return
      }
      if (result.kind === "changed") {
        setNextNotice({
          outcomeKey: key,
          kind: "changed",
          attempt: result.attempt,
        })
        return
      }
      if (result.refresh)
        void queryClient.invalidateQueries({ queryKey: linkKey })
      setNextNotice({ outcomeKey: key, kind: "error", message: result.message })
    } finally {
      nextBusyRef.current = false
      setNextBusy(false)
    }
  }

  const retryAll = () => {
    void linkQuery.refetch()
    if (reportToken) reloadStatus()
  }

  const nameLocked = finishing && Boolean(record?.payerName)
  const claimStep = (receiptSlot?: ReactNode) =>
    link && revealed && (link.state === "active" || finishing) ? (
      <ClaimReveal
        id={revealId}
        link={link}
        amountMinor={claimMinor}
        name={nameLocked ? (record?.payerName ?? "") : (payerName ?? "")}
        onNameChange={setPayerName}
        nameLocked={nameLocked}
        receipt={receiptSlot}
        step={step}
        error={flowError}
        onConfirm={(name) => {
          if (amountIsValid()) void confirm(name)
        }}
        onCancel={closeClaim}
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
      <WaitingView
        link={viewLink}
        status={view.status}
        record={record}
        connection={connection}
        onReload={reloadStatus}
        canRecover={hasPersistedReport(token, reportToken)}
      />
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
            revealed ? null : (
              <button
                ref={paidButtonRef}
                type="button"
                className={`${primaryButtonClass} mt-3`}
                aria-expanded={false}
                aria-controls={revealId}
                onClick={openClaim}
              >
                Finish telling them
              </button>
            )
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
              ...(record.paymentReference
                ? [
                    {
                      label: "Payment reference",
                      value: (
                        <ReferenceValue reference={record.paymentReference} />
                      ),
                    },
                  ]
                : []),
              {
                label: "Receipt",
                value: record.receipt?.fileName ?? "No receipt",
              },
            ]}
          />
        ) : null}
        {revealed ? (
          <section className={`${cardClass} flex flex-col p-4`}>
            {claimStep(
              viewLink.receiptAllowed ? (
                <ReceiptPicker
                  receipt={receipt}
                  onChange={setReceipt}
                  disabled={step !== null}
                />
              ) : null,
            )}
          </section>
        ) : null}
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

  // What the business confirmed and what is still due, from the decided report.
  const outcomeReference = outcome ? reportReference(outcome.status) : null
  const outcomeAmounts =
    outcome && outcome.state !== "not_received" ? (
      <DetailList
        rows={[
          {
            label: "Received",
            value: (
              <b className="tabular-nums">
                {money(
                  outcome.status.receivedAmountMinor ?? 0,
                  viewLink.currencyCode,
                )}
              </b>
            ),
          },
          {
            label: "Still to pay",
            value: (
              <b className="tabular-nums">
                {money(outcome.status.balanceMinor, viewLink.currencyCode)}
              </b>
            ),
          },
          ...(outcomeReference
            ? [
                {
                  label: "Payment reference",
                  value: <ReferenceValue reference={outcomeReference} />,
                },
              ]
            : []),
        ]}
      />
    ) : null
  const verifiedNote =
    outcome && outcome.state !== "not_received" ? (
      <VerifiedNote
        businessName={viewLink.businessName}
        status={outcome.status}
      />
    ) : null

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
        {verifiedNote}
        {outcomeAmounts}
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

  const next = outcome
    ? outcomeNextStep(outcome.state, {
        linkState: viewLink.state,
        balanceMinor: outcome.status.balanceMinor,
      })
    : null
  const outcomeKey = outcome
    ? `${outcome.status.reportId}:${outcome.status.revision}`
    : null
  // Open only while the link still shows the exact attempt the customer moved on to.
  const nextFormOpen =
    nextForm !== null &&
    nextForm.outcomeKey === outcomeKey &&
    nextForm.paymentAttemptId === viewLink.paymentAttemptId
  if (outcome && outcomeKey && !(next && nextFormOpen)) {
    // What a new report would ask for: this link's amount, up to what is still due.
    const nextMinor = Math.min(
      viewLink.amountRequestedMinor,
      outcome.status.balanceMinor,
    )
    // A newer reference is offered only while the link still shows it.
    const notice =
      nextNotice?.outcomeKey === outcomeKey &&
      (nextNotice.kind === "error" ||
        nextNotice.attempt.paymentAttemptId === viewLink.paymentAttemptId)
        ? nextNotice
        : null
    const decided = outcome.status
    return (
      <PaymentShell>
        {header}
        {outcomeCard}
        {verifiedNote}
        {outcomeAmounts}
        {next && notice?.kind === "changed" ? (
          <section
            className={`${cardClass} flex flex-col gap-2 border-l-4 border-l-warning px-3.5 py-3 text-sm leading-relaxed`}
            aria-live="polite"
          >
            <b>This link has a newer payment reference</b>
            <span className="text-muted-foreground">
              Your last report keeps its own reference. Use this one only for a
              new transfer.
            </span>
            <div>
              <ReferenceValue reference={notice.attempt.paymentReference} />
            </div>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                focusNewForm.current = true
                setNextForm({
                  outcomeKey,
                  paymentAttemptId: notice.attempt.paymentAttemptId,
                })
              }}
            >
              Continue with this reference
            </button>
          </section>
        ) : next ? (
          <button
            type="button"
            className={primaryButtonClass}
            disabled={nextBusy}
            onClick={() => void startNextAttempt(decided, outcomeKey)}
          >
            {nextBusy
              ? "Getting a new payment reference…"
              : next === "tell_again"
                ? "Tell them again"
                : nextMinor < outcome.status.balanceMinor
                  ? `Pay ${money(nextMinor, viewLink.currencyCode)} more`
                  : `Pay remaining ${money(nextMinor, viewLink.currencyCode)}`}
          </button>
        ) : null}
        {next && notice?.kind === "error" ? (
          <p
            role="alert"
            className="text-center text-[13px] leading-relaxed text-destructive"
          >
            {notice.message}
          </p>
        ) : null}
        <OrderSummary link={viewLink} />
      </PaymentShell>
    )
  }
  // The decided report keeps its own reference; say which one this transfer uses instead.
  const previousReference = outcome ? reportReference(outcome.status) : null

  const again = next === "tell_again"
  return (
    <PaymentShell hero={<PaymentHero link={viewLink} />}>
      <section
        ref={newFormRef}
        tabIndex={-1}
        aria-label="Pay by bank transfer"
        className={`${cardClass} flex flex-col gap-3 p-4 outline-none`}
      >
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
            disabled={step !== null}
          />
        ) : outcome ? (
          <FixedAmount
            amountMinor={dueMinor}
            currencyCode={viewLink.currencyCode}
          />
        ) : null}
        {previousReference &&
        viewLink.paymentReference &&
        previousReference !== viewLink.paymentReference ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            This transfer has a new payment reference. Your last report used{" "}
            <span className="break-all">{previousReference}</span>.
          </p>
        ) : null}
        <BankDetails
          link={viewLink}
          amountMinor={viewLink.allowPartial ? null : dueMinor}
          detailsAmountMinor={
            !viewLink.allowPartial
              ? dueMinor
              : claimMinor > 0 && claimMinor <= dueMinor
                ? claimMinor
                : null
          }
        />
        {viewLink.receiptAllowed ? (
          <ReceiptPicker
            receipt={receipt}
            onChange={setReceipt}
            disabled={step !== null}
          />
        ) : null}
        {revealed ? (
          claimStep()
        ) : (
          <div className="sticky bottom-0 -mx-4 -mb-4 rounded-b-2xl bg-card px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              ref={paidButtonRef}
              type="button"
              className={primaryButtonClass}
              aria-expanded={false}
              aria-controls={revealId}
              onClick={openClaim}
            >
              {again ? "I have paid · tell them again" : "I have paid"}
            </button>
          </div>
        )}
      </section>
    </PaymentShell>
  )
}
