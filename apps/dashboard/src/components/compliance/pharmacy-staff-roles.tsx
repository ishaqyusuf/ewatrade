"use client"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  Checkbox,
  Input,
  SubmitButton,
  toast,
} from "@ewatrade/ui"

import { ComplianceField } from "@/components/compliance/compliance-form-parts"
import { FormSelectControl } from "@/components/forms/form-controls"
import { SettingsSection } from "@/components/settings/settings-page"
import { useZodForm } from "@/hooks/use-zod-form"
import { getDashboardRoleLabel } from "@/lib/navigation"
import { useTRPC } from "@/trpc/client"
import {
  type PrescriptionRoleAssignmentFormValues,
  prescriptionRoleAssignmentFormSchema,
} from "@ewatrade/prescriptions/schemas"

import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation } from "@tanstack/react-query"
import { useId, useState } from "react"
import { Controller } from "react-hook-form"

type RoleFormValues = PrescriptionRoleAssignmentFormValues

const ROLE_LABELS: Record<string, string> = {
  attendant: "Attendant",
  pharmacist: "Pharmacist",
}

function roleLabel(role: string) {
  return ROLE_LABELS[role] ?? "Team member"
}

export function PharmacyStaffRoles({
  eligibleMembers,
  onChanged,
  roles,
  storeId,
}: {
  eligibleMembers: Array<{ id: string; name: string; tenantRole: string }>
  onChanged: () => Promise<unknown>
  roles: Array<{
    credentialReference: string | null
    id: string
    role: string
    status: string
    user: { name: string }
  }>
  storeId: string
}) {
  const trpc = useTRPC()
  const ids = useId()
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<{
    id: string
    name: string
    role: string
  } | null>(null)
  const form = useZodForm<RoleFormValues>(
    prescriptionRoleAssignmentFormSchema,
    {
      defaultValues: {
        credentialReference: "",
        credentialVerified: false,
        role: "attendant",
        userId: "",
      },
    },
  )
  const selectedRole = form.watch("role")
  const activeRoles = roles.filter((role) => role.status === "active")

  const assignMutation = useMutation(
    trpc.prescriptions.assignRole.mutationOptions({
      onError: (error) => setAddError(error.message),
      onSuccess: async (_result, values) => {
        const name =
          eligibleMembers.find((member) => member.id === values.userId)?.name ??
          "They"
        await onChanged()
        form.reset()
        setAdding(false)
        toast(`${name} added as ${roleLabel(values.role).toLowerCase()}.`)
      },
    }),
  )
  const revokeMutation = useMutation(
    trpc.prescriptions.revokeRole.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: async () => {
        await onChanged()
        toast("Removed.")
      },
    }),
  )

  const { errors } = form.formState

  return (
    <SettingsSection
      title="Pharmacists and attendants"
      description="Only for this store. Attendants check requests. Pharmacists approve them."
      action={
        adding ? null : (
          <Button
            onClick={() => {
              setAddError(null)
              setAdding(true)
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Add a person
          </Button>
        )
      }
    >
      {adding ? (
        <form
          className="grid gap-0 bg-muted/40"
          noValidate
          onSubmit={form.handleSubmit((values) => {
            setAddError(null)
            assignMutation.mutate({
              ...values,
              credentialReference:
                values.role === "pharmacist"
                  ? values.credentialReference?.trim()
                  : undefined,
              storeId,
            })
          })}
        >
          <div className="grid gap-0 sm:grid-cols-2">
            <ComplianceField
              htmlFor={`${ids}member`}
              label="Person"
              error={errors.userId ? "Choose a person." : null}
            >
              <FormSelectControl
                control={form.control}
                id={`${ids}member`}
                name="userId"
                options={[
                  { value: "", label: "Choose a person" },
                  ...eligibleMembers.map((member) => ({
                    value: member.id,
                    label: `${member.name} · ${getDashboardRoleLabel(member.tenantRole)}`,
                  })),
                ]}
              />
            </ComplianceField>
            <ComplianceField htmlFor={`${ids}role`} label="Role">
              <FormSelectControl
                control={form.control}
                id={`${ids}role`}
                name="role"
                options={[
                  {
                    value: "attendant",
                    label: "Attendant",
                    description: "Checks each request",
                  },
                  {
                    value: "pharmacist",
                    label: "Pharmacist",
                    description: "Approves each request",
                  },
                ]}
              />
            </ComplianceField>
          </div>
          {selectedRole === "pharmacist" ? (
            <>
              <ComplianceField
                htmlFor={`${ids}licence`}
                label="Licence number"
                error={
                  errors.credentialReference
                    ? "Enter the pharmacist's licence number."
                    : null
                }
              >
                <Input
                  aria-invalid={Boolean(errors.credentialReference)}
                  className="max-w-72"
                  id={`${ids}licence`}
                  {...form.register("credentialReference")}
                />
              </ComplianceField>
              <div className="grid gap-1 px-4 pb-3.5">
                <Controller
                  control={form.control}
                  name="credentialVerified"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        aria-invalid={Boolean(errors.credentialVerified)}
                        checked={Boolean(field.value)}
                        id={`${ids}licence-checked`}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                      />
                      <label
                        htmlFor={`${ids}licence-checked`}
                        className="text-sm"
                      >
                        I've checked this pharmacist's licence myself.
                      </label>
                    </div>
                  )}
                />
                {errors.credentialVerified ? (
                  <p className="text-sm text-destructive">
                    Check the licence before you add a pharmacist.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3.5">
            {addError ? (
              <p
                role="alert"
                className="min-w-0 flex-1 text-sm text-destructive"
              >
                {addError}
              </p>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <Button
                disabled={assignMutation.isPending}
                onClick={() => {
                  form.reset()
                  setAddError(null)
                  setAdding(false)
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <SubmitButton isSubmitting={assignMutation.isPending} size="sm">
                Add
              </SubmitButton>
            </div>
          </div>
        </form>
      ) : null}

      {activeRoles.length === 0 ? (
        <p className="px-4 py-3.5 text-sm text-muted-foreground">
          No one added yet.
        </p>
      ) : (
        activeRoles.map((role) => (
          <div
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
            key={role.id}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{role.user.name}</p>
              <p className="text-sm text-muted-foreground">
                {roleLabel(role.role)}
                {role.credentialReference
                  ? ` · Licence ${role.credentialReference}`
                  : ""}
              </p>
            </div>
            <Button
              disabled={revokeMutation.isPending}
              onClick={() =>
                setRemoveTarget({
                  id: role.id,
                  name: role.user.name,
                  role: roleLabel(role.role).toLowerCase(),
                })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Remove
            </Button>
          </div>
        ))
      )}

      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle className="text-lg font-medium">
            Remove {removeTarget?.name} as {removeTarget?.role}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            They lose access to prescriptions in this store. Past prescription
            records are kept.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={revokeMutation.isPending}
              onClick={() => {
                if (removeTarget) {
                  revokeMutation.mutate({ roleId: removeTarget.id, storeId })
                }
                setRemoveTarget(null)
              }}
              type="button"
              variant="destructive"
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}
