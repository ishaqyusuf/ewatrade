"use client"

import { Button, toast } from "@ewatrade/ui"
import { Copy01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { DomainRow } from "./columns"

/** Copies the domain's web address and says so. */
export function copyDomainAddress(hostname: string) {
  const address = `https://${hostname}`
  void navigator.clipboard
    .writeText(address)
    .then(() => toast(`Copied ${address}`))
    .catch(() => toast("Couldn’t copy the address. Try again."))
}

export function DomainActionsMenu({
  domain,
  onManage,
}: {
  domain: DomainRow
  onManage: (domain: DomainRow) => void
}) {
  return (
    <div
      className="flex justify-end gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Button size="sm" variant="outline" onClick={() => onManage(domain)}>
        {domain.status === "OWNERSHIP_PENDING" ? "Finish setup" : "Manage"}
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Copy web address for ${domain.hostname}`}
        onClick={() => copyDomainAddress(domain.hostname)}
      >
        <HugeiconsIcon icon={Copy01Icon} className="size-4" />
      </Button>
    </div>
  )
}
