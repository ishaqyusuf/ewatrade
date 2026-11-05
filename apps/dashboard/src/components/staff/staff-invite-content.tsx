"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { createStaffFixture } from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import {
  StaffRolePicker,
  type StaffRolePickerValue,
  pickerAssignments,
  pickerHasManager,
} from "@/components/staff/staff-role-picker"
import type { StaffInviteRole } from "@/lib/staff-management"
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FormActions,
  Input,
  SelectControl,
  SubmitButton,
  ToggleGroup,
  ToggleGroupItem,
} from "@ewatrade/ui"
import {
  COUNTRIES,
  DEFAULT_COUNTRY_CODE,
  countryFlag,
  getCountry,
  toInternationalPhone,
} from "@ewatrade/utils/countries"
import type { FormEvent } from "react"
import { useEffect, useRef, useState } from "react"

type InviteChannel = "email" | "whatsapp" | "both"
type InviteForm = {
  channel: InviteChannel
  email: string
  name: string
  phone: string
  phoneCountry: string
  role: StaffInviteRole
}

const emptyInviteForm: InviteForm = {
  channel: "email",
  email: "",
  name: "",
  phone: "",
  phoneCountry: DEFAULT_COUNTRY_CODE,
  role: "cashier",
}

const CHANNELS: Array<{ value: InviteChannel; label: string }> = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "both", label: "Both" },
]

const COUNTRY_OPTIONS = COUNTRIES.map((country) => ({
  value: country.code,
  label: `${countryFlag(country.code)} +${country.dialCode} ${country.name}`,
}))

/** Same rules as the mobile form (Workshop mobile/staff-invite-channels 01). */
function inviteContacts(form: InviteForm) {
  const showsEmail = form.channel !== "whatsapp"
  const showsPhone = form.channel !== "email"
  const email = showsEmail ? form.email.trim().toLowerCase() : ""
  const phone =
    showsPhone && form.phone.trim()
      ? toInternationalPhone(getCountry(form.phoneCountry).dialCode, form.phone)
      : ""
  const errors: { email?: string; phone?: string } = {}
  if (showsEmail) {
    if (!email) errors.email = "Add their email address"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = "Enter a full email address, like name@example.com"
  }
  if (showsPhone) {
    if (!phone) errors.phone = "Add their WhatsApp number"
    else if (!/^\+[1-9]\d{7,14}$/.test(phone))
      errors.phone = "Enter a full WhatsApp number"
  }
  return { email, phone, errors, showsEmail, showsPhone }
}

