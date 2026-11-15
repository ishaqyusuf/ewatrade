"use client"

import { Button, cn, toast } from "@ewatrade/ui"
import { Copy01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DOMAIN_STATUS,
  DOMAIN_STATUS_TONE,
  type DomainRow,
} from "./domain-status"

export function DomainStatusBadge({
  domain,
}: { domain: Pick<DomainRow, "status"> }) {
  const status = DOMAIN_STATUS[domain.status]
  return (
    <span
      className={cn(
        "inline-flex h-7 w-fit shrink-0 items-center rounded-full px-2.5 text-sm font-medium whitespace-nowrap",
        DOMAIN_STATUS_TONE[status.tone],
      )}
    >
      {status.label}
    </span>
  )
}

/** Copies text and says so. */
export function copyText(value: string, done: string) {
  void navigator.clipboard
    .writeText(value)
    .then(() => toast(done))
    .catch(() => toast("Couldn’t copy. Try again."))
}

/** Copies the domain's web address and says so. */
export function copyDomainAddress(hostname: string) {
  copyText(`https://${hostname}`, `Copied https://${hostname}`)
}

/** One DNS value the owner must copy: label, value, and a Copy button. */
export function RecordRow({
  label,
  value,
  copy = false,
}: {
  label: string
  value: string
  copy?: boolean
}) {
  return (
    <div className="grid min-h-11 grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-sm text-foreground">{value}</dd>
      {copy ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => copyText(value, `${label} copied.`)}
        >
          <HugeiconsIcon icon={Copy01Icon} className="size-4" />
        </Button>
      ) : (
        <span />
      )}
    </div>
  )
}
