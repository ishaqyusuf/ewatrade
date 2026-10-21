"use client"
import { useZodForm } from "@/hooks/use-zod-form"
import { getStaffRoleLabel, getStaffStatusLabel } from "@/lib/staff-management"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type GeneralStaffRemovalAction,
  staffRemovalAction,
  staffRemovalReviewInput,
} from "@ewatrade/assistant/general/staff-removal"
import { Button, ControlField, FieldGroup, Textarea } from "@ewatrade/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

type Review = RouterOutputs["retailOps"]["staffRemovalReview"]
type Fields = Pick<GeneralStaffRemovalAction, "reason">
type Props = {
  initial: GeneralStaffRemovalAction
  disabled: boolean
  onSave: (value: GeneralStaffRemovalAction) => void
  onCancel: () => void
}
const fieldsSchema = staffRemovalReviewInput.omit({ membershipId: true })

/** Assistant draft: remove someone who never joined. Save reviews again. */
export function GeneralStaffRemovalEditor(props: Props) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const initialInput = staffRemovalReviewInput.parse({
    membershipId: props.initial.membershipId,
    reason: props.initial.reason,
  })
  const query = useQuery(
    trpc.retailOps.staffRemovalReview.queryOptions(initialInput, {
      retry: false,
      staleTime: 0,
    }),
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const save = async (fields: Fields) => {
    setPending(true)
    setError(null)
    try {
      const input = staffRemovalReviewInput.parse({
        membershipId: props.initial.membershipId,
        ...fields,
      })
      const review = await client.fetchQuery(
        trpc.retailOps.staffRemovalReview.queryOptions(input, {
          staleTime: 0,
          retry: false,
          networkMode: "always",
        }),
      )
      if (active.current)
        props.onSave(
          staffRemovalAction.parse({
            action: "staff_removal",
            ...input,
            expectedRevision: review.expectedRevision,
          }),
        )
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn’t review this removal. Try again.",
        )
    } finally {
      if (active.current) setPending(false)
    }
  }
  return (
    <GeneralStaffRemovalEditorView
      {...props}
      disabled={props.disabled || pending}
      review={
        query.isSuccess && !query.isFetching && !query.isPaused
          ? query.data
          : null
      }
      loading={query.isPending || query.isFetching || query.isPaused}
      unavailable={query.isError}
      unavailableMessage={query.error?.message}
      error={error}
      onReviewSave={save}
      onRetry={() => void query.refetch()}
    />
  )
}

export function GeneralStaffRemovalEditorView({
  initial,
  disabled,
  onCancel,
  review,
  loading = false,
  unavailable = false,
  unavailableMessage,
  error,
  onReviewSave,
  onRetry,
}: Omit<Props, "onSave"> & {
  review: Review | null
  loading?: boolean
  unavailable?: boolean
  unavailableMessage?: string
  error?: string | null
  onReviewSave: (fields: Fields) => void | Promise<void>
  onRetry: () => void
}) {
  const form = useZodForm<Fields>(fieldsSchema, {
    defaultValues: { reason: initial.reason },
  })
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={form.handleSubmit(onReviewSave)}
    >
      {loading ? (
        <output aria-live="polite">Loading…</output>
      ) : unavailable || !review ? (
        <div role="alert" className="grid gap-2">
          <p>{unavailableMessage ?? "This person can’t be removed."}</p>
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 rounded-lg border p-4 text-sm">
          <p className="font-medium">
            {review.name} · {review.email}
          </p>
          <p>
            {getStaffRoleLabel(review.role)} ·{" "}
            {getStaffStatusLabel(review.status)} · never joined.
          </p>
          <p>
            {review.liveInviteLinks
              ? "Their invite link stops working."
              : "They have no live invite link."}
          </p>
          <p className="text-muted-foreground">{review.impact}</p>
        </div>
      )}
      <FieldGroup>
        <ControlField
          label="Reason"
          error={form.formState.errors.reason?.message}
        >
          <Textarea
            {...form.register("reason")}
            maxLength={500}
            disabled={disabled}
          />
        </ControlField>
      </FieldGroup>
      <p className="text-sm text-muted-foreground">
        The selected person stays fixed. Save reviews this again and updates the
        draft; you still confirm it separately.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={disabled || loading || unavailable || !review}
        >
          Save and review
        </Button>
      </div>
    </form>
  )
}
