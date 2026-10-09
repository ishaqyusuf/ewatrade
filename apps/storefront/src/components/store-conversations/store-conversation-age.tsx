"use client"

import {
  STORE_CONVERSATION_CHAT_SCOPE_MESSAGE,
  canUseStoreConversationFreeFormChat,
} from "@ewatrade/service-commerce"
import { Button } from "@ewatrade/ui"
import { useEffect, useState } from "react"

type AgeBand = "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"
type AgeStatus = { ageBand: AgeBand | "UNDECLARED"; eligible: boolean }

const choices: Array<{ label: string; value: AgeBand | "UNDER_13" }> = [
  { label: "Under 13", value: "UNDER_13" },
  { label: "13–15", value: "AGE_13_TO_15" },
  { label: "16–17", value: "AGE_16_TO_17" },
  { label: "18 or older", value: "ADULT" },
]

export function StoreConversationAge({
  access,
  onAllowedChange,
}: {
  access: "account" | "guest"
  onAllowedChange: (allowed: boolean) => void
}) {
  const [status, setStatus] = useState<AgeStatus | null>(null)
  const [selected, setSelected] = useState<AgeBand | "UNDER_13" | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    onAllowedChange(false)
    setStatus(null)
    setSelected(null)
    setError(null)
    void fetch(`/api/store-conversations/age?access=${access}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Age status is unavailable.")
        return (await response.json()) as AgeStatus
      })
      .then((next) => {
        if (controller.signal.aborted) return
        setStatus(next)
        onAllowedChange(
          next.eligible &&
            canUseStoreConversationFreeFormChat({
              ageBand: next.ageBand,
              principal: access,
            }),
        )
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(
          cause instanceof Error ? cause.message : "Age status is unavailable.",
        )
      })
    return () => controller.abort()
  }, [access, onAllowedChange])

  const declare = async () => {
    if (!selected || selected === "UNDER_13" || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/store-conversations/age", {
        body: JSON.stringify({ access, ageBand: selected }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
      const body = (await response.json()) as { message?: string }
      if (!response.ok)
        throw new Error(body.message ?? "Age range could not be saved.")
      setStatus({ ageBand: selected, eligible: true })
      onAllowedChange(
        canUseStoreConversationFreeFormChat({
          ageBand: selected,
          principal: access,
        }),
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Age range could not be saved.",
      )
    } finally {
      setBusy(false)
    }
  }

  if (access === "guest" || status?.eligible) {
    if (
      status?.eligible &&
      canUseStoreConversationFreeFormChat({
        ageBand: status.ageBand,
        principal: access,
      })
    )
      return null
    return (
      <section
        aria-label="Free-form chat eligibility"
        className="mx-auto mb-3 grid max-w-3xl gap-3 rounded-2xl border border-border bg-card p-4 text-sm"
      >
        <h2 className="font-semibold">
          Free-form chat requires an adult account
        </h2>
        <p className="text-muted-foreground">
          {STORE_CONVERSATION_CHAT_SCOPE_MESSAGE}
        </p>
        <p className="text-muted-foreground">
          You can still view this conversation and use its reporting and support
          controls. Your age range is a declaration, not identity verification.
          Contact support if a saved range needs correction.
        </p>
      </section>
    )
  }
  return (
    <section
      aria-label="Age required before messaging"
      className="mx-auto mb-3 grid max-w-3xl gap-3 rounded-2xl border border-border bg-card p-4 text-sm"
    >
      <h2 className="font-semibold">Choose your age range</h2>
      <p className="text-muted-foreground">
        Accounts and Store history are available from age 13. Free-form chat
        requires a signed-in account declaring age 18 or older. Choose your own
        age range; this is not identity verification.
      </p>
      {status ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {choices.map((choice) => (
              <label
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3"
                key={choice.value}
              >
                <input
                  checked={selected === choice.value}
                  name="store-conversation-age"
                  onChange={() => setSelected(choice.value)}
                  type="radio"
                />
                <span>{choice.label}</span>
              </label>
            ))}
          </div>
          {selected === "UNDER_13" ? (
            <output className="text-muted-foreground">
              Accounts and Store history are not available to people under 13.
            </output>
          ) : (
            <Button
              className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
              disabled={!selected || busy}
              onClick={() => void declare()}
              type="button"
            >
              {busy ? "Saving…" : "Save age range"}
            </Button>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">Checking age status…</p>
      )}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
