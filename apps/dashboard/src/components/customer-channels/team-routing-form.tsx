"use client"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  serviceCommerceChangeReasonSchema,
  serviceCommerceStoreAttendantAssignmentInputSchema,
} from "@ewatrade/service-commerce"
import { Button } from "@ewatrade/ui"
import { useEffect } from "react"
import type { z } from "zod"
import type { CustomerChannelWorkspace } from "./types"

const teamFormSchema = serviceCommerceStoreAttendantAssignmentInputSchema
  .extend({ reason: serviceCommerceChangeReasonSchema })
  .strict()
type TeamFormValues = z.infer<typeof teamFormSchema>

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

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
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={form.handleSubmit(onAssign)}
      >
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Team member</span>
          <select className={fieldClass} {...form.register("membershipId")}>
            <option value="">Select active membership</option>
            {available.map((membership) => (
              <option
                key={membership.membershipId}
                value={membership.membershipId}
              >
                {membership.name} · {membership.role}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Reason</span>
          <input className={fieldClass} {...form.register("reason")} />
        </label>
        <Button disabled={isPending || available.length === 0} type="submit">
          Add attendant
        </Button>
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
