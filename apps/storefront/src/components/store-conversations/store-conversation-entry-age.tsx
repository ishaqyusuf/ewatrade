"use client"

import { useEffect, useState } from "react"
import { StoreConversationWeb } from "./store-conversation-web"

type AgeBand = "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"
type Access = "account" | "guest" | "new_guest"

const choices: Array<{ label: string; value: AgeBand | "UNDER_13" }> = [
  { label: "Under 13", value: "UNDER_13" },
  { label: "13–15", value: "AGE_13_TO_15" },
  { label: "16–17", value: "AGE_16_TO_17" },
  { label: "18 or older", value: "ADULT" },
]

export function StoreConversationEntryAge({
  publicToken,
  storeName,
}: {
  publicToken: string
  storeName: string
}) {
  const [access, setAccess] = useState<Access | null>(null)
  const [readyBand, setReadyBand] = useState<AgeBand | null>(null)
  const [ready, setReady] = useState(false)
  const [selected, setSelected] = useState<AgeBand | "UNDER_13" | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function statusFor(kind: "account" | "guest") {
      const response = await fetch(
        `/api/store-conversations/age?access=${kind}`,
        { cache: "no-store", signal: controller.signal },
      )
      if (response.status === (kind === "account" ? 403 : 401)) return null
      if (!response.ok) throw new Error("Age status is unavailable. Try again.")
      return (await response.json()) as {
        ageBand: AgeBand | "UNDECLARED"
        eligible: boolean
      }
    }
    void (async () => {
      const account = await statusFor("account")
      if (controller.signal.aborted) return
      if (account) {
        setAccess("account")
        if (account.eligible && account.ageBand !== "UNDECLARED")
          setReadyBand(account.ageBand)
        setReady(account.eligible)
        return
      }
      const guest = await statusFor("guest")
      if (controller.signal.aborted) return
      setAccess(guest ? "guest" : "new_guest")
      if (guest?.eligible && guest.ageBand !== "UNDECLARED")
        setReadyBand(guest.ageBand)
      setReady(guest?.eligible === true)
    })().catch((cause: unknown) => {
      if (controller.signal.aborted) return
      setError(
        cause instanceof Error ? cause.message : "Age status is unavailable.",
      )
    })
    return () => controller.abort()
  }, [])

  const continueToChat = async () => {
    if (!access || !selected || selected === "UNDER_13" || busy) return
    setBusy(true)
    setError(null)
    try {
      if (access !== "new_guest") {
        const response = await fetch("/api/store-conversations/age", {
          body: JSON.stringify({ access, ageBand: selected }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
        if (!response.ok) throw new Error("Age range could not be saved.")
      }
      setReadyBand(selected)
      setReady(true)
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

  if (ready)
    return (
      <StoreConversationWeb
        entryAgeBand={readyBand ?? undefined}
        initialResetGuest={access === "new_guest"}
        publicToken={publicToken}
        storeName={storeName}
      />
    )

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4 text-foreground">
      <section className="grid w-full max-w-md gap-4 rounded-2xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Before contacting {storeName}</h1>
        <p className="text-sm text-muted-foreground">
          EwaTrade Store chat is for people aged 13 or older. Choose your age
          range before opening a conversation.
        </p>
        {access ? (
          <div className="grid gap-2">
            {choices.map((choice) => (
              <label
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3"
                key={choice.value}
              >
                <input
                  checked={selected === choice.value}
                  name="store-entry-age"
                  onChange={() => setSelected(choice.value)}
                  type="radio"
                />
                <span>{choice.label}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Checking age status…</p>
        )}
        {selected === "UNDER_13" ? (
          <output className="text-sm text-muted-foreground">
            Store chat is not available to people under 13.
          </output>
        ) : access ? (
          <button
            className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
            disabled={!selected || busy}
            onClick={() => void continueToChat()}
            type="button"
          >
            {busy ? "Saving…" : "Continue to chat"}
          </button>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  )
}
