"use client"

import type { ServiceCommerceQuoteReleaseSettingsFormValues } from "@/components/service-commerce/form-context"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import { useEffect, useRef } from "react"
import { useFormContext } from "react-hook-form"

type ReleaseSettings = RouterOutputs["serviceCommerce"]["quoteReleaseSettings"]

export function QuoteReleasePolicyForm({
  isPending,
  onSubmit,
  settings,
}: {
  isPending: boolean
  onSubmit: (values: ServiceCommerceQuoteReleaseSettingsFormValues) => void
  settings: ReleaseSettings
}) {
  const form = useFormContext<ServiceCommerceQuoteReleaseSettingsFormValues>()
  const initializedRevision = useRef<number | null>(null)
  useEffect(() => {
    if (initializedRevision.current === settings.policy.revision) return
    initializedRevision.current = settings.policy.revision
    form.reset({
      mode: settings.policy.mode,
      reason: settings.policy.reason ?? "Configure quotation release",
      selectedApproverMembershipIds:
        settings.policy.selectedApproverMembershipIds,
    })
  }, [form, settings])
  const approvalRequired = form.watch("mode") === "approval_required"

  return (
    <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
      <section className="grid gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Quotation approval
          </p>
          <h2 className="font-semibold">Control who can send quotations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            When approval is off, an assigned attendant is trusted to prepare
            and send the correct quotation. Turn it on when another active team
            member must review the exact version first.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border p-4">
          <input
            checked={approvalRequired}
            className="mt-1 size-4"
            onChange={(event) =>
              form.setValue(
                "mode",
                event.target.checked
                  ? "approval_required"
                  : "attendant_can_release",
                { shouldDirty: true, shouldValidate: true },
              )
            }
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-medium">
              Require approval before sending
            </span>
            <span className="block text-sm text-muted-foreground">
              A Quote creator cannot approve their own version.
            </span>
          </span>
        </label>

        {approvalRequired ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Quotation approvers</legend>
            {settings.teamOptions.length > 0 ? (
              settings.teamOptions.map((member) => (
                <label
                  className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"
                  key={member.membershipId}
                >
                  <input
                    className="size-4"
                    type="checkbox"
                    value={member.membershipId}
                    {...form.register("selectedApproverMembershipIds")}
                  />
                  <span className="text-sm">{member.name}</span>
                </label>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Add and accept a team member before requiring approval.
              </p>
            )}
            {form.formState.errors.selectedApproverMembershipIds ? (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.selectedApproverMembershipIds.message}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Reason for this policy</span>
          <input
            className="h-10 rounded-lg border border-border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            {...form.register("reason")}
          />
          {form.formState.errors.reason ? (
            <span className="text-destructive" role="alert">
              {form.formState.errors.reason.message}
            </span>
          ) : null}
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={isPending || !form.formState.isValid} type="submit">
            {isPending ? "Saving…" : "Save quotation policy"}
          </Button>
          <a
            className="text-sm font-medium text-primary underline underline-offset-4"
            href="/settings"
          >
            Add team member
          </a>
        </div>
      </section>
    </form>
  )
}
