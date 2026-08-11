"use client"

import { useActionState } from "react"

import { type CustomerActionState, submitCustomerAction } from "./actions"

const initialState: CustomerActionState = { kind: "idle", message: null }

export function ActionClient({
  capabilityToken,
  confirmationRequired,
  consequence,
  label,
}: {
  capabilityToken: string
  confirmationRequired: boolean
  consequence: string
  label: string
}) {
  const [state, action, pending] = useActionState(
    submitCustomerAction,
    initialState,
  )
  return (
    <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="grid gap-2">
        <h2 className="text-xl font-semibold">{label}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{consequence}</p>
      </div>
      {state.kind === "completed" ? (
        <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <p className="text-sm">{state.message}</p>
          {state.href ? (
            <a
              className="flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
              href={state.href}
            >
              Continue
            </a>
          ) : null}
        </div>
      ) : (
        <form action={action} className="grid gap-4">
          <input name="capabilityToken" type="hidden" value={capabilityToken} />
          <input
            name="confirmed"
            type="hidden"
            value={confirmationRequired ? "yes" : "no"}
          />
          {state.kind === "error" ? (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {state.message}
            </p>
          ) : null}
          <button
            className="min-h-11 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending
              ? "Checking…"
              : confirmationRequired
                ? `Confirm ${label}`
                : label}
          </button>
        </form>
      )}
    </section>
  )
}