export function StaffInviteContent({
  onClose,
  onInvited,
  storeId,
}: {
  storeId: string
  onClose: () => Promise<unknown>
  /** `contact` is the email and/or WhatsApp number the invite went to. */
  onInvited: (contact: string, qaInviteUrl: string | null) => Promise<void>
}) {
  const workflow = useDashboardWorkflow()
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInviteForm)
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([])
  const [access, setAccess] = useState<StaffRolePickerValue>({
    role: "cashier",
    storeIds: [storeId],
    startStoreId: storeId,
    catalogEditor: false,
    storeRoles: null,
  })
  const [storeAccessReady, setStoreAccessReady] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/staff", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok)
          throw new Error(
            "Couldn’t load your stores. Close this and try again.",
          )
        setStores(result.stores)
        setStoreAccessReady(result.storeAccessReady === true)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Couldn’t load your stores. Close this and try again.",
          )
      })
    return () => controller.abort()
  }, [])
  const [isSaving, setIsSaving] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const contacts = inviteContacts(inviteForm)
  const fieldErrors = attempted ? contacts.errors : {}
  const [error, setError] = useState<string | null>(null)
  const quickFillSnapshot = useRef<InviteForm | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  function handleCloseError(failure: unknown) {
    setError(
      failure instanceof Error
        ? failure.message
        : "Couldn’t close the invite form.",
    )
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!storeAccessReady) {
      setError("You can invite staff once store access is set up.")
      return
    }

    if (contacts.errors.email || contacts.errors.phone) {
      setAttempted(true)
      return
    }

    if (!access.storeIds.length) {
      setError("Choose at least one store.")
      return
    }
    // The first store sent is where they start.
    const assignments = pickerAssignments(access)
    setIsSaving(true)

    try {
      const response = await workflow.fetch("staff_invite", "/api/staff", {
        body: JSON.stringify({
          email: contacts.email || undefined,
          phone: contacts.phone || undefined,
          name: inviteForm.name.trim() || undefined,
          operation: "invite",
          role: assignments[0]?.role ?? access.role,
          storeId: assignments[0]?.storeId,
          assignments,
          catalogEditor: pickerHasManager(access) && access.catalogEditor,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const result = (await response.json()) as {
        error?: string
        qaInviteUrl?: string
      }

      if (!response.ok) {
        throw new Error(
          response.status === 409 && result.error
            ? result.error
            : "Couldn’t send the invite. Try again.",
        )
      }

      await onInvited(
        [contacts.email, contacts.phone].filter(Boolean).join(" and "),
        result.qaInviteUrl ?? null,
      )
      await onClose()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Couldn’t send the invite. Try again.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submitInvite}>
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      <QaDashboardQuickFill
        canUndo={canUndoQuickFill}
        formId="dashboard.staff.invite"
        isDirty={Boolean(
          inviteForm.email || inviteForm.phone || inviteForm.name,
        )}
        onFill={(context, sequence) => {
          quickFillSnapshot.current = inviteForm
          const fixture = createStaffFixture(context, sequence)
          setInviteForm({
            ...emptyInviteForm,
            email: fixture.email,
            name: fixture.name,
          })
          setCanUndoQuickFill(true)
        }}
        onUndo={() => {
          if (!quickFillSnapshot.current) return
          setInviteForm(quickFillSnapshot.current)
          quickFillSnapshot.current = null
          setCanUndoQuickFill(false)
        }}
      />
      <FieldGroup>
        <Field>
          <FieldLabel id="staff-invite-by">Invite by</FieldLabel>
          <ToggleGroup<InviteChannel>
            variant="outline"
            aria-labelledby="staff-invite-by"
            value={[inviteForm.channel]}
            disabled={isSaving}
            onValueChange={(values) => {
              const channel = values[0]
              if (channel) setInviteForm((current) => ({ ...current, channel }))
            }}
            className="max-w-full flex-wrap"
          >
            {CHANNELS.map((option) => (
              <ToggleGroupItem
                className="rounded-none"
                key={option.value}
                value={option.value}
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>

        {contacts.showsEmail ? (
          <Field data-invalid={Boolean(fieldErrors.email)}>
            <FieldLabel htmlFor="staff-invite-email">Email address</FieldLabel>
            <Input
              id="staff-invite-email"
              disabled={isSaving}
              type="email"
              placeholder="name@example.com"
              aria-invalid={Boolean(fieldErrors.email)}
              value={inviteForm.email}
              onChange={(event) =>
                setInviteForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
            {fieldErrors.email ? (
              <FieldError>{fieldErrors.email}</FieldError>
            ) : null}
          </Field>
        ) : null}

        {contacts.showsPhone ? (
          <Field data-invalid={Boolean(fieldErrors.phone)}>
            <FieldLabel htmlFor="staff-invite-phone">
              WhatsApp number
            </FieldLabel>
            <div className="flex gap-2">
              <SelectControl
                aria-label="Phone country"
                className="w-36 shrink-0 rounded-none"
                disabled={isSaving}
                options={COUNTRY_OPTIONS}
                value={inviteForm.phoneCountry}
                onValueChange={(phoneCountry) =>
                  setInviteForm((current) => ({ ...current, phoneCountry }))
                }
              />
              <Input
                id="staff-invite-phone"
                disabled={isSaving}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="802 123 4567"
                aria-invalid={Boolean(fieldErrors.phone)}
                value={inviteForm.phone}
                onChange={(event) =>
                  setInviteForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
              />
            </div>
            {fieldErrors.phone ? (
              <FieldError>{fieldErrors.phone}</FieldError>
            ) : null}
          </Field>
        ) : null}

        <Field>
          <FieldLabel htmlFor="staff-invite-name">Name (optional)</FieldLabel>
          <Input
            id="staff-invite-name"
            disabled={isSaving}
            value={inviteForm.name}
            onChange={(event) =>
              setInviteForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </Field>

        <StaffRolePicker
          value={access}
          stores={stores}
          disabled={isSaving || !stores.length}
          onChange={setAccess}
        />
        <p className="text-sm text-muted-foreground">
          Owners and admins already have every store.
        </p>
      </FieldGroup>

      <FormFeedback appearance="dashboard" variant="default">
        {storeAccessReady
          ? contacts.showsPhone
            ? "They’ll open the link we send and sign in with their WhatsApp number or email."
            : "They’ll set a password from the link in the email."
          : "You can invite staff once store access is set up."}
      </FormFeedback>

      <FormActions>
        <Button
          type="button"
          variant="outline"
          className="rounded-none"
          disabled={isSaving}
          onClick={() => void onClose().catch(handleCloseError)}
        >
          Cancel
        </Button>
        <SubmitButton
          disabled={
            !storeAccessReady || !stores.length || !access.storeIds.length
          }
          isSubmitting={isSaving}
        >
          Send invite
        </SubmitButton>
      </FormActions>
    </form>
  )
}
