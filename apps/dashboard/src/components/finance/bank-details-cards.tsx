"use client"
import { spacedAccountNumber } from "@/components/business-banking/business-banking-model"
import { FormFeedback } from "@/components/forms/form-feedback"
import { Badge, Button, toast } from "@ewatrade/ui"
import {
  type AccountAlertsSummary,
  accountAlertsRow,
} from "@ewatrade/utils/payment-alerts-view"
import {
  Add01Icon,
  Alert02Icon,
  BankIcon,
  Copy01Icon,
  Mail01Icon,
  PencilEdit02Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export type BankDetailsAccount = {
  id: string
  name: string
  bankName: string | null
  bankAccountNumber: string | null
  bankAccountHolder: string | null
  paymentsPausedAt: Date | string | null
  paymentAlerts?: AccountAlertsSummary | null
}

export function hasBankDetails(account: BankDetailsAccount) {
  return Boolean(
    account.bankName && account.bankAccountNumber && account.bankAccountHolder,
  )
}

/**
 * "Bank details for payment links" (Business banking 02): what customers see
 * when a link pays into each account, plus a way to add another.
 */
export function BankDetailsCards({
  accounts,
  isPending,
  error,
  onEdit,
  onAdd,
}: {
  accounts: BankDetailsAccount[]
  isPending: boolean
  error: string | null
  onEdit: (accountId: string) => void
  onAdd: () => void
}) {
  const ready = accounts.filter(hasBankDetails)
  return (
    <section className="grid gap-3" aria-labelledby="bank-details-heading">
      <h2 id="bank-details-heading" className="text-base font-medium">
        Bank details for payment links
      </h2>
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      {!isPending && !error && !ready.length ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
          No account has bank details yet. Add them so payment links can show
          customers where to transfer.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {isPending ? (
          <output className="h-36 animate-pulse rounded-xl bg-muted" />
        ) : (
          ready.map((account) => (
            <BankDetailsCard
              key={account.id}
              account={account}
              onEdit={() => onEdit(account.id)}
            />
          ))
        )}
        <button
          type="button"
          onClick={onAdd}
          className="grid min-h-36 place-content-center justify-items-center gap-1 rounded-xl border border-dashed border-border p-4 text-center text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-5" aria-hidden />
          <span className="font-medium">Add bank details</span>
          <span className="text-xs text-muted-foreground">
            Another account customers can transfer to
          </span>
        </button>
      </div>
    </section>
  )
}

function BankDetailsCard({
  account,
  onEdit,
}: {
  account: BankDetailsAccount
  onEdit: () => void
}) {
  const number = account.bankAccountNumber ?? ""
  return (
    <article className="grid gap-3 rounded-xl border border-border bg-card p-4 text-sm">
      <header className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
          <HugeiconsIcon icon={BankIcon} className="size-4" aria-hidden />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate font-medium">{account.bankName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {account.name}
          </span>
        </span>
        {account.paymentsPausedAt ? (
          <Badge variant="secondary">Paused</Badge>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Edit bank details for ${account.name}`}
          onClick={onEdit}
        >
          <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
        </Button>
      </header>
      <div className="grid gap-0.5">
        <span className="text-xs text-muted-foreground">Account number</span>
        <span className="flex items-center justify-between gap-2">
          <b className="font-mono text-base tabular-nums">
            {spacedAccountNumber(number)}
          </b>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Copy account number for ${account.name}`}
            onClick={() =>
              void navigator.clipboard.writeText(number).then(
                () => toast.success("Account number copied."),
                () =>
                  toast.error("Copy didn't work. Select the number instead."),
              )
            }
          >
            <HugeiconsIcon icon={Copy01Icon} data-icon="inline-start" />
            Copy
          </Button>
        </span>
      </div>
      <div className="grid gap-0.5">
        <span className="text-xs text-muted-foreground">Account holder</span>
        <span className="font-medium break-words">
          {account.bankAccountHolder}
        </span>
      </div>
      <AlertsRow summary={account.paymentAlerts ?? null} />
    </article>
  )
}

/** Who gets payment alerts for this account, read-only. Nothing when never set up. */
function AlertsRow({ summary }: { summary: AccountAlertsSummary | null }) {
  const row = accountAlertsRow(summary)
  if (!row) return null
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">Payment alerts</span>
      <span className="flex items-start gap-1.5">
        <HugeiconsIcon
          icon={
            row.icon === "email"
              ? Mail01Icon
              : row.icon === "whatsapp"
                ? WhatsappIcon
                : Alert02Icon
          }
          className="mt-0.5 size-4 shrink-0"
          aria-hidden
        />
        <span className="min-w-0 break-words">
          <b className="font-medium">{row.label}</b>
          {row.names ? ` · ${row.names}` : ""}
        </span>
      </span>
      {row.previous ? (
        <span className="text-xs text-muted-foreground">{row.previous}</span>
      ) : null}
    </div>
  )
}
