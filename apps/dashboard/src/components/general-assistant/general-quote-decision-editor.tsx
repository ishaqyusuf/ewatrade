"use client"

import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC, useTRPCClient } from "@/trpc/client"
import {
  quoteDecisionAction,
  type QuoteDecisionAction,
} from "@ewatrade/assistant/general/quote-decision"
import { Button, ControlField, Textarea } from "@ewatrade/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import {
  parseQuoteDecisionEditorDraft,
  quoteDecisionReviewMatches,
  quoteDecisionReviewKey,
  quoteDecisionEditorReadState,
} from "./quote-decision-editor-state"

type Props = {
  initial: QuoteDecisionAction
  disabled: boolean
  onSave: (value: QuoteDecisionAction) => void
  onCancel: () => void
}

export function GeneralQuoteDecisionEditor(props: Props) {
  const trpc = useTRPC()
  const api = useTRPCClient()
  const client = useQueryClient()
  const context = useQuery(
    trpc.tenant.current.queryOptions(undefined, {
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
    }),
  )
  const scope =
    quoteDecisionEditorReadState([context]) === "ready" &&
    context.data?.activeStore
      ? {
          tenantId: context.data.tenant.id,
          storeId: context.data.activeStore.id,
          actorUserId: context.data.actorUserId,
        }
      : null
  const options = (draft: QuoteDecisionAction) => ({
    queryKey: quoteDecisionReviewKey(scope, draft),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api.serviceCommerce.assistantQuoteDecisionReview.query(draft, { signal }),
    retry: false as const,
    staleTime: 0,
  })
  const review = useQuery({
    ...options(props.initial),
    enabled: Boolean(scope),
    refetchOnMount: "always",
  })
  const state = quoteDecisionEditorReadState([context, review])
  const reviewed =
    state === "ready" &&
    scope &&
    review.data &&
    quoteDecisionReviewMatches(review.data, scope, props.initial)
      ? review.data
      : null
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(false)
  const latest = useRef<string | null>(null)
  latest.current =
    scope && reviewed && !props.disabled
      ? JSON.stringify(quoteDecisionReviewKey(scope, props.initial))
      : null
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const save = async (raw: QuoteDecisionAction) => {
    if (!scope || !reviewed || props.disabled || pending) return
    const expectedScope = JSON.stringify(
      quoteDecisionReviewKey(scope, props.initial),
    )
    const draft = parseQuoteDecisionEditorDraft(props.initial, raw)
    setPending(true)
    setError(null)
    try {
      const fresh = await client.fetchQuery({
        ...options(draft),
        networkMode: "always",
      })
      if (!quoteDecisionReviewMatches(fresh, scope, draft))
        throw new Error(
          "The business, Store, actor or original quotation review changed.",
        )
      if (active.current && latest.current === expectedScope)
        props.onSave(draft)
    } catch (cause) {
      if (active.current && latest.current === expectedScope)
        setError(
          cause instanceof Error
            ? cause.message
            : "Quotation review unavailable.",
        )
    } finally {
      if (active.current) setPending(false)
    }
  }
  return (
    <GeneralQuoteDecisionEditorView
      {...props}
      disabled={props.disabled || pending}
      lines={reviewed?.lines ?? null}
      loading={state === "loading" || state === "paused"}
      error={error}
      onReviewSave={save}
      onRetry={() => {
        void context.refetch()
        if (scope) void review.refetch()
      }}
    />
  )
}

export function GeneralQuoteDecisionEditorView({
  initial,
  disabled,
  lines,
  loading = false,
  error,
  onReviewSave,
  onCancel,
  onRetry,
}: Omit<Props, "onSave"> & {
  lines: string[] | null
  loading?: boolean
  error?: string | null
  onReviewSave: (value: QuoteDecisionAction) => void | Promise<void>
  onRetry: () => void
}) {
  const form = useZodForm<QuoteDecisionAction>(quoteDecisionAction, {
    defaultValues: initial,
  })
  const ready = !loading && lines !== null
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={form.handleSubmit(async (raw) => {
        if (!ready || disabled) return
        try {
          await onReviewSave(parseQuoteDecisionEditorDraft(initial, raw))
        } catch (cause) {
          form.setError("root", {
            message:
              cause instanceof Error ? cause.message : "Review unavailable.",
          })
        }
      })}
    >
      {ready ? (
        <>
          <p className="font-medium">
            {initial.action === "commerce_quote_approve"
              ? "Approve and commercially release the original version"
              : "Reject the original version; keep it private"}
          </p>
          <ul className="grid gap-2 rounded-lg border p-4 text-sm">
            {lines?.map((line, index) => (
              <li key={index} className="whitespace-pre-wrap break-words">
                {line}
              </li>
            ))}
          </ul>
          <ControlField
            label="Reason"
            error={form.formState.errors.reason?.message?.toString()}
          >
            <Textarea
              {...form.register("reason")}
              maxLength={500}
              disabled={disabled}
              required
            />
          </ControlField>
          <p className="text-sm text-muted-foreground">
            The original approval and quotation version stay fixed. Save loads a
            fresh review and updates this draft; separate app confirmation
            applies the decision.
          </p>
          {error || form.formState.errors.root?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {error ?? form.formState.errors.root?.message}
            </p>
          ) : null}
        </>
      ) : (
        <div className="grid gap-2" role={loading ? "status" : "alert"}>
          <p>
            {loading
              ? "Loading current quotation decision review…"
              : "This original quotation decision is unavailable with current business, Store or approver access."}
          </p>
          {!loading ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={disabled || !ready}>
          Save and review
        </Button>
      </div>
    </form>
  )
}
