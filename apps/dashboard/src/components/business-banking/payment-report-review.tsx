"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { orderMoney } from "@/components/orders/order-draft"
import { useOrderPaymentAccounts } from "@/components/orders/order-payment-account"
import { useTRPC } from "@/trpc/client"
import {
  Badge,
  Button,
  ControlField,
  DateControl,
  Input,
  MoneyInput,
  SelectControl,
  Textarea,
  cn,
} from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import {
  Alert02Icon,
  Cancel01Icon,
  Image01Icon,
  LinkSquare02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { type ReactNode, useId, useState } from "react"
import {
  NOT_RECEIVED_NOTE_MAX,
  NOT_RECEIVED_REASONS,
  businessToday,
  errorCode,
  maskedAccountSuffix,
  receivedAtFromDay,
  receivedLine,
} from "./business-banking-model"
import { CustomerMessageEditor } from "./customer-message-editor"
import {
  PaymentAlertDeliveries,
  type PaymentAlertDelivery,
} from "./payment-alert-deliveries"

type Step = "check" | "confirm" | "not-received"

type ReviewResult = {
  status: string
  state: string
  receivedAmountMinor: number | null
  totalMinor: number
  paidMinor: number
  balanceMinor: number
  currencyCode: string
  copyText: string
  whatsappUrl: string | null
  replay: boolean
}

export function formatReportTime(
  value: Date | string | null,
  timeZone: string,
) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value))
}

/** "2026-10-26" → "26 Oct 2026", without shifting the calendar day. */
function formatDay(day: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return day
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(
    new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
    ),
  )
}

/**
 * One customer payment claim beside the order facts (Business banking 02).
 * Confirming records one Order payment on the server; Not received records
 * nothing and tells the customer why.
 */
export function PaymentReportReview({
  reportId,
  timeZone,
  onReviewed,
  onClose,
}: {
  reportId: string
  timeZone: string
  onReviewed: () => Promise<unknown> | undefined
  onClose: () => void
}) {
  const trpc = useTRPC()
  const report = useQuery(
    trpc.businessBanking.report.queryOptions(
      { reportId },
      { retry: false, staleTime: 0 },
    ),
  )
  if (report.isPending)
    return (
      <Pane title="Payment">
        <output aria-live="polite" className="text-sm text-muted-foreground">
          Loading payment…
        </output>
      </Pane>
    )
  if (report.isError) {
    const code = errorCode(report.error)
    return (
      <Pane
        title="Payment"
        footer={
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        }
      >
        <div role="alert" className="grid gap-3">
          <FormFeedback appearance="dashboard">
            {code === "FORBIDDEN"
              ? "Only staff who can take payments can check payments."
              : code === "NOT_FOUND"
                ? "This payment isn't available. It may belong to another Store."
                : "This payment couldn't load."}
          </FormFeedback>
          {code === "FORBIDDEN" || code === "NOT_FOUND" ? null : (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => void report.refetch()}
            >
              Try again
            </Button>
          )}
        </div>
      </Pane>
    )
  }
  return (
    <ReviewFlow
      key={report.data.reportId}
      report={report.data}
      timeZone={timeZone}
      onRefresh={async () => {
        await Promise.all([report.refetch(), onReviewed()])
      }}
      onReviewed={onReviewed}
      onClose={onClose}
    />
  )
}

type Report = {
  reportId: string
  /** Missing from an older server's report. */
  alertDeliveries?: PaymentAlertDelivery[]
  revision: number
  status: string
  payerName: string
  claimedAmountMinor: number
  receivedAmountMinor: number | null
  submittedAt: Date | string | null
  decidedAt: Date | string | null
  receivedAt: Date | string | null
  decisionNote: string | null
  bankReference: string | null
  receivedAccountId: string | null
  currencyCode: string
  orderId: string
  orderNumber: string
  totalMinor: number
  paidMinor: number
  balanceMinor: number
  bankAccountId: string
  bank: {
    name: string | null
    accountHolder: string | null
    accountNumber: string | null
  }
  receiptPath: string | null
  receiptContentType: string | null
  receiptSizeBytes: number | null
}

