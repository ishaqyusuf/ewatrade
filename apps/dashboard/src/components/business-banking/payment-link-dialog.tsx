"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { orderMoney } from "@/components/orders/order-draft"
import {
  DialogField,
  MutationError,
  OrderDialog,
} from "@/components/orders/overview/order-dialog-frame"
import { useTRPC } from "@/trpc/client"
import {
  Badge,
  Button,
  Input,
  MoneyInput,
  SelectControl,
  Switch,
} from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import {
  ArrowLeft01Icon,
  Copy01Icon,
  Link01Icon,
  LinkSquare02Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import {
  DEFAULT_LINK_LIFETIME,
  LINK_LIFETIMES,
  errorCode,
  maskedAccountSuffix,
  newOperationId,
  paymentLinkMessage,
  whatsAppText,
} from "./business-banking-model"
import { CustomerMessageEditor } from "./customer-message-editor"

export type PaymentLinkOrder = {
  id: string
  orderNumber: string
  customerName: string | null
  balanceDueMinor: number
  currencyCode: string
}

type CreatedLink = {
  url: string
  copyText?: string
  whatsappUrl: string | null
  expiresAt: Date | string
  amountMinor: number
  currencyCode: string
  allowPartial: boolean
  replay: boolean
}

const BANK_DETAILS_HREF = "/finance/accounts?financeSheet=bank-details"

/**
 * Payment link for an Order or service job (Business banking 02): pick the
 * bank account customers transfer to, create the link, then share it by hand.
 */
export function PaymentLinkDialog({
  order,
  kind,
  timeZone,
  onClose,
}: {
  order: PaymentLinkOrder
  kind: "sale" | "service"
  timeZone?: string
  onClose: () => void
}) {
  const [created, setCreated] = useState<CreatedLink | null>(null)
  const [step, setStep] = useState<"link" | "message">("link")
  const label = kind === "service" ? "Service" : "Order"
  if (created && step === "message")
    return (
      <OrderDialog
        open
        onOpenChange={(open) => !open && onClose()}
        title="Send the link"
        description={`${label} ${order.orderNumber} · ${order.customerName || "Walk-in customer"}`}
        footer={
          <Button type="button" variant="ghost" onClick={() => setStep("link")}>
            <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" />
            Back
          </Button>
        }
      >
        <CustomerMessageEditor
          initialText={
            created.copyText ||
            whatsAppText(created.whatsappUrl) ||
            paymentLinkMessage({
              orderNumber: order.orderNumber,
              url: created.url,
            })
          }
          whatsappUrl={created.whatsappUrl}
          recipient={order.customerName}
          noPhoneNote={`${order.customerName || "This customer"} has no phone number saved on ${order.orderNumber}. Copy the message and send it your way.`}
        />
      </OrderDialog>
    )
  if (created)
    return (
      <OrderDialog
        open
        onOpenChange={(open) => !open && onClose()}
        title="Payment link"
        description={`${label} ${order.orderNumber} · ${order.customerName || "Walk-in customer"}`}
        footer={
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
        }
      >
        <ReadyLink
          link={created}
          timeZone={timeZone}
          onWhatsApp={() => setStep("message")}
        />
      </OrderDialog>
    )
  return (
    <CreateLink
      order={order}
      label={label}
      onClose={onClose}
      onCreated={(link) => {
        setCreated(link)
        setStep("link")
      }}
    />
  )
}

function CreateLink({
  order,
  label,
  onClose,
  onCreated,
}: {
  order: PaymentLinkOrder
  label: string
  onClose: () => void
  onCreated: (link: CreatedLink) => void
}) {
  const trpc = useTRPC()
  const money = (value: number) => orderMoney(value, order.currencyCode)
  // Masked accounts any staff member who can take payments may pick.
  const candidates = useQuery(
    trpc.businessBanking.linkCandidates.queryOptions(
      { period: "all", query: order.orderNumber },
      { retry: false, staleTime: 0 },
    ),
  )
  const accounts = candidates.data?.accounts ?? []
  const [chosen, setChosen] = useState("")
  const accountId = accounts.some((account) => account.id === chosen)
    ? chosen
    : accounts.length === 1
      ? (accounts[0]?.id ?? "")
      : ""
  const [allowPartial, setAllowPartial] = useState(false)
  const [amountText, setAmountText] = useState(() =>
    minorToMajorInput(order.balanceDueMinor),
  )
  const amountMinor = majorToMinor(amountText)
  const amountValid =
    amountMinor !== null &&
    amountMinor > 0 &&
    amountMinor <= order.balanceDueMinor &&
    amountMinor <= 100_000_000
  const [lifetime, setLifetime] = useState<string>(DEFAULT_LINK_LIFETIME)
  // One id per create attempt: a retry of the same settings is safe; a new
  // choice is a new request.
  const [clientLinkId, setClientLinkId] = useState(() => newOperationId("link"))
  const renew = () => setClientLinkId(newOperationId("link"))
  const create = useMutation(
    trpc.businessBanking.createPaymentLink.mutationOptions({
      onSuccess: (result) => {
        setClientLinkId(newOperationId("link"))
        onCreated(result)
      },
    }),
  )
  const noAccounts = candidates.isSuccess && accounts.length === 0
  const nothingDue = order.balanceDueMinor <= 0
  const failure = create.error
  const failureMessage = failure
    ? errorCode(failure) === "FORBIDDEN"
      ? "Only staff who can take payments can create payment links."
      : failure.message
    : null
  return (
    <OrderDialog
      open
      onOpenChange={(open) => !open && onClose()}
      busy={create.isPending}
      title="Create payment link"
      description="Customers transfer to your bank, then tap I have paid. You check your bank before anything is recorded."
    >
      <dl className="grid gap-1.5 rounded-lg border border-border px-3 py-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right">
            {order.orderNumber} · {order.customerName || "Walk-in customer"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Balance due</dt>
          <dd className="font-semibold tabular-nums">
            {money(Math.max(0, order.balanceDueMinor))}
          </dd>
        </div>
      </dl>
      {nothingDue ? (
        <FormFeedback appearance="dashboard">
          Nothing is due on {order.orderNumber}, so it doesn't need a payment
          link.
        </FormFeedback>
      ) : candidates.isPending ? (
        <output className="text-sm text-muted-foreground">
          Loading bank accounts…
        </output>
      ) : candidates.isError ? (
        <div role="alert" className="grid gap-2">
          <FormFeedback appearance="dashboard">
            {errorCode(candidates.error) === "FORBIDDEN"
              ? "Only staff who can take payments can create payment links."
              : "Bank accounts couldn't load."}
          </FormFeedback>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => void candidates.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : noAccounts ? (
        <NoBankDetails />
      ) : (
        <>
          <DialogField
            label="Customers pay into"
            hint="Accounts with bank details. Customers see the bank, account number and holder name."
          >
            <SelectControl
              aria-label="Customers pay into"
              value={accountId}
              disabled={create.isPending}
              placeholder="Choose a bank account"
              onValueChange={(value) => {
                setChosen(value)
                renew()
              }}
              options={accounts.map((account) => ({
                value: account.id,
                label: [
                  account.name,
                  account.bankName,
                  maskedAccountSuffix(account.accountSuffix),
                ]
                  .filter(Boolean)
                  .join(" · "),
              }))}
            />
          </DialogField>
          <DialogField
            label="Amount requested"
            hint={`Up to ${money(order.balanceDueMinor)}. The customer starts with this amount.`}
          >
            <MoneyInput
              aria-label="Amount requested"
              currencyCode={order.currencyCode}
              value={amountText}
              disabled={create.isPending}
              aria-invalid={!amountValid}
              onChange={(event) => {
                setAmountText(event.target.value)
                renew()
              }}
            />
            {amountValid ? null : (
              <p role="alert" className="text-xs text-destructive">
                Enter an amount above zero, up to {money(order.balanceDueMinor)}
                .
              </p>
            )}
          </DialogField>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: the switch is the label's child */}
          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">
                Customer can change the amount
              </span>
              <span className="text-xs text-muted-foreground">
                For part payments. They can't enter more than the balance.
              </span>
            </span>
            <Switch
              checked={allowPartial}
              disabled={create.isPending}
              onCheckedChange={(checked) => {
                setAllowPartial(checked === true)
                renew()
              }}
            />
          </label>
          <DialogField
            label="Link works for"
            hint="Up to 72 hours. Create a new link after that."
          >
            <SelectControl
              aria-label="Link works for"
              value={lifetime}
              disabled={create.isPending}
              onValueChange={(value) => {
                setLifetime(value)
                renew()
              }}
              options={LINK_LIFETIMES.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </DialogField>
        </>
      )}
      <MutationError message={failureMessage} />
      {failure &&
      /bank details|bank account/i.test(failure.message) &&
      errorCode(failure) !== "FORBIDDEN" ? (
        <NoBankDetails compact />
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={create.isPending}
          onClick={onClose}
        >
          {nothingDue || noAccounts ? "Close" : "Cancel"}
        </Button>
        {nothingDue || noAccounts ? null : (
          <Button
            type="button"
            disabled={
              !accountId ||
              !amountValid ||
              create.isPending ||
              !candidates.isSuccess
            }
            onClick={() => {
              if (amountMinor === null || !amountValid) return
              create.mutate({
                orderId: order.id,
                bankAccountId: accountId,
                clientLinkId,
                amountMinor,
                allowPartial,
                lifetimeMinutes: Number(lifetime),
              })
            }}
          >
            <HugeiconsIcon icon={Link01Icon} data-icon="inline-start" />
            {create.isPending ? "Creating…" : "Create link"}
          </Button>
        )}
      </div>
    </OrderDialog>
  )
}

/** No account has bank details: Owner/Admin fix it in Money accounts. */
function NoBankDetails({ compact = false }: { compact?: boolean }) {
  const trpc = useTRPC()
  // Finance access tells an Owner/Admin apart from other staff.
  const finance = useQuery(
    trpc.finance.book.queryOptions(undefined, { retry: false }),
  )
  const canFix = finance.isSuccess
  return (
    <div className="grid gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
      {compact ? null : (
        <p className="font-medium">No bank account is ready for links yet</p>
      )}
      <p className="text-muted-foreground">
        {canFix
          ? finance.data
            ? "Add bank details to a bank account in Money accounts so customers know where to transfer."
            : "Set up Finance, then add bank details so customers know where to transfer."
          : finance.isPending
            ? "Checking who can add bank details…"
            : "Ask an owner or admin to add bank details in Finance → Money accounts."}
      </p>
      {canFix ? (
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          render={<Link href={finance.data ? BANK_DETAILS_HREF : "/finance"} />}
        >
          {finance.data ? "Add bank details" : "Set up Finance"}
        </Button>
      ) : null}
    </div>
  )
}

function ReadyLink({
  link,
  timeZone,
  onWhatsApp,
}: {
  link: CreatedLink
  timeZone?: string
  onWhatsApp: () => void
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const expires = new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(link.expiresAt))
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">Active · not paid</Badge>
        <span className="text-muted-foreground">Works until {expires}</span>
      </div>
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border p-2">
        <Input
          readOnly
          aria-label="Payment link"
          value={link.url}
          className="min-w-0 flex-1 border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            void navigator.clipboard.writeText(link.url).then(
              () => setCopied("Link copied."),
              () => setCopied("Copy didn't work. Select the link instead."),
            )
          }
        >
          <HugeiconsIcon icon={Copy01Icon} data-icon="inline-start" />
          Copy link
        </Button>
      </div>
      <output
        aria-live="polite"
        className="-mt-2 text-xs text-muted-foreground"
      >
        {copied ?? ""}
      </output>
      <p className="text-sm text-muted-foreground">
        Asks for {orderMoney(link.amountMinor, link.currencyCode)}.{" "}
        {link.allowPartial
          ? "The customer can change the amount, up to the balance."
          : "The amount is fixed."}
        {link.replay
          ? " This link was already created with these settings."
          : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className={
            link.whatsappUrl
              ? "bg-emerald-600 text-white hover:bg-emerald-600/90"
              : undefined
          }
          onClick={onWhatsApp}
        >
          <HugeiconsIcon
            icon={link.whatsappUrl ? WhatsappIcon : Copy01Icon}
            data-icon="inline-start"
          />
          {link.whatsappUrl ? "WhatsApp" : "Prepare message"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
        >
          <HugeiconsIcon icon={LinkSquare02Icon} data-icon="inline-start" />
          Open page
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        When the customer taps I have paid, it shows in Payments to check.
        Nothing is recorded until someone confirms the money arrived.
      </p>
    </div>
  )
}
