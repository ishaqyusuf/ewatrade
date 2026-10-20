"use client"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  FieldGroup,
  Input,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Controller, useFieldArray } from "react-hook-form"
import { z } from "zod"

type Action = Extract<GeneralAction, { action: "staff_invitation" }>
type Invite = Extract<Action["intent"], { kind: "INVITE" }>["invite"]
type Props = {
  initial: Action
  disabled: boolean
  onSave: (value: GeneralAction) => void
  onCancel: () => void
}
const roleOptions = [
  { value: "CASHIER", label: "Cashier" },
  { value: "OPERATOR", label: "Sales rep" },
  { value: "MANAGER", label: "Manager" },
]
const inviteFields = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(1).max(120).optional(),
  assignments: z
    .array(
      z.object({
        storeId: z.string().min(1),
        role: z.enum(["CASHIER", "OPERATOR", "MANAGER"]),
      }),
    )
    .min(1)
    .max(100),
  defaultStoreId: z.string().min(1),
  catalogEditor: z.boolean(),
})

export function GeneralStaffInvitationEditor(props: Props) {
  if (props.initial.intent.kind !== "INVITE")
    return (
      <GeneralInvitationReasonEditor
        {...props}
        initial={
          props.initial as Action & {
            intent: Exclude<Action["intent"], { kind: "INVITE" }>
          }
        }
      />
    )
  return (
    <GeneralInvitationStoreLoader
      {...props}
      initialInvite={props.initial.intent.invite}
    />
  )
}
function GeneralInvitationStoreLoader(
  props: Props & { initialInvite: Invite },
) {
  const trpc = useTRPC()
  const query = useQuery(trpc.tenant.stores.queryOptions())
  return (
    <GeneralInvitationInviteEditor
      {...props}
      initialInvite={props.initialInvite}
      stores={query.data ?? []}
      loading={query.isPending || query.isFetching}
      unavailable={query.isError}
    />
  )
}

