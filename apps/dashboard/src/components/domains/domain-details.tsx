"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { SettingsNotice } from "@/components/settings/settings-page"
import { copyDomainAddress } from "@/components/tables/domains/actions-menu"
import {
  type DomainRow,
  DomainStatusBadge,
} from "@/components/tables/domains/columns"
import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"
import { Button, toast } from "@ewatrade/ui"
import { Copy01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import {
  domainBoughtFrom,
  domainNeedsRecord,
  domainRenews,
} from "./domain-status"

/** One domain: what it is, and for one waiting on its record, the steps. */
export function DomainDetails({ domain }: { domain: DomainRow | null }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = useDomainParams()
  // What the last "Check again" found: the record, or not yet.
  const [checked, setChecked] = useState<"found" | "missing" | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const check = useMutation(
    trpc.domains.verifyConnection.mutationOptions({
      onSuccess: async (result) => {
        setChecked(result.status === "OWNERSHIP_PENDING" ? "missing" : "found")
        await queryClient.invalidateQueries(trpc.domains.list.queryFilter())
      },
      onError: (failure) => setProblem(failure.message),
    }),
  )

  if (!domain) {
    return (
      <p className="text-sm text-muted-foreground">
        We couldn’t find this domain. Close this and try again.
      </p>
    )
  }

  const steps = domainNeedsRecord(domain) && checked !== "found"
  const canCheck =
    domain.status === "OWNERSHIP_PENDING" || domain.status === "FAILED"

  return (
    <div className="grid gap-5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[10px] border border-border bg-card p-4 text-sm">
        <Fact label="Status">
          <DomainStatusBadge domain={domain} />
        </Fact>
        <Fact label="Store">{domain.store.name}</Fact>
        {steps ? null : (
          <>
            <Fact label="Bought from">{domainBoughtFrom(domain)}</Fact>
            <Fact label="Renews">{domainRenews(domain)}</Fact>
          </>
        )}
      </dl>
      {steps ? (
        <ol className="grid gap-4">
          <Step
            number={1}
            title={`Sign in where you bought ${domain.hostname}`}
          >
            Open its DNS settings.
          </Step>
          <Step number={2} title="Add this record">
            <dl className="mt-2 grid gap-2 rounded-[10px] border border-border bg-card p-3 text-sm">
              <RecordRow
                label="Type"
                value={domain.verification.type ?? "TXT"}
              />
              <RecordRow
                label="Name"
                value={domain.verification.name ?? ""}
                copy
              />
              <RecordRow
                label="Value"
                value={domain.verification.value ?? ""}
                copy
              />
            </dl>
          </Step>
          <Step number={3} title="Come back and check">
            Your current website keeps working until this is done.
          </Step>
        </ol>
      ) : null}
      {checked === "found" ? (
        <SettingsNotice>
          Record found. We’re connecting {domain.hostname} to your online store.
          This can take up to an hour; you can close this.
        </SettingsNotice>
      ) : checked === "missing" ? (
        <SettingsNotice tone="warning">
          We couldn’t find the record yet. Records can take up to an hour to
          show up. Check again later.
        </SettingsNotice>
      ) : null}
      {problem ? (
        <FormFeedback appearance="dashboard">{problem}</FormFeedback>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button
          variant="ghost"
          onClick={() => copyDomainAddress(domain.hostname)}
        >
          <HugeiconsIcon icon={Copy01Icon} data-icon="inline-start" />
          Copy web address
        </Button>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void setParams(null)}>
            Close
          </Button>
          {canCheck && checked !== "found" ? (
            <Button
              disabled={check.isPending}
              onClick={() => {
                setProblem(null)
                check.mutate({ connectionId: domain.id })
              }}
            >
              {check.isPending ? "Checking…" : "Check again"}
            </Button>
          ) : null}
        </span>
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: ReactNode
}) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
      <span
        aria-hidden="true"
        className="grid size-6 place-items-center rounded-full bg-muted text-xs font-semibold"
      >
        {number}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}

function RecordRow({
  label,
  value,
  copy = false,
}: {
  label: string
  value: string
  copy?: boolean
}) {
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-foreground">{value}</dd>
      {copy ? (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() =>
            void navigator.clipboard
              .writeText(value)
              .then(() => toast(`${label} copied.`))
              .catch(() => toast("Couldn’t copy. Try again."))
          }
        >
          <HugeiconsIcon icon={Copy01Icon} className="size-4" />
        </Button>
      ) : (
        <span />
      )}
    </div>
  )
}
