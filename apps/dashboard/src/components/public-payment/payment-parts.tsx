"use client"

import { cn } from "@/utils"
import { BrandMark, Spinner } from "@ewatrade/ui"
import {
  ArrowDown01Icon,
  BankIcon,
  Cancel01Icon,
  Copy01Icon,
  File01Icon,
  Image01Icon,
  InformationCircleIcon,
  RefreshIcon,
  Tick02Icon,
  Upload04Icon,
  WifiDisconnected01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import {
  type PublicPaymentLink,
  businessInitials,
  copyableAmount,
  money,
  quantityLabel,
  spacedAccountNumber,
} from "./payment-format"
import {
  type PickedReceipt,
  RECEIPT_ACCEPT,
  ReceiptFileError,
  readReceipt,
  receiptSizeLabel,
} from "./receipt-file"
import type { StatusConnection } from "./use-report-status"

export const cardClass = "rounded-2xl bg-card text-card-foreground"
export const primaryButtonClass =
  "flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-base font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-60"
export const secondaryButtonClass =
  "flex h-13 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-border bg-card px-4 text-base font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-60"
const smallButtonClass =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"

/** Branded page frame: centered column, an optional hero band and the EwaTrade footer. */
export function PaymentShell({
  hero,
  children,
}: {
  hero?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="catalog-theme flex min-h-dvh flex-col bg-muted text-foreground dark:bg-background">
      {hero}
      <main
        className={cn(
          "mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-3.5 px-4 pb-6 sm:px-5",
          hero ? "pt-4" : "pt-10 sm:pt-16",
        )}
      >
        {children}
        <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
          Secure page by
          <BrandMark className="size-3.5 text-foreground" />
          EwaTrade
        </p>
      </main>
    </div>
  )
}

export function BusinessHeader({
  businessName,
  orderNumber,
}: {
  businessName: string
  orderNumber: string
}) {
  return (
    <header className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary font-extrabold text-primary-foreground"
      >
        {businessInitials(businessName)}
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-bold">{businessName}</h1>
        <p className="text-[13px] text-muted-foreground">Order {orderNumber}</p>
      </div>
    </header>
  )
}

type Tone = "ok" | "bad" | "info" | "wait"
const toneClass: Record<Tone, string> = {
  ok: "bg-success text-success-foreground",
  bad: "bg-danger text-danger-foreground",
  info: "bg-info text-info-foreground",
  wait: "bg-warning text-warning-foreground",
}
const toneIcon = {
  ok: Tick02Icon,
  bad: Cancel01Icon,
  info: InformationCircleIcon,
  wait: InformationCircleIcon,
} as const

export function StatusCard({
  tone,
  title,
  children,
  big = false,
  footer,
  live = false,
}: {
  tone: Tone
  title: string
  children?: ReactNode
  big?: boolean
  footer?: ReactNode
  /** Announce the card when it replaces the waiting state. */
  live?: boolean
}) {
  return (
    <section
      className={cn(
        cardClass,
        "flex flex-col items-center gap-1.5 px-4 py-6 text-center",
      )}
      role={live ? "status" : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid place-items-center rounded-full",
          big ? "size-[68px]" : "size-13",
          toneClass[tone],
          big && "motion-safe:animate-in motion-safe:zoom-in-50",
        )}
      >
        <HugeiconsIcon
          icon={toneIcon[tone]}
          strokeWidth={2}
          className={big ? "size-8" : "size-6"}
        />
      </span>
      <h2 className="mt-1 text-[21px] font-extrabold leading-snug">{title}</h2>
      {children ? (
        <div className="text-[15px] leading-relaxed text-muted-foreground">
          {children}
        </div>
      ) : null}
      {footer}
    </section>
  )
}

export function UpdatedAt({ at }: { at: number }) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    setLabel(
      new Intl.DateTimeFormat("en-NG", {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(at)),
    )
  }, [at])
  if (!label) return null
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
      <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-3.5" />
      Updated {label}
    </span>
  )
}

/** Public lines carry no id; their server order is stable for a link. */
function itemRows(items: PublicPaymentLink["items"]) {
  return items.map((item, position) => ({ item, key: `${position}` }))
}

