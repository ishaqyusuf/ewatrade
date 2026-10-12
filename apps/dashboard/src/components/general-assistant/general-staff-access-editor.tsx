"use client"

import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type GeneralStaffAccessAction,
  staffAccessAction,
  staffAccessReviewInput,
} from "@ewatrade/assistant/general/staff-access"
import { Button, ControlField, FieldGroup, SelectControl } from "@ewatrade/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Controller, useFieldArray } from "react-hook-form"
import type { z } from "zod"
import { StaffAccessWorkloadView } from "./staff-access-workload-view"

type Review = RouterOutputs["retailOps"]["staffStoreAccessReview"]
type Fields = z.infer<typeof staffAccessReviewInput>
type Props = {
  initial: GeneralStaffAccessAction
  disabled: boolean
  onSave: (value: GeneralStaffAccessAction) => void
  onCancel: () => void
}

function fieldsFrom(initial: GeneralStaffAccessAction): Fields {
  return {
    membershipId: initial.membershipId,
    assignments: initial.assignments,
    defaultStoreId: initial.defaultStoreId,
    catalogEditor: initial.catalogEditor,
    confirmLegacyCutover: initial.confirmLegacyCutover,
  }
}

export function GeneralStaffAccessEditor(props: Props) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const query = useQuery(
    trpc.retailOps.staffStoreAccessReview.queryOptions(
      fieldsFrom(props.initial),
      {
        retry: false,
        staleTime: 0,
      },
    ),
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
      const input = staffAccessReviewInput.parse({
        ...fields,
        membershipId: props.initial.membershipId,
      })
      const review = await client.fetchQuery(
        trpc.retailOps.staffStoreAccessReview.queryOptions(input, {
          retry: false,
          staleTime: 0,
          networkMode: "always",
        }),
      )
      if (active.current)
        props.onSave(
          staffAccessAction.parse({
            action: "staff_access",
            ...input,
            expectedRevision: review.expectedRevision,
          }),
        )
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The current access review is unavailable.",
        )
    } finally {
      if (active.current) setPending(false)
    }
  }
  return (
    <GeneralStaffAccessEditorView
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

export function GeneralStaffAccessEditorView({
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
  review: Pick<
    Review,
    "availableStores" | "before" | "name" | "email" | "outstandingServiceWork"
  > | null
  loading?: boolean
  unavailable?: boolean
  error?: string | null
  onReviewSave: (fields: Fields) => void | Promise<void>
  onRetry: () => void
}) {
  const form = useZodForm<Fields>(staffAccessReviewInput, {
    defaultValues: fieldsFrom(initial),
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "assignments",
  })
  const rows = form.watch("assignments")
  const startingStore = form.watch("defaultStoreId")
  const legacyConfirmed = form.watch("confirmLegacyCutover")
  const hasManager = rows.some((row) => row.role === "MANAGER")
  const blocked = disabled || loading || unavailable || !review
  const stores = review?.availableStores ?? []
  const legacy = review?.before.accessMode === "LEGACY"
  const label = (id: string) =>
    stores.find((store) => store.id === id)?.name ?? "Unavailable Store"
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={form.handleSubmit(onReviewSave)}
    >
      {loading ? (
        <output aria-live="polite">Loading current Store access…</output>
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
            Current business role: {review.before.businessRole.toLowerCase()} ·{" "}
            {review.before.membershipStatus.toLowerCase()}.
          </p>
          {legacy ? (
            <p>
              Existing access applies across the business. Review the Stores to
              keep before replacing it with selected Store roles.
            </p>
          ) : (
            <div className="grid gap-1">
              {review.before.assignments.length ? (
                review.before.assignments.map((row) => (
                  <p key={row.storeId}>
                    {row.storeName ?? "Unavailable Store"} ·{" "}
                    {row.role.toLowerCase()}
                    {row.storeId === review.before.defaultStoreId
                      ? " · starting Store"
                      : ""}
                  </p>
                ))
              ) : (
                <p>No current Store assignments.</p>
              )}
            </div>
          )}
          <p>
            Current catalog editing:{" "}
            {review.before.catalogEditor ? "allowed" : "not allowed"}.
          </p>
          <StaffAccessWorkloadView
            workload={review.outstandingServiceWork}
            membershipId={initial.membershipId}
            disabled={blocked}
          />
        </div>
      )}
      {review ? (
        <FieldGroup>
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-2 items-end gap-2">
              <Controller
                control={form.control}
                name={`assignments.${index}.storeId`}
                render={({ field: control }) => (
                  <ControlField
                    label={`Store ${index + 1}`}
                    error={
                      form.formState.errors.assignments?.[index]?.storeId
                        ?.message
                    }
                  >
                    <SelectControl
                      value={control.value}
                      placeholder="Choose Store"
                      disabled={blocked}
                      options={stores
                        .filter(
                          (store) =>
                            store.id === control.value ||
                            !rows.some((row) => row.storeId === store.id),
                        )
                        .map((store) => ({
                          value: store.id,
                          label: store.name,
                        }))}
                      onValueChange={(value) => {
                        if (!startingStore || startingStore === control.value)
                          form.setValue("defaultStoreId", value, {
                            shouldValidate: true,
                          })
                        control.onChange(value)
                      }}
                    />
                  </ControlField>
                )}
              />
              <Controller
                control={form.control}
                name={`assignments.${index}.role`}
                render={({ field: control }) => (
                  <ControlField
                    label={`Role for Store ${index + 1}`}
                    error={
                      form.formState.errors.assignments?.[index]?.role?.message
                    }
                  >
                    <SelectControl
                      value={control.value}
                      disabled={blocked}
                      options={[
                        { value: "CASHIER", label: "Cashier" },
                        { value: "OPERATOR", label: "Operator" },
                        { value: "MANAGER", label: "Manager" },
                      ]}
                      onValueChange={(value) => {
                        control.onChange(value)
                        if (
                          value !== "MANAGER" &&
                          !rows.some(
                            (row, i) => i !== index && row.role === "MANAGER",
                          )
                        )
                          form.setValue("catalogEditor", false)
                      }}
                    />
                  </ControlField>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                className="col-span-2 justify-self-end"
                disabled={blocked}
                aria-label={`Remove Store ${index + 1}`}
                onClick={() => {
                  const remaining = rows.filter((_, i) => i !== index)
                  if (startingStore === rows[index]?.storeId)
                    form.setValue(
                      "defaultStoreId",
                      remaining[0]?.storeId || null,
                    )
                  if (!remaining.some((row) => row.role === "MANAGER"))
                    form.setValue("catalogEditor", false)
                  remove(index)
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={
              blocked ||
              rows.length >= Math.min(100, stores.length) ||
              rows.some((row) => !row.storeId)
            }
            onClick={() => append({ storeId: "", role: "CASHIER" })}
          >
            Add Store assignment
          </Button>
          {rows.length ? (
            <Controller
              control={form.control}
              name="defaultStoreId"
              render={({ field }) => (
                <ControlField
                  label="Starting Store"
                  error={form.formState.errors.defaultStoreId?.message}
                >
                  <SelectControl
                    value={field.value ?? ""}
                    placeholder="Choose starting Store"
                    disabled={blocked}
                    options={rows
                      .filter((row) => row.storeId)
                      .map((row) => ({
                        value: row.storeId,
                        label: label(row.storeId),
                      }))}
                    onValueChange={field.onChange}
                  />
                </ControlField>
              )}
            />
          ) : (
            <p className="text-sm">
              No assignments removes Store access. Business membership status
              remains unchanged.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              {...form.register("catalogEditor")}
              disabled={blocked || !hasManager}
            />
            Allow catalog editing across the business. A Manager Store
            assignment is required.
          </label>
          {legacy ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                {...form.register("confirmLegacyCutover")}
                disabled={blocked}
              />
              I reviewed the existing business-wide access. Replace it with
              these Store roles and remove access to unselected Stores.
            </label>
          ) : null}
        </FieldGroup>
      ) : null}
      <p className="text-sm text-muted-foreground">
        The selected person stays fixed. Save loads a fresh review and updates
        this draft; separate app confirmation applies the access change. Service
        work requires separate reassignment.
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
          disabled={blocked || (legacy && !legacyConfirmed)}
        >
          Save and review
        </Button>
      </div>
    </form>
  )
}
