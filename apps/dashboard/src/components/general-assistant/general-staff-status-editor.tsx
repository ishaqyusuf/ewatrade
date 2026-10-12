"use client"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type GeneralStaffStatusAction,
  staffStatusAction,
  staffStatusReviewInput,
} from "@ewatrade/assistant/general/staff-status"
import {
  Button,
  ControlField,
  FieldGroup,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Controller } from "react-hook-form"

type Review = RouterOutputs["retailOps"]["staffStatusReview"]
type Fields = Pick<GeneralStaffStatusAction, "status" | "reason">
type Props = {
  initial: GeneralStaffStatusAction
  disabled: boolean
  onSave: (value: GeneralStaffStatusAction) => void
  onCancel: () => void
}
const fieldsSchema = staffStatusReviewInput.omit({ membershipId: true })

export function GeneralStaffStatusEditor(props: Props) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const initialInput = staffStatusReviewInput.parse({
    membershipId: props.initial.membershipId,
    status: props.initial.status,
    reason: props.initial.reason,
  })
  const query = useQuery(
    trpc.retailOps.staffStatusReview.queryOptions(initialInput, {
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
      const input = staffStatusReviewInput.parse({
        membershipId: props.initial.membershipId,
        ...fields,
      })
      const review = await client.fetchQuery(
        trpc.retailOps.staffStatusReview.queryOptions(input, {
          staleTime: 0,
          retry: false,
          networkMode: "always",
        }),
      )
      if (active.current)
        props.onSave(
          staffStatusAction.parse({
            action: "staff_status",
            ...input,
            expectedRevision: review.expectedRevision,
          }),
        )
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The current status review is unavailable.",
        )
    } finally {
      if (active.current) setPending(false)
    }
  }
  return (
    <GeneralStaffStatusEditorView
      {...props}
      disabled={props.disabled || pending}
      review={
        query.isSuccess && !query.isFetching && !query.isPaused
          ? query.data
          : null
      }
      loading={query.isPending || query.isFetching || query.isPaused}
      unavailable={query.isError}
      error={error}
      onReviewSave={save}
      onRetry={() => void query.refetch()}
    />
  )
}

export function GeneralStaffStatusEditorView({
  initial,
  disabled,
  onCancel,
  review,
  loading = false,
  unavailable = false,
  error,
  onReviewSave,
  onRetry,
}: Omit<Props, "onSave"> & {
  review: Review | null
  loading?: boolean
  unavailable?: boolean
  error?: string | null
  onReviewSave: (fields: Fields) => void | Promise<void>
  onRetry: () => void
}) {
  const form = useZodForm<Fields>(fieldsSchema, {
    defaultValues: { status: initial.status, reason: initial.reason },
  })
  const selectedStatus = form.watch("status")
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={form.handleSubmit(onReviewSave)}
    >
      {loading ? (
        <output aria-live="polite">Loading current staff review…</output>
      ) : unavailable || !review ? (
        <div role="alert" className="grid gap-2">
          <p>
            This membership cannot be reviewed with your current business or
            access.
          </p>
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
            Current status: {review.previousStatus.toLowerCase()} ·{" "}
            {review.role.toLowerCase()}.
          </p>
          <p>
            {review.nextStatus.toLowerCase() === selectedStatus
              ? review.impact
              : "Save to load a fresh review of this status choice. The change applies to the whole business; current Store grants are preserved."}
          </p>
          <p>
            Current access: {review.accessMode.toLowerCase()}; catalog editing{" "}
            {review.catalogEditor ? "allowed" : "not allowed"}.
          </p>
          {review.assignments.map((row) => (
            <p key={row.storeId}>
              {row.storeName} · {row.role.toLowerCase()}
              {row.storeId === review.defaultStoreId ? " · starting Store" : ""}
            </p>
          ))}
        </div>
      )}
      <FieldGroup>
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <ControlField
              label="Business membership status"
              error={form.formState.errors.status?.message}
            >
              <SelectControl
                value={field.value}
                options={[
                  { value: "suspended", label: "Suspend business access" },
                  { value: "active", label: "Reactivate current access" },
                ]}
                disabled={disabled}
                onValueChange={field.onChange}
              />
            </ControlField>
          )}
        />
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
        The selected person stays fixed. Ask for another draft to choose someone
        else. Save loads a fresh review and updates this draft; separate app
        confirmation is required. Store grants, roles and historical ownership
        are preserved.
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