export function OrderSummary({
  link,
  className,
}: {
  link: PublicPaymentLink
  className?: string
}) {
  const { currencyCode } = link
  return (
    <section className={cn(cardClass, "px-4 py-3.5", className)}>
      <p className="mb-3 text-sm text-muted-foreground">
        Order · {link.orderStatus.toLowerCase().replaceAll("_", " ")}
      </p>
      <ul className="flex flex-col gap-1.5 border-b border-dashed border-border pb-2.5 text-[15px]">
        {itemRows(link.items).map(({ item, key }) => (
          <li key={key} className="flex justify-between gap-3">
            <span className="min-w-0">
              {item.name}
              {item.kind === "SERVICE"
                ? ""
                : ` × ${quantityLabel(item.quantity)}`}
            </span>
            <b className="shrink-0 tabular-nums">
              {money(item.totalMinor, currencyCode)}
            </b>
          </li>
        ))}
      </ul>
      <dl className="mt-2.5 flex flex-col gap-1 text-[15px]">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="tabular-nums">
            {money(link.totalMinor, currencyCode)}
          </dd>
        </div>
        {link.paidMinor > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="tabular-nums">
              {money(link.paidMinor, currencyCode)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between text-lg font-extrabold">
          <dt>{link.balanceMinor > 0 ? "To pay" : "Balance"}</dt>
          <dd className="tabular-nums">
            {money(link.balanceMinor, currencyCode)}
          </dd>
        </div>
      </dl>
    </section>
  )
}

export function OrderDetails({ link }: { link: PublicPaymentLink }) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-bold [&::-webkit-details-marker]:hidden">
        View order
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-4 transition-transform group-open:rotate-180"
        />
      </summary>
      <OrderSummary link={link} className="mt-2" />
    </details>
  )
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    const area = document.createElement("textarea")
    area.value = value
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.append(area)
    area.select()
    const copied = document.execCommand("copy")
    area.remove()
    return copied
  }
}