function ReviewFlow({
  report,
  timeZone,
  onRefresh,
  onReviewed,
  onClose,
}: {
  report: Report
  timeZone: string
  onRefresh: () => Promise<void>
  onReviewed: () => Promise<unknown> | undefined
  onClose: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const money = (value: number) => orderMoney(value, report.currencyCode)
  const [step, setStep] = useState<Step>("check")
  const [received, setReceived] = useState("")
  const [chosenAccount, setChosenAccount] = useState("")
  const [day, setDay] = useState(() => businessToday(timeZone))
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  // Fixed the first time the person reaches the confirm step for a day, so a
  // retry sends the exact same decision (the server treats it as a replay).
  const [stamp, setStamp] = useState<{ day: string; at: Date } | null>(null)
  const receivedAt = stamp?.day === day ? stamp.at : null
  const [result, setResult] = useState<ReviewResult | null>(null)
  const accountsQuery = useOrderPaymentAccounts()
  const eligible = (accountsQuery.data?.accounts ?? []).filter(
    (account) =>
      account.purpose === "BANK" &&
      account.paymentMethods.includes("bank_transfer") &&
      !account.paused,
  )
  const accountId = eligible.some((account) => account.id === chosenAccount)
    ? chosenAccount
    : eligible.some((account) => account.id === report.bankAccountId)
      ? report.bankAccountId
      : eligible.length === 1
        ? (eligible[0]?.id ?? "")
        : ""
  const accountName =
    eligible.find((account) => account.id === accountId)?.name ?? ""
  const receivedMinor = majorToMinor(received)
  const line = receivedLine({
    receivedMinor,
    claimedMinor: report.claimedAmountMinor,
    balanceMinor: report.balanceMinor,
  })
  const today = businessToday(timeZone)
  const dayProblem = !receivedAtFromDay(day)
    ? "Choose the day the money arrived."
    : day > today
      ? "The day can't be in the future."
      : null
  const accountProblem = accountsQuery.isPending
    ? "Loading accounts…"
    : accountsQuery.isError
      ? "Money accounts couldn't load."
      : !accountsQuery.data?.book
        ? "Set up Finance before confirming bank payments."
        : !eligible.length
          ? "No bank account takes bank transfers. An owner or admin can turn one on in Finance → Money accounts."
          : !accountId
            ? "Choose the account the money arrived in."
            : null
  const canConfirm =
    line.kind === "records" && !accountProblem && !dayProblem && !!receivedMinor

  const review = useMutation(
    trpc.businessBanking.reviewReport.mutationOptions({
      onSuccess: async (data) => {
        setResult(data)
        await Promise.all([
          onReviewed(),
          queryClient.invalidateQueries({
            queryKey: trpc.orders.get.queryKey({ orderId: report.orderId }),
          }),
        ])
      },
    }),
  )
  const failure = review.error
  const conflict = errorCode(failure) === "CONFLICT"
  const failureMessage = !failure
    ? null
    : conflict
      ? "This payment was already reviewed, or it changed while you were checking."
      : errorCode(failure) === "FORBIDDEN"
        ? "Only staff who can take payments can confirm or decline it."
        : failure.message

  const decided =
    report.status === "CONFIRMED" || report.status === "NOT_RECEIVED"
  const title = `Payment from ${report.payerName}`

  if (result) {
    const recorded = result.status === "CONFIRMED"
    return (
      <Pane
        title={recorded ? "Payment recorded" : "Marked not received"}
        footer={
          <>
            <Button
              variant="outline"
              render={
                <Link
                  href={`/sales/orders/${encodeURIComponent(report.orderId)}`}
                />
              }
            >
              View order
            </Button>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        <Outcome
          tone={recorded ? "ok" : "bad"}
          title={
            recorded
              ? `${money(result.receivedAmountMinor ?? 0)} recorded on ${report.orderNumber}`
              : "Not received"
          }
          detail={
            recorded
              ? result.balanceMinor > 0
                ? `Part paid · ${money(result.balanceMinor)} still to pay`
                : "Paid in full"
              : `${note.trim()} ${report.orderNumber} is unchanged.`
          }
        />
        <dl className="grid grid-cols-3 gap-3 rounded-lg border p-3 text-sm">
          {[
            ["Order total", money(result.totalMinor)],
            ["Paid", money(result.paidMinor)],
            ["Still to pay", money(result.balanceMinor)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {result.replay ? (
          <p className="text-xs text-muted-foreground">
            This decision was already saved. Nothing was recorded twice.
          </p>
        ) : null}
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">Tell {report.payerName}</h3>
          <CustomerMessageEditor
            initialText={result.copyText}
            whatsappUrl={result.whatsappUrl}
            noPhoneNote={`${report.orderNumber} has no saved customer phone. Copy the message and send it yourself.`}
          />
          <p className="text-xs text-muted-foreground">
            {report.payerName}'s payment page will show this decision when
            connected.
          </p>
        </section>
      </Pane>
    )
  }

  if (decided || report.status !== "SUBMITTED")
    return (
      <Pane
        title={title}
        footer={
          <Button
            variant="outline"
            render={
              <Link
                href={`/sales/orders/${encodeURIComponent(report.orderId)}`}
              />
            }
          >
            View order
          </Button>
        }
      >
        <Outcome
          tone={report.status === "CONFIRMED" ? "ok" : "bad"}
          title={
            report.status === "CONFIRMED"
              ? `Confirmed: ${money(report.receivedAmountMinor ?? 0)} recorded once on ${report.orderNumber}`
              : report.status === "NOT_RECEIVED"
                ? "Marked not received"
                : "The customer hasn't finished sending this yet"
          }
          detail={
            report.status === "CONFIRMED"
              ? `Checked ${formatReportTime(report.decidedAt, timeZone)}. Nothing more to do.`
              : report.status === "NOT_RECEIVED"
                ? `${report.decisionNote ?? ""} Checked ${formatReportTime(report.decidedAt, timeZone)}.`
                : "It shows here once they tap I have paid."
          }
        />
        <ClaimFacts report={report} timeZone={timeZone} />
        <OrderFacts report={report} />
      </Pane>
    )

  const errorBox = failureMessage ? (
    <div role="alert" className="grid gap-2">
      <FormFeedback appearance="dashboard">{failureMessage}</FormFeedback>
      {conflict ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() =>
            void onRefresh().then(() => {
              review.reset()
              setStep("check")
            })
          }
        >
          Refresh
        </Button>
      ) : null}
    </div>
  ) : null

  if (step === "confirm" && receivedMinor && receivedAt) {
    const left = report.balanceMinor - receivedMinor
    return (
      <Pane
        title="Record this payment?"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={review.isPending}
              onClick={() => {
                review.reset()
                setStep("check")
              }}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={review.isPending || conflict}
              onClick={() =>
                review.mutate({
                  reportId: report.reportId,
                  expectedRevision: report.revision,
                  outcome: "received",
                  receivedAmountMinor: receivedMinor,
                  moneyAccountId: accountId,
                  receivedAt,
                  reference: reference.trim() || undefined,
                })
              }
            >
              {review.isPending
                ? "Recording…"
                : `Record ${money(receivedMinor)}`}
            </Button>
          </>
        }
      >
        <div className="grid gap-1 rounded-lg border border-border bg-muted/40 p-4">
          <span className="text-xs text-muted-foreground">
            Record on {report.orderNumber}
          </span>
          <b className="text-2xl font-semibold tabular-nums">
            {money(receivedMinor)}
          </b>
          <span className="text-sm text-muted-foreground">
            received into {accountName} on {formatDay(day)}
          </span>
        </div>
        <Facts
          rows={[
            ["Customer said", money(report.claimedAmountMinor)],
            ["You received", <b key="r">{money(receivedMinor)}</b>],
            ["Into", accountName],
            ["Date", formatDay(day)],
            ["Reference", reference.trim() || "—"],
            [
              `${report.orderNumber} after this`,
              <b key="a">
                {left > 0
                  ? `${money(left)} to pay · Part paid`
                  : "Paid in full"}
              </b>,
            ],
          ]}
        />
        <p className="text-xs text-muted-foreground">
          This records one payment on the order, the same as Record payment. It
          can't be recorded twice.
        </p>
        {errorBox}
      </Pane>
    )
  }

  if (step === "not-received")
    return (
      <Pane
        title="Not received"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={review.isPending}
              onClick={() => {
                review.reset()
                setStep("check")
              }}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!note.trim() || review.isPending || conflict}
              onClick={() =>
                review.mutate({
                  reportId: report.reportId,
                  expectedRevision: report.revision,
                  outcome: "not_received",
                  note: note.trim(),
                })
              }
            >
              {review.isPending ? "Saving…" : "Mark not received"}
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Why can't you confirm {money(report.claimedAmountMinor)} from{" "}
          {report.payerName}?
        </p>
        <ReasonBox
          value={note}
          onChange={setNote}
          disabled={review.isPending}
        />
        <p className="text-xs text-muted-foreground">
          Nothing is recorded. {report.orderNumber}'s balance stays{" "}
          {money(report.balanceMinor)}. If some money did arrive, go back and
          record what arrived instead.
        </p>
        {errorBox}
      </Pane>
    )

  return (
    <Pane
      title={title}
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              review.reset()
              setStep("not-received")
            }}
          >
            Not received
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              const at = receivedAtFromDay(day)
              if (!at) return
              review.reset()
              if (!receivedAt) setStamp({ day, at })
              setStep("confirm")
            }}
          >
            <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" />
            Confirm received
          </Button>
        </>
      }
    >
      <div className="grid gap-5 xl:grid-cols-2">
        <ClaimFacts report={report} timeZone={timeZone} />
        <div className="grid content-start gap-4">
          <OrderFacts
            report={report}
            afterMinor={line.kind === "records" ? line.left : null}
          />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">
              What arrived in your account
            </h3>
            <ControlField label="Amount received">
              <MoneyInput
                currencyCode={report.currencyCode}
                value={received}
                placeholder="0.00"
                onChange={(event) => setReceived(event.target.value)}
              />
            </ControlField>
            <button
              type="button"
              aria-pressed={receivedMinor === report.claimedAmountMinor}
              className={cn(
                "w-fit rounded-full border border-border px-3 py-1 text-xs transition-colors hover:bg-muted",
                receivedMinor === report.claimedAmountMinor &&
                  "border-primary bg-primary/10",
              )}
              onClick={() =>
                setReceived(minorToMajorInput(report.claimedAmountMinor))
              }
            >
              Same as claim: {money(report.claimedAmountMinor)}
            </button>
            <div className="grid gap-3 sm:grid-cols-2">
              {accountsQuery.isSuccess &&
              accountsQuery.data.book &&
              eligible.length ? (
                <ControlField label="Received into">
                  <SelectControl
                    aria-label="Received into"
                    value={accountId}
                    placeholder="Choose a bank account"
                    onValueChange={setChosenAccount}
                    options={eligible.map((account) => ({
                      value: account.id,
                      label: account.name,
                    }))}
                  />
                </ControlField>
              ) : (
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">Received into</span>
                  <p className="text-xs text-muted-foreground">
                    {accountProblem}
                  </p>
                </div>
              )}
              <ControlField
                label="Date received"
                error={dayProblem ?? undefined}
              >
                <DateControl
                  value={day}
                  max={today}
                  onValueChange={setDay}
                  aria-label="Date received"
                />
              </ControlField>
            </div>
            <ControlField label="Bank reference (optional)">
              <Input
                value={reference}
                maxLength={160}
                placeholder="From your bank app"
                onChange={(event) => setReference(event.target.value)}
              />
            </ControlField>
            <LiveLine
              line={line}
              money={money}
              balanceMinor={report.balanceMinor}
            />
          </section>
        </div>
      </div>
      {errorBox}
    </Pane>
  )
}

