"use client"

import { useTRPC } from "@/trpc/client"
import { Button, ControlField, Input } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { RecordRow } from "./domain-badge"

type Verification = {
  id: string
  hostname: string
  name: string | null
  type: string | null
  value: string | null
}

/**
 * Connect your own web address (modal): type it, add one record where it was
 * bought (each value has Copy), then check. Checks run only on a tap.
 */
export function ExternalDomainFlow({
  store,
  onDone,
}: {
  store: { id: string; name: string }
  onDone: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [domain, setDomain] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<"found" | "missing" | null>(null)
  const [verification, setVerification] = useState<Verification | null>(null)
  const refreshList = () =>
    queryClient.invalidateQueries(trpc.domains.list.queryFilter())
  const connect = useMutation(
    trpc.domains.connectExternal.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: (result) => {
        setVerification({
          id: result.id,
          hostname: result.hostname,
          ...result.verification,
        })
        void refreshList()
      },
    }),
  )
  const verify = useMutation(
    trpc.domains.verifyConnection.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: (result) => {
        setChecked(result.status === "OWNERSHIP_PENDING" ? "missing" : "found")
        void refreshList()
      },
    }),
  )

  if (verification) {
    return (
      <div className="grid gap-5">
        <ol className="grid gap-4">
          <Step
            number={1}
            title={`Sign in where you bought ${verification.hostname}`}
          >
            Open its DNS settings.
          </Step>
          <Step number={2} title="Add this record">
            <dl className="mt-2 grid rounded-[var(--ui-radius-control)] border border-border bg-card px-3 py-1">
              <RecordRow label="Type" value={verification.type ?? "TXT"} />
              <RecordRow label="Name" value={verification.name ?? ""} copy />
              <RecordRow label="Value" value={verification.value ?? ""} copy />
            </dl>
          </Step>
          <Step number={3} title="Come back and check">
            Your current website keeps working.
          </Step>
        </ol>
        {checked === "found" ? (
          <output className="block rounded-[var(--ui-radius-control)] bg-success p-4 text-success-foreground">
            Record found. We’re connecting {verification.hostname} now. This can
            take up to an hour.
          </output>
        ) : checked === "missing" ? (
          <output className="block rounded-[var(--ui-radius-control)] bg-warning p-4 text-warning-foreground">
            Not found yet. Records can take up to an hour to show. Check again
            later.
          </output>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onDone}>
            {checked === "found" ? "Done" : "Finish later"}
          </Button>
          {checked === "found" ? null : (
            <Button
              disabled={verify.isPending}
              onClick={() => {
                setError(null)
                verify.mutate({ connectionId: verification.id })
              }}
            >
              {verify.isPending ? "Checking…" : "Check now"}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setError(null)
        connect.mutate({ domain, storeId: store.id })
      }}
    >
      <ControlField label="Your web address">
        <Input
          autoCapitalize="none"
          autoComplete="off"
          inputMode="url"
          placeholder="yourbusiness.com"
          spellCheck={false}
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
        />
      </ControlField>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={connect.isPending || !domain.trim()}>
          {connect.isPending ? "Getting your record…" : "Continue"}
        </Button>
      </div>
    </form>
  )
}

export function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-full bg-muted text-sm font-semibold"
      >
        {number}
      </span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}