/** Same fields used in the dashboard; store identities always come from an authorized read. */
export function GeneralInvitationInviteEditor({
  initial,
  initialInvite,
  disabled,
  onSave,
  onCancel,
  stores,
  loading = false,
  unavailable = false,
}: Props & {
  initialInvite: Invite
  stores: ReadonlyArray<{ id: string; name: string }>
  loading?: boolean
  unavailable?: boolean
}) {
  const form = useZodForm<Invite>(inviteFields, {
    defaultValues: initialInvite,
  })
  const rows = useFieldArray({ control: form.control, name: "assignments" })
  const assignments = form.watch("assignments")
  const [error, setError] = useState<string | null>(null)
  const storeOptions = stores.map((store) => ({
    value: store.id,
    label: store.name,
  }))
  const unresolved = assignments.some(
    (row) => !stores.some((store) => store.id === row.storeId),
  )
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={form.handleSubmit(
        (value) => {
          const parsed = generalActionSchema.safeParse({
            ...initial,
            intent: {
              kind: "INVITE",
              invite: { ...value, name: value.name || undefined },
            },
          })
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Check the invitation.")
            return
          }
          setError(null)
          onSave(parsed.data)
        },
        () =>
          setError(
            "Check the recipient, Store roles, starting Store and catalog editing.",
          ),
      )}
    >
      <p className="text-sm text-muted-foreground">
        Invite this person to onboard. Confirmation will save an invitation and
        request an email; it does not activate staff or create credentials.
      </p>
      <FieldGroup>
        <ControlField
          label="Recipient email"
          error={form.formState.errors.email?.message}
        >
          <Input type="email" {...form.register("email")} disabled={disabled} />
        </ControlField>
        <ControlField
          label="Name (optional)"
          error={form.formState.errors.name?.message}
        >
          <Input
            {...form.register("name", {
              setValueAs: (value) => value?.trim() || undefined,
            })}
            disabled={disabled}
          />
        </ControlField>
        {loading ? (
          <output>Loading accessible Stores…</output>
        ) : unavailable ? (
          <p role="alert">
            Accessible Stores are unavailable. Refresh this draft before saving.
          </p>
        ) : null}
        {rows.fields.map((row, index) => (
          <div className="grid gap-3 rounded-lg border p-3" key={row.id}>
            <Controller
              control={form.control}
              name={`assignments.${index}.storeId`}
              render={({ field }) => (
                <ControlField label={`Store ${index + 1}`}>
                  <SelectControl
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={disabled || loading || unavailable}
                    options={storeOptions.filter(
                      (store) =>
                        store.value === field.value ||
                        !assignments.some(
                          (item) => item.storeId === store.value,
                        ),
                    )}
                  />
                </ControlField>
              )}
            />
            <Controller
              control={form.control}
              name={`assignments.${index}.role`}
              render={({ field }) => (
                <ControlField label={`Role at Store ${index + 1}`}>
                  <SelectControl
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={disabled}
                    options={roleOptions}
                  />
                </ControlField>
              )}
            />
            {rows.fields.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => rows.remove(index)}
              >
                Remove Store
              </Button>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={
            disabled ||
            loading ||
            unavailable ||
            rows.fields.length >= Math.min(stores.length, 100)
          }
          onClick={() => rows.append({ storeId: "", role: "CASHIER" })}
        >
          Add Store
        </Button>
        <Controller
          control={form.control}
          name="defaultStoreId"
          render={({ field }) => (
            <ControlField label="Starting Store">
              <SelectControl
                value={field.value}
                onValueChange={field.onChange}
                disabled={disabled || loading || unavailable}
                options={storeOptions.filter((store) =>
                  assignments.some((row) => row.storeId === store.value),
                )}
              />
            </ControlField>
          )}
        />
        <Controller
          control={form.control}
          name="catalogEditor"
          render={({ field }) => (
            <CheckboxField label="Allow catalog editing (requires a Manager assignment)">
              <Checkbox
                checked={field.value}
                onCheckedChange={(value) => field.onChange(value === true)}
                disabled={disabled}
              />
            </CheckboxField>
          )}
        />
      </FieldGroup>
      {unresolved && !loading ? (
        <p role="alert" className="text-sm text-destructive">
          Choose a currently accessible Store for every assignment.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <EditorActions
        disabled={disabled}
        saveDisabled={loading || unavailable || unresolved}
        onCancel={onCancel}
      />
    </form>
  )
}
function GeneralInvitationReasonEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: Omit<Props, "initial"> & {
  initial: Action & { intent: Exclude<Action["intent"], { kind: "INVITE" }> }
}) {
  const form = useZodForm<{ reason: string }>(
    z.object({
      reason: z
        .string()
        .trim()
        .min(1, "Enter a reason.")
        .max(500, "Use 500 characters or fewer."),
    }),
    { defaultValues: { reason: initial.intent.reason } },
  )
  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={form.handleSubmit((value) =>
        onSave(
          generalActionSchema.parse({
            ...initial,
            intent: { ...initial.intent, reason: value.reason },
          }),
        ),
      )}
    >
      <p className="text-sm text-muted-foreground">
        {initial.intent.kind === "RESEND"
          ? "Save a replacement link and request another invitation email. The old link becomes invalid; role and Store grants stay unchanged."
          : "Invalidate this pending link and cancel unsent work. Membership stays invited and its seat stays counted; an email already sending may still arrive with an invalid link."}{" "}
        The reviewed invitation stays selected. Ask for a new draft to choose
        another person.
      </p>
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
      <EditorActions disabled={disabled} onCancel={onCancel} />
    </form>
  )
}
function EditorActions({
  disabled,
  saveDisabled = false,
  onCancel,
}: { disabled: boolean; saveDisabled?: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button type="submit" disabled={disabled || saveDisabled}>
        Save and review
      </Button>
    </div>
  )
}
