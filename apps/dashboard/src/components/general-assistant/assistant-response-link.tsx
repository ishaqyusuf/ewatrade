"use client"

import { AuthLink, AuthShell } from "@/components/auth/auth-shell"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import {
  assistantResponseConversationPath,
  assistantResponsePath,
} from "@ewatrade/assistant/channels/conversation-links"
import { Button } from "@ewatrade/ui"
import { useMutation } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { switchLinkWorkspace } from "./switch-link-workspace"

/** Opens a saved assistant reply from a WhatsApp or Telegram link. */
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
      // Re-resolves under the selected workspace before opening any content.
      await switchLinkWorkspace(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t switch.")
      setSwitching(false)
    }
  }

  const failed = lookupError || Boolean(error)
  const title =
    result?.status === "scope_mismatch"
      ? "This reply is for another business"
      : result?.status === "unavailable"
        ? "This link isn’t for you"
        : lookupError
          ? "Couldn’t open this reply"
          : "Opening your saved reply…"
  const detail =
    result?.status === "scope_mismatch"
      ? `${result.businessName} · ${result.storeName}`
      : result?.status === "unavailable"
        ? "Sign in with the account that got this reply."
        : lookupError
          ? "Check your connection and try again."
          : undefined

  return (
    <AuthShell
      title={title}
      description={detail}
      footer={<AuthLink href="/assistant">Open assistant</AuthLink>}
    >
      {!result && !failed ? (
        <div className="h-11 animate-pulse rounded-[var(--ui-radius-control)] bg-muted" />
      ) : (
        <div className="grid gap-4">
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
          {result?.status === "scope_mismatch" ? (
            <Button
              className="w-full"
              disabled={switching}
              onClick={() => void switchWorkspace()}
            >
              {switching ? "Switching…" : `Switch to ${result.businessName}`}
            </Button>
          ) : result?.status === "unavailable" ? (
            <Button
              className="w-full"
              render={
                <Link
                  href={`/login?next=${encodeURIComponent(assistantResponsePath(messageId))}`}
                />
              }
            >
              Use another account
            </Button>
          ) : lookupError ? (
            <Button
              className="w-full"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </Button>
          ) : null}
        </div>
      )}
    </AuthShell>
  )
}