function LiveLine({
  line,
  money,
  balanceMinor,
}: {
  line: ReturnType<typeof receivedLine>
  money: (value: number) => string
  balanceMinor: number
}) {
  if (line.kind === "empty")
    return (
      <p className="text-sm text-muted-foreground">
        Enter what you can see in your bank app.
      </p>
    )
  if (line.kind === "over")
    return (
      <p role="alert" className="text-sm text-destructive">
        That's more than the {money(balanceMinor)} balance. Record up to the
        balance and handle any extra separately.
      </p>
    )
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex items-start gap-1.5 rounded-lg px-3 py-2 text-sm",
        line.lessBy > 0
          ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
          : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
      )}
    >
      <HugeiconsIcon
        icon={line.lessBy > 0 ? Alert02Icon : Tick02Icon}
        className="mt-0.5 size-4 shrink-0"
        aria-hidden
      />
      <span>
        Records {money(balanceMinor - line.left)}.
        {line.lessBy > 0
          ? ` That's ${money(line.lessBy)} less than the customer said.`
          : ""}{" "}
        {line.left > 0 ? `${money(line.left)} still to pay.` : "Paid in full."}
      </span>
    </p>
  )
}

function ReasonBox({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const id = useId()
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Reason the customer will see
      </label>
      <Textarea
        id={id}
        rows={3}
        maxLength={NOT_RECEIVED_NOTE_MAX}
        placeholder="Write what you checked"
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-count`}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-count`} className="text-xs text-muted-foreground">
        {value.length} / {NOT_RECEIVED_NOTE_MAX} · required
      </p>
      <div className="flex flex-wrap gap-2">
        {NOT_RECEIVED_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            disabled={disabled}
            aria-pressed={value === reason}
            className={cn(
              "rounded-full border border-border px-3 py-1 text-xs transition-colors hover:bg-muted",
              value === reason && "border-primary bg-primary/10",
            )}
            onClick={() => onChange(reason)}
          >
            {reason}
          </button>
        ))}
      </div>
    </div>
  )
}