function CopyButton({
  value,
  label,
  onCopied,
}: {
  value: string
  label: string
  onCopied: (message: string) => void
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className={smallButtonClass}
      aria-label={`Copy ${label}`}
      onClick={async () => {
        const ok = await copyText(value)
        setCopied(ok)
        onCopied(ok ? `${label} copied` : `Couldn't copy the ${label}`)
      }}
    >
      <HugeiconsIcon
        icon={copied ? Tick02Icon : Copy01Icon}
        strokeWidth={2}
        className="size-3.5"
      />
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

export function BankDetails({
  link,
  amountMinor,
}: {
  link: PublicPaymentLink
  /** Shown with Copy when the amount is fixed; omitted when the customer types it. */
  amountMinor: number | null
}) {
  const [announcement, setAnnouncement] = useState("")
  const rows: Array<{
    label: string
    value: string
    copy?: string
    big?: boolean
  }> = [
    { label: "Bank", value: link.bank.name },
    {
      label: "Account number",
      value: spacedAccountNumber(link.bank.accountNumber),
      copy: link.bank.accountNumber,
      big: true,
    },
    {
      label: "Account name",
      value: link.bank.accountHolder,
      copy: link.bank.accountHolder,
    },
    ...(amountMinor !== null
      ? [
          {
            label: "Amount",
            value: money(amountMinor, link.currencyCode),
            copy: copyableAmount(amountMinor),
          },
        ]
      : []),
    { label: "Narration", value: link.orderNumber, copy: link.orderNumber },
  ]
  return (
    <div className="overflow-hidden rounded-2xl border-[1.5px] border-border">
      <dl>
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col border-b border-border px-3.5 py-2.5 last:border-b-0"
          >
            <dt className="text-[12.5px] text-muted-foreground">{row.label}</dt>
            <dd className="flex items-center justify-between gap-2">
              <b
                className={cn(
                  "min-w-0 break-words tabular-nums",
                  row.big ? "text-[21px] tracking-wide" : "text-base",
                )}
              >
                {row.value}
              </b>
              {row.copy ? (
                <CopyButton
                  value={row.copy}
                  label={row.label.toLowerCase()}
                  onCopied={setAnnouncement}
                />
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  )
}

export function FixedAmount({
  amountMinor,
  currencyCode,
}: {
  amountMinor: number
  currencyCode: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <small className="text-[13px] text-muted-foreground">
        Amount to transfer
      </small>
      <b className="text-[30px] font-extrabold tracking-tight tabular-nums">
        {money(amountMinor, currencyCode)}
      </b>
    </div>
  )
}

export function AmountField({
  value,
  onChange,
  maxMinor,
  currencyCode,
  currencySymbol,
  error,
  inputRef,
}: {
  value: string
  onChange: (value: string) => void
  maxMinor: number
  currencyCode: string
  currencySymbol: string
  error: string | null
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] text-muted-foreground">
        Amount you're paying
      </label>
      <div
        className={cn(
          "flex h-13 items-center gap-1 rounded-2xl border-[1.5px] bg-card px-3.5 focus-within:ring-3 focus-within:ring-ring/30",
          error ? "border-destructive" : "border-border",
        )}
      >
        <span className="text-xl font-extrabold text-muted-foreground">
          {currencySymbol}
        </span>
        <input
          ref={inputRef}
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint`}
          className="h-full min-w-0 flex-1 bg-transparent text-2xl font-extrabold tabular-nums outline-none"
        />
      </div>
      <span
        id={`${id}-hint`}
        className={cn(
          "text-[13px]",
          error ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {error ??
          `You can pay part now. Up to ${money(maxMinor, currencyCode)}.`}
      </span>
    </div>
  )
}

export function ReceiptPicker({
  receipt,
  onChange,
  disabled = false,
}: {
  receipt: PickedReceipt | null
  onChange: (receipt: PickedReceipt | null) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setReading(true)
    try {
      onChange(await readReceipt(file))
    } catch (failure) {
      setError(
        failure instanceof ReceiptFileError
          ? failure.message
          : "That file couldn't be read. Try another one.",
      )
    } finally {
      setReading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      {receipt ? (
        <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-border px-3.5 py-3">
          <HugeiconsIcon
            icon={
              receipt.meta.contentType === "application/pdf"
                ? File01Icon
                : Image01Icon
            }
            strokeWidth={2}
            className="size-5 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[15px]">
              {receipt.meta.fileName}
            </b>
            <small className="text-[13px] text-muted-foreground">
              {receiptSizeLabel(receipt.meta.sizeBytes)}
            </small>
          </span>
          <button
            type="button"
            className={smallButtonClass}
            aria-label="Remove receipt"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || reading}
          aria-describedby={error ? errorId : undefined}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-border px-3.5 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
        >
          {reading ? (
            <Spinner className="size-5 shrink-0" />
          ) : (
            <HugeiconsIcon
              icon={Upload04Icon}
              strokeWidth={2}
              className="size-5 shrink-0 text-muted-foreground"
            />
          )}
          <span className="flex-1">
            <b className="block text-[15px]">
              {reading ? "Checking the file…" : "Add transfer receipt"}
            </b>
            <small className="text-[13px] text-muted-foreground">
              Optional · photo or PDF, up to 4 MB
            </small>
          </span>
        </button>
      )}
      {error ? (
        <span
          id={errorId}
          role="alert"
          className="text-[13px] text-destructive"
        >
          {error}
        </span>
      ) : null}
    </div>
  )
}

/** Calm pulsing rings; reduced motion shows one still ring. */
export function ConfirmingRings() {
  return (
    <div
      aria-hidden="true"
      className="relative grid size-[110px] place-items-center"
    >
      {[0, 800, 1600].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms`, animationDuration: "2.4s" }}
          className={cn(
            "absolute inset-[27px] rounded-full border-2 border-primary opacity-60",
            "motion-safe:animate-ping",
            "motion-reduce:inset-[8px] motion-reduce:opacity-25",
            delay > 0 && "motion-reduce:hidden",
          )}
        />
      ))}
      <span className="relative grid size-[62px] place-items-center rounded-full bg-primary text-primary-foreground">
        <HugeiconsIcon icon={BankIcon} strokeWidth={2} className="size-7" />
      </span>
    </div>
  )
}

export function LiveIndicator({
  connection,
  onReload,
}: {
  connection: StatusConnection
  onReload: () => void
}) {
  if (connection === "reconnecting" || connection === "stopped")
    return (
      <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-warning py-1.5 pr-1.5 pl-3 text-[12.5px] text-warning-foreground">
        <HugeiconsIcon
          icon={WifiDisconnected01Icon}
          strokeWidth={2}
          className="size-4"
        />
        <span>
          {connection === "stopped"
            ? "Connection lost · reload to check"
            : "Connection lost · trying again"}
        </span>
        <button
          type="button"
          onClick={onReload}
          className="h-7 rounded-full bg-card px-2.5 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          Reload
        </button>
      </div>
    )
  return (
    <div className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          connection === "connecting"
            ? "bg-muted-foreground/50"
            : "bg-[#22a06b] shadow-[0_0_0_3px_rgba(34,160,107,0.2)]",
        )}
      />
      <span>
        {connection === "connecting"
          ? "Connecting…"
          : "This page updates by itself"}
      </span>
    </div>
  )
}

export function DetailList({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode }>
}) {
  return (
    <dl className={cn(cardClass, "overflow-hidden")}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5 text-[15px] last:border-b-0"
        >
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 text-right break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
