"use client"

import type {
  ServiceCommerceCustomerActionExecutionResult,
  ServiceCommerceCustomerActionProjection,
  StoreConversationQuoteActionMessageProjection,
} from "@ewatrade/service-commerce"
import { resolveServiceCommerceCustomerActionHandoffPath } from "@ewatrade/service-commerce"
import {
  type StoreConversationActionReturnState,
  advanceStoreConversationActionReturn,
  formatMinorMoney,
} from "@ewatrade/utils"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  WEB_QUOTE_MESSAGE_LAYOUT,
  projectWebQuoteActionButton,
  projectWebQuoteMessageFeedback,
  requestWebQuoteAction,
} from "./store-conversation-quote-message-state"

function actionAmount(action: ServiceCommerceCustomerActionProjection) {
  if (action.amountMinor === undefined || !action.currencyCode) return null
  return formatMinorMoney(action.amountMinor, action.currencyCode)
}

async function responseJson<T>(response: Response) {
  const body = (await response.json()) as T & { message?: string }
  if (!response.ok) {
    throw new Error(body.message ?? "This quotation could not be updated.")
  }
  return body
}

export function StoreConversationQuoteMessage({
  accountAccess,
  actionMessage,
  conversationId,
  messageId,
  onContactStore,
  onRefresh,
  publicToken,
}: {
  accountAccess: boolean
  actionMessage: StoreConversationQuoteActionMessageProjection
  conversationId: string
  messageId: string
  onContactStore: () => void
  onRefresh: () => Promise<void>
  publicToken: string
}) {
  const [projection, setProjection] = useState(actionMessage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingToken, setConfirmingToken] = useState<string | null>(null)
  const [executingToken, setExecutingToken] = useState<string | null>(null)
  const operationRef = useRef<{ id: string; token: string } | null>(null)
  const returnStateRef = useRef<StoreConversationActionReturnState>("idle")
  const feedback = projectWebQuoteMessageFeedback({ error, loading })

  const preview = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const current =
          await responseJson<StoreConversationQuoteActionMessageProjection>(
            await fetch("/api/store-conversations/actions/preview", {
              body: JSON.stringify({
                access: accountAccess ? "account" : "guest",
                conversationId,
                messageId,
                publicToken,
              }),
              headers: { "content-type": "application/json" },
              method: "POST",
              signal,
            }),
          )
        setProjection(current)
      } catch (previewError) {
        if (signal?.aborted) return
        setError(
          previewError instanceof Error
            ? previewError.message
            : "This quotation could not be updated.",
        )
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [accountAccess, conversationId, messageId, publicToken],
  )

  useEffect(() => {
    setProjection(actionMessage)
    setConfirmingToken(null)
    setLoading(false)
    setError(null)
  }, [actionMessage])

  useEffect(() => {
    const recover = () => {
      if (document.visibilityState !== "visible") return
      const transition = advanceStoreConversationActionReturn(
        returnStateRef.current,
        "active",
      )
      returnStateRef.current = transition.state
      if (transition.refresh) {
        void preview().then(onRefresh)
      }
    }
    const markAway = () => {
      returnStateRef.current = advanceStoreConversationActionReturn(
        returnStateRef.current,
        "inactive",
      ).state
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") recover()
      else markAway()
    }
    window.addEventListener("pagehide", markAway)
    window.addEventListener("pageshow", recover)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.removeEventListener("pagehide", markAway)
      window.removeEventListener("pageshow", recover)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [onRefresh, preview])

  const execute = useCallback(
    async (action: ServiceCommerceCustomerActionProjection) => {
      const requested = requestWebQuoteAction(confirmingToken, action)
      if (!requested.execute) {
        setConfirmingToken(requested.confirmingToken)
        return
      }
      setExecutingToken(action.capabilityToken)
      setError(null)
      const operation =
        operationRef.current?.token === action.capabilityToken
          ? operationRef.current
          : { id: crypto.randomUUID(), token: action.capabilityToken }
      operationRef.current = operation
      try {
        const result =
          await responseJson<ServiceCommerceCustomerActionExecutionResult>(
            await fetch("/api/store-conversations/actions/execute", {
              body: JSON.stringify({
                access: accountAccess ? "account" : "guest",
                capabilityToken: action.capabilityToken,
                clientOperationId: operation.id,
                confirmed: action.confirmation === "required",
                conversationId,
                messageId,
                publicToken,
              }),
              headers: { "content-type": "application/json" },
              method: "POST",
            }),
          )
        const handoffPath = resolveServiceCommerceCustomerActionHandoffPath({
          capabilityToken: action.capabilityToken,
          result,
        })
        if (handoffPath) {
          operationRef.current = null
          returnStateRef.current = advanceStoreConversationActionReturn(
            returnStateRef.current,
            "handoff_opened",
          ).state
          window.location.assign(handoffPath)
          return
        }
        operationRef.current = null
        setConfirmingToken(null)
        if (action.action === "talk_to_staff") onContactStore()
        await preview()
        await onRefresh()
      } catch (executeError) {
        setError(
          executeError instanceof Error
            ? executeError.message
            : "This action could not be completed.",
        )
      } finally {
        setExecutingToken(null)
      }
    },
    [
      accountAccess,
      confirmingToken,
      conversationId,
      messageId,
      onContactStore,
      onRefresh,
      preview,
      publicToken,
    ],
  )

  return (
    <article
      className={`mr-auto grid w-full gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm ${WEB_QUOTE_MESSAGE_LAYOUT.compactWidthClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Quotation</p>
          <p className="text-xs text-muted-foreground">
            Version {projection.quoteVersion}
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium capitalize text-muted-foreground">
          {projection.lifecycle.replaceAll("_", " ")}
        </span>
      </div>

      <div className="grid gap-2">
        {projection.options.map((option) => (
          <div
            className={`flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2 ${option.selected ? "bg-primary/10 ring-1 ring-primary/25" : "bg-muted/60"}`}
            key={option.id}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{option.label}</span>
              {option.selected ? (
                <span className="text-xs text-primary">Selected</span>
              ) : null}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {formatMinorMoney(option.totalMinor, projection.currencyCode)}
            </span>
          </div>
        ))}
      </div>

      {loading ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {feedback.status}
        </p>
      ) : null}
      {feedback.retryVisible ? (
        <div aria-live="polite" className="grid gap-2">
          <p className="text-xs text-destructive">{feedback.status}</p>
          <button
            className="min-h-11 justify-self-start rounded-full border border-border px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void preview()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}
      {feedback.actionsVisible && projection.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {projection.actions.map((action) => {
            const confirming = confirmingToken === action.capabilityToken
            const executing = executingToken === action.capabilityToken
            const amount = actionAmount(action)
            const button = projectWebQuoteActionButton(action, {
              confirming,
              pending: executing,
            })
            return (
              <div
                className="flex flex-wrap gap-2"
                key={action.capabilityToken}
              >
                {confirming ? (
                  <div className="grid gap-1 rounded-xl bg-muted/60 px-3 py-2.5">
                    <p className="font-medium">
                      Confirm {action.label.toLowerCase()}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {action.consequence}
                      {amount ? ` Amount: ${amount}.` : ""}
                    </p>
                  </div>
                ) : null}
                <button
                  aria-label={button.accessibilityLabel}
                  className={`${WEB_QUOTE_MESSAGE_LAYOUT.actionMinHeightClass} rounded-full bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60`}
                  disabled={Boolean(executingToken)}
                  onClick={() => void execute(action)}
                  type="button"
                >
                  {button.label}
                </button>
                {confirming ? (
                  <button
                    className="min-h-11 rounded-full border border-border px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={Boolean(executingToken)}
                    onClick={() => setConfirmingToken(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
      {feedback.actionsVisible && projection.recovery ? (
        <button
          className="min-h-11 justify-self-start rounded-full border border-border px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={
            projection.recovery === "talk_to_store"
              ? onContactStore
              : () => void preview()
          }
          type="button"
        >
          {projection.recovery === "talk_to_store"
            ? "Message store"
            : "Refresh quotation"}
        </button>
      ) : null}
    </article>
  )
}