function ClaimFacts({
  report,
  timeZone,
}: {
  report: Report
  timeZone: string
}) {
  const money = (value: number) => orderMoney(value, report.currencyCode)
  const suffix = report.bank.accountNumber?.slice(-4) ?? ""
  // The claim card stays the customer's original claim; its status and note
  // follow the report's actual outcome so a reviewed report never reads open.
  const claim =
    report.status === "CONFIRMED"
      ? {
          label: "Confirmed",
          note: `The customer said ${money(report.claimedAmountMinor)}. ${money(report.receivedAmountMinor ?? 0)} was recorded from this report.`,
        }
      : report.status === "NOT_RECEIVED"
        ? {
            label: "Not received",
            note: "Marked not received. No money was recorded from this report.",
          }
        : report.status === "DRAFT"
          ? {
              label: "Draft",
              note: "The customer hasn't finished sending this. Nothing is recorded.",
            }
          : {
              label: "To check",
              note: "This is what the customer told us. Nothing is recorded until you confirm.",
            }
  return (
    <section className="grid content-start gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Customer says they paid
        </span>
        <Badge variant="outline">{claim.label}</Badge>
      </div>
      <b className="text-2xl font-semibold tabular-nums">
        {money(report.claimedAmountMinor)}
      </b>
      <Facts
        rows={[
          ["Name they gave", report.payerName],
          ["Submitted", formatReportTime(report.submittedAt, timeZone)],
          [
            "Link pays into",
            [report.bank.name, maskedAccountSuffix(suffix)]
              .filter(Boolean)
              .join(" ") +
              (report.bank.accountHolder
                ? ` · ${report.bank.accountHolder}`
                : ""),
          ],
        ]}
      />
      {report.receiptPath ? (
        <a
          href={report.receiptPath}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm hover:bg-muted/50"
        >
          <HugeiconsIcon icon={Image01Icon} className="size-5" aria-hidden />
          <span className="grid min-w-0 flex-1">
            <span className="font-medium">Transfer receipt</span>
            <span className="text-xs text-muted-foreground">
              Added by the customer
              {report.receiptSizeBytes
                ? ` · ${Math.max(1, Math.round(report.receiptSizeBytes / 1024))} KB`
                : ""}
              {report.receiptContentType === "application/pdf" ? " · PDF" : ""}
            </span>
          </span>
          <HugeiconsIcon
            icon={LinkSquare02Icon}
            className="size-4"
            aria-hidden
          />
          <span className="sr-only">Opens in a new tab</span>
        </a>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          <HugeiconsIcon icon={Image01Icon} className="size-4" aria-hidden />
          No receipt attached
        </p>
      )}
      <p className="text-xs text-muted-foreground">{claim.note}</p>
      <PaymentAlertDeliveries
        reportId={report.reportId}
        deliveries={report.alertDeliveries}
      />
    </section>
  )
}

