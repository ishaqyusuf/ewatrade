"use client"

import { useTRPC } from "@/trpc/client"
import { Button, cn } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import {
  type SetupDraftEntity,
  entityEmoji,
  entityErrorCopy,
  entityPayload,
  entitySummary,
} from "./setup-format"

/** Server wording is generic by design; refusals are explained here by code. */
function addErrorCopy(cause: unknown) {
  const code = (cause as { data?: { code?: string } } | null)?.data?.code
  if (code === "CONFLICT")
    return "Your setup changed in another tab or your active store changed. Reload this page and try again."
  if (code === "FORBIDDEN")
    return "Only the business owner or an admin can add records."
  return "This wasn't added yet. Your list is saved; try again."
}

/**
 * The records an assistant message staged, read live from the setup list, so
 * the owner can add one to the business right from the chat. The button is the
 * explicit confirmation; nothing is added from a typed reply.
 */
export function SetupChatItems({ keys }: { keys: string[] }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const router = useRouter()
  const state = useQuery(trpc.setupAssistant.state.queryOptions())
  const setState = useMutation(
    trpc.setupAssistant.setEntityState.mutationOptions(),
  )
  const commit = useMutation(trpc.setupAssistant.commit.mutationOptions())
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<{ key: string; text: string } | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const data = state.data?.enabled ? state.data : null
  const conversationId = data?.conversation?.id
  const entities = ((data?.draft?.entities ?? []) as SetupDraftEntity[]).filter(
    (entity) => keys.includes(entity.key) && entity.state !== "SKIPPED",
  )
  const visible = Boolean(data && conversationId && entities.length > 0)

  // The card appears after the reply finishes streaming, which the chat's
  // stick-to-bottom does not follow; keep it in view if the owner was at the end.
  useEffect(() => {
    const list = listRef.current
    if (!visible || !list) return
    const log = list.closest('[role="log"]')
    if (!log) return
    const gap = log.scrollHeight - log.scrollTop - log.clientHeight
    if (gap <= list.offsetHeight + 160)
      list.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [visible])

  if (!data || !conversationId || entities.length === 0) return null

  async function add(entity: SetupDraftEntity, id: string) {
    setError(null)
    setAdding(entity.key)
    try {
      if (entity.state !== "CONFIRMED")
        await setState.mutateAsync({
          conversationId: id,
          keys: [entity.key],
          state: "CONFIRMED",
        })
      for (let round = 0; round < 10; round += 1) {
        const outcome = await commit.mutateAsync({
          conversationId: id,
          keys: [entity.key],
        })
        if (outcome.interrupted) {
          setError({
            key: entity.key,
            text: "Adding paused because of a connection problem. Try again.",
          })
          break
        }
        if (outcome.remaining === 0 || outcome.results.length === 0) break
      }
    } catch (cause) {
      setError({ key: entity.key, text: addErrorCopy(cause) })
    } finally {
      setAdding(null)
      // The summary message, the setup list and the workspace all change.
      void queryClient.invalidateQueries()
      router.refresh()
    }
  }

  return (
    <ul
      ref={listRef}
      className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border"
    >
      {entities.map((entity) => {
        const payload = entityPayload(entity)
        const emoji = entityEmoji(payload)
        const canAdd =
          entity.state === "PROPOSED" ||
          entity.state === "CONFIRMED" ||
          entity.state === "FAILED"
        const note =
          entity.state === "FAILED" ||
          (entity.state === "COMMITTED" && entity.errorCode)
            ? entityErrorCopy(entity.errorCode, payload)
            : null
        return (
          <li key={entity.key} className="flex flex-col gap-2 px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm"
              >
                {emoji ?? payload.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {payload.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {entitySummary(payload, data.currencyCode)}
                </p>
                {note ? (
                  <p
                    role={entity.state === "FAILED" ? "alert" : undefined}
                    className={cn(
                      "mt-1 text-xs",
                      entity.state === "FAILED"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {note}
                  </p>
                ) : null}
                {error?.key === entity.key ? (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {error.text}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="pl-9.5">
              {entity.state === "COMMITTED" ? (
                <p className="text-xs font-medium text-foreground">
                  Added to your business
                </p>
              ) : entity.state === "NEEDS_INPUT" ? (
                <p className="text-xs text-muted-foreground">
                  Needs a few details; answer in the chat.
                </p>
              ) : canAdd ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={adding !== null}
                  aria-label={
                    entity.state === "FAILED"
                      ? `Try adding ${payload.name} again`
                      : `Add ${payload.name} to my business`
                  }
                  onClick={() => void add(entity, conversationId)}
                >
                  {adding === entity.key
                    ? "Adding…"
                    : entity.state === "FAILED"
                      ? "Try again"
                      : "Add to my business"}
                </Button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
