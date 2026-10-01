"use client"

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
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    onAllowedChange(false)
    setStatus(null)
    setSelected(null)
    setError(null)
    setSafetyAcknowledged(false)
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
        onAllowedChange(next.eligible && next.ageBand === "ADULT")
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
      onAllowedChange(selected === "ADULT")
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

  if (status?.eligible) {
    if (status.ageBand === "ADULT" || safetyAcknowledged) return null
    return (
      <section
        aria-label="Online safety reminder"
        className="mx-auto mb-3 grid max-w-3xl gap-3 rounded-2xl border border-border bg-card p-4 text-sm"
      >
        <h2 className="font-semibold">Stay safe in Store chat</h2>
        <p className="text-muted-foreground">
          You are talking with another person online. Do not share your home
          address, phone number, school, passwords, payment details, or other
          private information. You can block or report a conversation that makes
          you uncomfortable, and ask a trusted adult for help.
        </p>
        <button
          className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground"
          onClick={() => {
            setSafetyAcknowledged(true)
            onAllowedChange(true)
          }}
          type="button"
        >
          I understand — continue
        </button>
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
        EwaTrade Store chat is for people aged 13 or older. Choose your own age
        range before sending a message or attachment.
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
              Store chat is not available to people under 13.
            </output>
          ) : (
            <button
              className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
              disabled={!selected || busy}
              onClick={() => void declare()}
              type="button"
            >
              {busy ? "Saving…" : "Continue to chat"}
            </button>
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
