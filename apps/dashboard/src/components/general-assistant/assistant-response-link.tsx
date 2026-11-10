"use client"

import {
  clearDashboardDataCache,
  getDataCacheGeneration,
  useTRPC,
} from "@/trpc/client"
import {
  assistantResponseConversationPath,
  assistantResponsePath,
} from "@ewatrade/assistant/channels/conversation-links"
import { Button } from "@ewatrade/ui"
import { useMutation } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export function AssistantResponseLink({ messageId }: { messageId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const lookup = useMutation(
    trpc.assistant.responseLink.mutationOptions({ gcTime: 0 }),
  )
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const [result, setResult] = useState<typeof lookup.data>(undefined)
  const [lookupError, setLookupError] = useState(false)
  const [retry, setRetry] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retries start a fresh navigation authorization lookup.
  useEffect(() => {
    let current = true
    const generation = getDataCacheGeneration()
    setResult(undefined)
    setLookupError(false)
    void lookup
      .mutateAsync({ messageId })
      .then((value) => {
        if (!current || generation !== getDataCacheGeneration()) return
        if (value.status === "ready")
          router.replace(assistantResponseConversationPath(value))
        else setResult(value)
      })
      .catch(() => {
        if (current && generation === getDataCacheGeneration())
          setLookupError(true)
      })
    return () => {
      current = false
    }
  }, [lookup.mutateAsync, messageId, retry, router])

  async function switchWorkspace() {
    if (!result || result.status !== "scope_mismatch" || switching) return
    setSwitching(true)
    setError(null)
    try {
      for (const [path, body] of [
        [
          "/api/tenants/active",
          { tenantId: result.tenantId, path: location.pathname },
        ],
        ["/api/stores/active", { storeId: result.storeId }],
      ] as const) {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!response.ok)
          throw Error(
            "This workspace could not be selected. Check your access and try again.",
          )
      }
      clearDashboardDataCache()
      // Re-resolve under the explicitly selected workspace before opening any content.
      window.location.reload()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not select this workspace.",
      )
      setSwitching(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-5 px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">
        {result?.status === "scope_mismatch"
          ? "Switch to view this response"
          : result?.status === "unavailable"
            ? "This response isn't available for this account"
            : lookupError || error
              ? "Couldn’t open this response"
              : "Opening your saved response…"}
      </h1>
      {result?.status === "scope_mismatch" ? (
        <>
          <p className="text-muted-foreground">
            {result.businessName} · {result.storeName}
          </p>
          <p className="text-sm text-muted-foreground">
            Your WhatsApp workspace will stay as it is.
          </p>
          <Button disabled={switching} onClick={() => void switchWorkspace()}>
            {switching ? "Switching…" : "Switch and view response"}
          </Button>
        </>
      ) : result?.status === "unavailable" ? (
        <>
          <p className="text-muted-foreground">
            Use the account connected to WhatsApp. The response may have been
            removed, or your access may have changed.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(assistantResponsePath(messageId))}`}
            className="underline"
          >
            Switch account
          </Link>
        </>
      ) : null}
      {lookupError || error ? (
        <p role="alert">
          {error ?? "Couldn't check this response. Sign in again or try again."}
        </p>
      ) : null}
      {lookupError ? (
        <Button onClick={() => setRetry((value) => value + 1)}>
          Try again
        </Button>
      ) : null}
      <Link href="/assistant" className="text-sm underline">
        Open assistant
      </Link>
    </main>
  )
}
