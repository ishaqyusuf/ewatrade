"use client"
import { FormCheckboxControl } from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Checkbox,
  CheckboxField,
  ControlField,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import type { ServiceCommerceQuoteReleaseSettingsFormValues } from "@/components/service-commerce/form-context"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

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
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup className="min-w-0 grid gap-5">
        <section className="grid gap-4 rounded-none border border-border bg-card p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Quotation approval
            </p>
            <h2 className="font-semibold">Control who can send quotations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When approval is off, an assigned attendant is trusted to prepare
              and send the correct quotation. Turn it on when another active
              team member must review the exact version first.
            </p>
          </div>

          <CheckboxField
            label=<span>
              <span className="block text-sm font-medium">
                Require approval before sending
              </span>
              <span className="block text-sm text-muted-foreground">
                A Quote creator cannot approve their own version.
              </span>
            </span>
          >
            <Checkbox
              checked={approvalRequired}
              onCheckedChange={(checked) =>
                form.setValue(
                  "mode",
                  checked ? "approval_required" : "attendant_can_release",
                  { shouldDirty: true, shouldValidate: true },
                )
              }
            />
          </CheckboxField>

          {approvalRequired ? (
            <FieldSet className="grid gap-2">
              <FieldLegend variant="label" className="text-sm font-medium">
                Quotation approvers
              </FieldLegend>
              {settings.teamOptions.length > 0 ? (
                settings.teamOptions.map((member) => (
                  <CheckboxField
                    key={member.membershipId}
                    label=<span className="text-sm">{member.name}</span>
                  >
                    <FormCheckboxControl
                      value={member.membershipId}
                      control={form.control}
                      name={"selectedApproverMembershipIds"}
                    />
                  </CheckboxField>
                ))
              ) : (
                <p className="rounded-none border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Add and accept a team member before requiring approval.
                </p>
              )}
              {form.formState.errors.selectedApproverMembershipIds ? (
                <FormFeedback appearance="dashboard">
                  {form.formState.errors.selectedApproverMembershipIds.message}
                </FormFeedback>
              ) : null}
            </FieldSet>
          ) : null}

          <ControlField
            label={<>Reason for this policy</>}
            error={form.formState.errors.reason?.message}
          >
            <Input {...form.register("reason")} />
          </ControlField>

          <div className="flex flex-wrap items-center gap-3">
            <FormActions>
              <SubmitButton
                isSubmitting={isPending}
                disabled={isPending || !form.formState.isValid}
                type="submit"
              >
                {isPending ? "Saving…" : "Save quotation policy"}
              </SubmitButton>
            </FormActions>
            <a
              className="text-sm font-medium text-primary underline underline-offset-4"
              href="/settings"
            >
              Add team member
            </a>
          </div>
        </section>
      </FieldGroup>
    </form>
  )
}
