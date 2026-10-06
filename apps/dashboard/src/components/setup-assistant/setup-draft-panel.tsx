"use client"

import { useTRPC } from "@/trpc/client"
import {
  type SetupEntityPayload,
  deriveSetupEntityState,
} from "@ewatrade/assistant/setup/contracts"
import { Button } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { SetupDraftCard } from "./setup-draft-card"
import {
  ENTITY_GROUPS,
  type SetupDraftEntity,
  entityQuestions,
  isBalancePending,
} from "./setup-format"
import {
  type SetupPrerequisiteState,
  SetupPrerequisites,
} from "./setup-prerequisites"

export function SetupDraftPanel({
  conversationId,
  entities,
  currencyCode,
  prerequisites,
}: {
  /** The Store's setup this list belongs to; writes are refused after a Store switch. */
  conversationId: string
  entities: SetupDraftEntity[]
  currencyCode: string
  prerequisites?: SetupPrerequisiteState
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const stateKey = trpc.setupAssistant.state.queryKey()
  // Server readback stays authoritative; the optimistic patch only hides latency.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: stateKey })
  }
  const patch = (
    keys: string[],
    change: (entity: SetupDraftEntity) => SetupDraftEntity,
  ) => {
    void queryClient.cancelQueries({ queryKey: stateKey })
    queryClient.setQueryData(stateKey, (current) => {
      if (!current?.enabled || !current.draft) return current
      return {
        ...current,
        draft: {
          ...current.draft,
          entities: current.draft.entities.map((entity) =>
            keys.includes(entity.key)
              ? (change(entity as SetupDraftEntity) as unknown as typeof entity)
              : entity,
          ),
        },
      } as typeof current
    })
  }
  const update = useMutation(
    trpc.setupAssistant.updateEntity.mutationOptions({
      onMutate: ({ key, payload }) =>
        patch([key], (entity) => {
          const derived = deriveSetupEntityState(
            payload,
            entityQuestions(entity).filter((question) => !question.required),
          )
          return {
            ...entity,
            payload,
            state: derived.state,
            openQuestions: derived.questions,
          }
        }),
      onSettled: refresh,
    }),
  )
  const setState = useMutation(
    trpc.setupAssistant.setEntityState.mutationOptions({
      onMutate: ({ keys, state }) =>
        patch(keys, (entity) => ({ ...entity, state })),
      onSettled: refresh,
    }),
  )
  const router = useRouter()
  const commit = useMutation(trpc.setupAssistant.commit.mutationOptions())
  const [progress, setProgress] = useState<{
    done: number
    failed: number
    total: number
  } | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const committing = progress !== null
  const pending = update.isPending || setState.isPending || committing
  const active = entities.filter((entity) => entity.state !== "SKIPPED")
  const ready = active.filter((entity) => entity.state === "PROPOSED")
  const confirmed = active.filter((entity) => entity.state === "CONFIRMED")
  const added = active.filter((entity) => entity.state === "COMMITTED")
  const needsInput = active.filter((entity) => entity.state === "NEEDS_INPUT")
  const toAdd = confirmed.length + active.filter(isBalancePending).length
  const error = update.error ?? setState.error

  // Bounded server batches keep each request short; the loop resumes safely
  // because every record commit is idempotent.
  async function addToBusiness() {
    setCommitError(null)
    let done = 0
    let failed = 0
    const total = toAdd
    setProgress({ done, failed, total })
    try {
      for (let round = 0; round < 50; round += 1) {
        const outcome = await commit.mutateAsync({ conversationId })
        done += outcome.results.filter((r) => r.state === "COMMITTED").length
        failed += outcome.results.filter((r) => r.state === "FAILED").length
        setProgress({ done, failed, total })
        void queryClient.invalidateQueries({ queryKey: stateKey })
        if (outcome.interrupted) {
          setCommitError(
            "Adding paused because of a connection problem. Your list is saved; press Add again to continue.",
          )
          break
        }
        if (outcome.remaining === 0 || outcome.results.length === 0) break
      }
    } catch (cause) {
      // Server wording is replaced by generic public errors, so refusals are
      // explained here by code; anything else is retry-safe because every
      // record commit is idempotent.
      const code = (cause as { data?: { code?: string } } | null)?.data?.code
      setCommitError(
        code === "CONFLICT"
          ? "Your setup changed in another tab or your active store changed. Reload this page and check the store before adding."
          : code === "FORBIDDEN"
            ? "Only the business owner or an admin can add records. Your access may have changed."
            : code === "PRECONDITION_FAILED"
              ? "Choose a store before adding records."
              : "Adding stopped before everything was added. Your list is saved; press Add again to continue.",
      )
    } finally {
      setProgress(null)
      // Everything else in the workspace (catalog, stock, customers, overview)
      // depends on these new records.
      void queryClient.invalidateQueries()
      router.refresh()
    }
  }

  if (entities.length === 0)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <p className="text-sm font-medium text-foreground">
          Your setup list is empty
        </p>
        <p className="max-w-64 text-xs text-muted-foreground">
          As you describe your business, the products, services and customers I
          find will appear here for you to check.
        </p>
      </div>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {[
            added.length > 0 ? `${added.length} added` : null,
            active.length > added.length
              ? `${confirmed.length} of ${active.length - added.length} confirmed`
              : null,
            needsInput.length > 0 ? `${needsInput.length} need info` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {ready.length > 1 ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={() =>
              setState.mutate({
                conversationId,
                keys: ready.map((entity) => entity.key),
                state: "CONFIRMED",
              })
            }
          >
            Confirm all ready ({ready.length})
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="px-4 pt-3 text-xs text-destructive">
          {error.message}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SetupPrerequisites
          prerequisites={prerequisites}
          onTermsAccepted={() => {
            // Records that failed only for missing Terms go back into the queue.
            const blocked = entities
              .filter(
                (entity) =>
                  entity.state === "FAILED" &&
                  entity.errorCode === "CATALOG_TERMS_REQUIRED",
              )
              .map((entity) => entity.key)
            if (blocked.length > 0)
              setState.mutate({
                conversationId,
                keys: blocked,
                state: "CONFIRMED",
              })
            else refresh()
          }}
          onFinanceReady={() => {
            refresh()
            // Customers already added are only waiting for their balance.
            if (active.some(isBalancePending)) void addToBusiness()
          }}
        />
        {ENTITY_GROUPS.map((group) => {
          const rows = entities.filter((entity) => entity.kind === group.kind)
          if (rows.length === 0) return null
          return (
            <section key={group.kind} aria-label={group.title}>
              <h3 className="bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.title} ({rows.length})
              </h3>
              <ul className="divide-y divide-border">
                {rows.map((entity) => (
                  <SetupDraftCard
                    key={entity.key}
                    entity={entity}
                    currencyCode={currencyCode}
                    pending={pending}
                    onSave={(payload: SetupEntityPayload) =>
                      update.mutate({
                        conversationId,
                        key: entity.key,
                        payload,
                      })
                    }
                    onState={(state) =>
                      setState.mutate({
                        conversationId,
                        keys: [entity.key],
                        state,
                      })
                    }
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      <div className="border-t border-border px-4 py-3">
        {commitError ? (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {commitError}
          </p>
        ) : null}
        <Button
          type="button"
          className="w-full"
          disabled={toAdd === 0 || pending}
          onClick={() => void addToBusiness()}
        >
          {committing
            ? `Adding… ${progress.done + progress.failed} of ${progress.total}`
            : toAdd > 0
              ? `Add ${toAdd} to my business`
              : active.length > 0 && active.length === added.length
                ? "Everything is added"
                : "Confirm records to add them"}
        </Button>
        <p
          aria-live="polite"
          className="mt-2 text-center text-[11px] text-muted-foreground"
        >
          {committing
            ? "Keep this page open while your records are added."
            : added.length > 0
              ? `${added.length} added to your business. Skipped and unconfirmed records stay here.`
              : "Only confirmed records are added. You can change them later."}
        </p>
      </div>
    </div>
  )
}
