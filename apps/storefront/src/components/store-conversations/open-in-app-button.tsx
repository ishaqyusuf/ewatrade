"use client"

import { useRef, useState } from "react"

type TransferResponse = {
  code?: string
  message?: string
  universalUrl?: string
}

export function OpenInAppButton({
  conversationId,
  publicToken,
}: {
  conversationId: string
  publicToken: string
}) {
  const transferOperation = useRef<{
    clientOperationId: string
    transferToken: string
  } | null>(null)
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string }
  >({ kind: "idle" })

  async function openApp() {
    setState({ kind: "loading" })
    try {
      transferOperation.current ??= {
        clientOperationId: crypto.randomUUID(),
        transferToken:
          `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", ""),
      }
      const response = await fetch("/api/store-conversations/mobile-transfer", {
        body: JSON.stringify({
          clientOperationId: transferOperation.current.clientOperationId,
          conversationId,
          publicToken,
          transferToken: transferOperation.current.transferToken,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const result = (await response.json()) as TransferResponse
      if (!response.ok || !result.universalUrl) {
        throw new Error(result.message ?? "The app could not be opened.")
      }
      transferOperation.current = null
      // The shared HTTPS Store Entry is the app handoff and the no-app
      // fallback. A verified installation opens Customer; otherwise the
      // customer remains on the complete web conversation.
      window.location.assign(result.universalUrl)
      window.setTimeout(() => setState({ kind: "idle" }), 1_500)
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The app could not be opened.",
      })
    }
  }

  return (
    <div className="grid justify-items-end gap-1">
      <button
        className="min-h-11 rounded-full border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={state.kind === "loading"}
        onClick={() => void openApp()}
        type="button"
      >
        {state.kind === "loading" ? "Opening…" : "Open in EwaTrade app"}
      </button>
      {state.kind === "error" ? (
        <p
          className="max-w-xs text-right text-xs text-destructive"
          role="alert"
        >
          {state.message} You can keep using this web conversation.
        </p>
      ) : null}
    </div>
  )
}
