"use client"
import {
  Button,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import { FormSelectControl } from "@/components/forms/form-controls"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  serviceCommerceChangeReasonSchema,
  serviceCommerceStoreAttendantAssignmentInputSchema,
} from "@ewatrade/service-commerce"

import { useEffect } from "react"
import type { z } from "zod"
import type { CustomerChannelWorkspace } from "./types"

const teamFormSchema = serviceCommerceStoreAttendantAssignmentInputSchema
  .extend({ reason: serviceCommerceChangeReasonSchema })
  .strict()
type TeamFormValues = z.infer<typeof teamFormSchema>

export function TeamRoutingForm({
  isPending,
  onAssign,
  onRevoke,
  registerReset,
  team,
  teamOptions,
}: {
  isPending: boolean
  onAssign: (values: TeamFormValues) => void
  onRevoke: (assignment: CustomerChannelWorkspace["team"][number]) => void
  registerReset?: RegisterServiceCommerceFormReset
  team: CustomerChannelWorkspace["team"]
  teamOptions: CustomerChannelWorkspace["teamOptions"]
}) {
  const form = useZodForm<TeamFormValues>(teamFormSchema, {
    defaultValues: { membershipId: "", reason: "Assign customer requests" },
  })
  useEffect(
    () =>
      registerReset?.(() =>
        form.reset({
          membershipId: "",
          reason: "Assign customer requests",
        }),
      ),
    [form, registerReset],
  )
  const assigned = new Set(
    team
      .filter((member) => member.status === "active")
      .map((member) => member.membershipId),
  )
  const available = teamOptions.filter(
    (membership) => !assigned.has(membership.membershipId),
  )

  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Team & routing
        </p>
        <h2 className="font-semibold">Assign attendants</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Attendants handle requests from every channel. This assignment does
          not grant a pharmacist licence or any other professional role.
        </p>
      </div>
      {team.length > 0 ? (
        <div className="grid gap-2">
          {team.map((member) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
              key={member.id}
            >
              <div>
                <p className="text-sm font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">
                  {member.status === "active"
                    ? "Active attendant"
                    : member.status}
                </p>
              </div>
              {member.status === "active" ? (
                <Button
                  disabled={isPending}
                  onClick={() => onRevoke(member)}
                  size="sm"
                  type="button"
                  variant="outline"
                  appearance="form"
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          Add at least one active attendant before publishing a customer entry
          point.
        </p>
      )}
      <form onSubmit={form.handleSubmit(onAssign)}>
        <FieldGroup className="min-w-0 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <ControlField label={<>Team member</>}>
            <FormSelectControl
              control={form.control}
              name={"membershipId"}
              options={[
                { value: "", label: <>Select active membership</> },
                ...(available.map((membership) => ({
                  value: membership.membershipId,
                  label: (
                    <>
                      {membership.name} · {membership.role}
                    </>
                  ),
                })) ?? []),
              ]}
            />
          </ControlField>
          <ControlField label={<>Reason</>}>
            <Input {...form.register("reason")} />
          </ControlField>
          <FormActions>
            <SubmitButton
              isSubmitting={isPending}
              disabled={isPending || available.length === 0}
              type="submit"
            >
              Add attendant
            </SubmitButton>
          </FormActions>
        </FieldGroup>
      </form>
      <a
        className="w-fit text-sm font-medium text-primary underline underline-offset-4"
        href="/settings"
      >
        Add team member
      </a>
    </section>
  )
}
