"use client"

import { useTRPC } from "@/trpc/client"
import { Button, Input } from "@ewatrade/ui"
import { useMutation } from "@tanstack/react-query"
import { useId, useState } from "react"

export type SetupPrerequisiteState = {
  termsRequired: boolean
  financeBookMissing: boolean
}

/** Finance setup is only shown for records that need the business books. */
export function SetupPrerequisites({
  prerequisites,
  onFinanceReady,
}: {
  /** Optional so an older API without the field never breaks the list. */
  prerequisites?: SetupPrerequisiteState
  onFinanceReady: () => void
}) {
  if (!prerequisites?.financeBookMissing) return null
  return (
    <div className="grid gap-3 border-b border-border px-4 py-3">
      <FinancePrompt onReady={onFinanceReady} />
    </div>
  )
}

function PromptCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3"
    >
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {children}
    </section>
  )
}

function FinancePrompt({ onReady }: { onReady: () => void }) {
  const trpc = useTRPC()
  const id = useId()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const setup = useMutation(
    trpc.finance.setup.mutationOptions({ onSuccess: onReady }),
  )
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today

  return (
    <PromptCard title="Set up Finance for your balances">
      <p className="text-xs text-muted-foreground">
        Your cash and bank accounts, and what customers owe you or what you hold
        for them, are kept in your business books. Choose when your books start;
        anything waiting is added right after. Older sales and payments are not
        imported.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label
            htmlFor={`${id}-start`}
            className="text-xs text-muted-foreground"
          >
            Books start on
          </label>
          <Input
            id={`${id}-start`}
            type="date"
            max={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-44"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!valid || setup.isPending}
          onClick={() =>
            setup.mutate({ startsAt: new Date(`${date}T00:00:00.000Z`) })
          }
        >
          {setup.isPending ? "Setting up…" : "Set up Finance"}
        </Button>
      </div>
      {setup.error ? (
        <p role="alert" className="text-xs text-destructive">
          {setup.error.message}
        </p>
      ) : null}
    </PromptCard>
  )
}