function OrderFacts({
  report,
  afterMinor = null,
}: {
  report: Report
  afterMinor?: number | null
}) {
  const money = (value: number) => orderMoney(value, report.currencyCode)
  return (
    <Facts
      rows={[
        [
          "Order",
          <Link
            key="o"
            href={`/sales/orders/${encodeURIComponent(report.orderId)}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {report.orderNumber}
          </Link>,
        ],
        ["Total", money(report.totalMinor)],
        // Current canonical paid total; "before" only while this claim is open.
        [
          report.status === "SUBMITTED" ? "Paid before" : "Paid so far",
          money(report.paidMinor),
        ],
        ["Balance due", <b key="b">{money(report.balanceMinor)}</b>],
        ...(afterMinor === null
          ? []
          : ([
              [
                "After this",
                <b key="a">
                  {afterMinor > 0
                    ? `${money(afterMinor)} to pay`
                    : "Paid in full"}
                </b>,
              ],
            ] as Array<[string, ReactNode]>)),
      ]}
    />
  )
}

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid rounded-lg border border-border text-sm">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(7rem,40%)_minmax(0,1fr)] gap-3 border-t border-border px-3 py-2 first:border-t-0"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-right tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Outcome({
  tone,
  title,
  detail,
}: {
  tone: "ok" | "bad"
  title: string
  detail: string
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 text-sm",
        tone === "ok"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-red-500/30 bg-red-500/5",
      )}
    >
      <HugeiconsIcon
        icon={tone === "ok" ? Tick02Icon : Cancel01Icon}
        className="mt-0.5 size-5 shrink-0"
        aria-hidden
      />
      <span className="grid gap-0.5">
        <b className="font-semibold">{title}</b>
        <span className="text-muted-foreground">{detail}</span>
      </span>
    </div>
  )
}

function Pane({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="grid min-w-0 content-start rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </header>
      <div className="grid min-w-0 gap-4 p-5">{children}</div>
      {footer ? (
        <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
          {footer}
        </footer>
      ) : null}
    </section>
  )
}
