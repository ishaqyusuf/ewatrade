"use client"

import { Skeleton } from "@ewatrade/ui"
import { useEffect, useState } from "react"
import {
  type PublicPaymentLink,
  type PublicReportStatus,
  formatReportedAt,
  itemsSummary,
  lastDigits,
  money,
} from "./payment-format"
import {
  BusinessHeader,
  ConfirmingRings,
  DetailList,
  HeroAmountCopy,
  LiveIndicator,
  OrderDetails,
  PaymentShell,
  ReferenceValue,
  StatusCard,
  UpdatedAt,
  cardClass,
} from "./payment-parts"
import {
  type ReportOutcome,
  reportReference,
  verifiedConfirmation,
} from "./payment-view"
import { ReceiptCheck } from "./receipt-check"
import { allocationSummary } from "./report-allocation"
import type { StoredReport } from "./report-storage"
import type { StatusConnection } from "./use-report-status"

/** Formats on the client only, so server and browser time zones never disagree. */
export function LocalDate({ value }: { value: Date | string }) {
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

export function PaymentHero({ link }: { link: PublicPaymentLink }) {
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
export function VerifiedNote({
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

export function OutcomeCard({
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

export function WaitingView({
  link,
  status,
  reportToken,
  record,
  connection,
  onReload,
  canRecover,
}: {
  link: PublicPaymentLink
  status: PublicReportStatus
  reportToken: string | null
  record: StoredReport | null
  connection: StatusConnection
  onReload: () => void
  canRecover: boolean
}) {
  const reportedAt = formatReportedAt(record?.reportedAt ?? null)
  const reference = reportReference(status)
  const proposal = allocationSummary(status)
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
      {proposal ? (
        <p className="text-center text-[13px] leading-relaxed text-muted-foreground">
          {proposal}
        </p>
      ) : null}
      {reportToken ? (
        <ReceiptCheck
          reportToken={reportToken}
          status={status}
          businessName={link.businessName}
          accountNumber={link.bank.accountNumber}
          hasReceipt={Boolean(record?.receipt)}
        />
      ) : null}
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

export function LoadingView() {
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
