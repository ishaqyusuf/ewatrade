"use client"

import { Button, cn } from "@ewatrade/ui"
import { WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

/**
 * Composition readiness only. Green means saved wording resolves for this
 * Order; it never means a message was sent.
 */
export type WhatsAppActionState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready" }
  | { kind: "compose" }
  | { kind: "invalid_phone" }
  | { kind: "disabled" }
  | { kind: "blocked"; reason: string }

export function whatsAppActionCopy(state: WhatsAppActionState) {
  switch (state.kind) {
    case "ready":
      return { label: "Message customer", hint: "Message ready" }
    case "compose":
      return { label: "Message customer", hint: "Compose message" }
    case "invalid_phone":
      return { label: "Message customer", hint: "Check phone number" }
    case "disabled":
      return { label: "Message customer", hint: "Message disabled" }
    case "blocked":
      return { label: "Message customer", hint: state.reason }
    case "error":
      return { label: "Message customer", hint: "Couldn’t check. Try again." }
    default:
      return { label: "Message customer", hint: "Checking…" }
  }
}

export function WhatsAppNotifyButton({
  state,
  onOpen,
  onRetry,
  size = "default",
  iconOnly = false,
  className,
}: {
  state: WhatsAppActionState
  onOpen: () => void
  onRetry?: () => void
  size?: "default" | "sm"
  iconOnly?: boolean
  className?: string
}) {
  if (state.kind === "hidden") return null
  const copy = whatsAppActionCopy(state)
  const ready = state.kind === "ready"
  const checking = state.kind === "loading"
  const name = `${copy.label}: ${copy.hint}`
  return (
    <Button
      variant="outline"
      size={iconOnly ? (size === "sm" ? "icon-sm" : "icon") : size}
      aria-label={name}
      title={name}
      disabled={checking}
      data-state={state.kind}
      className={cn(
        ready &&
          "border-emerald-600/40 text-emerald-700 hover:text-emerald-800 dark:border-emerald-400/40 dark:text-emerald-300",
        className,
      )}
      onClick={() => {
        if (state.kind === "error") onRetry?.()
        else onOpen()
      }}
    >
      <HugeiconsIcon
        icon={WhatsappIcon}
        className={cn(
          "size-4",
          ready
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground",
        )}
      />
      {iconOnly ? null : <span>{copy.label}</span>}
    </Button>
  )
}
