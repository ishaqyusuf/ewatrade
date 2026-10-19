"use client"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  Button,
  ControlField,
  Input,
  Sheet,
} from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useEffect, useId, useState } from "react"

type Fields = { name: string; phone: string; email: string }
type FieldErrors = Partial<Record<keyof Fields, string>>

const EMPTY: Fields = { name: "", phone: "", email: "" }

/** Plain checks before the server's own; the server stays the authority. */
export function validateCustomerFields(fields: Fields): FieldErrors {
  const errors: FieldErrors = {}
  if (!fields.name.trim()) errors.name = "Enter the customer’s name."
  const digits = fields.phone.replace(/\D/g, "")
  if (fields.phone.trim() && digits.length < 7)
    errors.phone = "Enter a full phone number, like 0803 123 4567."
  if (fields.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))
    errors.email = "Enter a full email address, like name@example.com."
  return errors
}

/**
 * Plain wording by error code; the API hides conflict details, so a conflict
 * on create is a duplicate and on update is a duplicate or a newer edit.
 */
export function customerSaveError(
  operation: "create" | "update" | "load",
  code: string | undefined,
) {
  if (code === "CONFLICT")
    return operation === "create"
      ? "Another customer already has this phone number or email."
      : "Another customer has this phone number or email, or someone else just changed this customer. The latest details are loaded; check them and save again."
  if (code === "NOT_FOUND")
    return "This customer was removed, or you don’t have access."
  if (code === "BAD_REQUEST") return "Check the details and try again."
  if (code === "FORBIDDEN")
    return "You don’t have permission to change customers."
  return operation === "load"
    ? "Couldn’t load this customer. Check your connection and try again."
    : "Couldn’t save the customer. Check your connection and try again."
}

function errorCode(failure: unknown) {
  return (failure as { data?: { code?: string } } | null)?.data?.code
}

/**
 * Add a customer, or edit one when `customerId` is set. Saving closes the
 * sheet and reports the name back so the page can refresh its list.
 */
export function CustomerFormSheet({
  open,
  customerId,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  customerId: string | null
  onOpenChange: (open: boolean) => void
  onSaved: (result: { name: string; created: boolean }) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {open ? (
        <CustomerFormFrame
          key={customerId ?? "new"}
          customerId={customerId}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      ) : null}
    </Sheet>
  )
}

function CustomerFormFrame({
  customerId,
  onClose,
  onSaved,
}: {
  customerId: string | null
  onClose: () => void
  onSaved: (result: { name: string; created: boolean }) => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const formId = useId()
  const editing = Boolean(customerId)
  const current = useQuery(
    trpc.customers.getById.queryOptions(
      { customerId: customerId ?? "" },
      { enabled: editing, retry: false },
    ),
  )
  const create = useMutation(trpc.customers.create.mutationOptions())
  const update = useMutation(trpc.customers.update.mutationOptions())
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const loaded = current.data
  useEffect(() => {
    if (loaded)
      setFields({
        name: loaded.name,
        phone: loaded.phone ?? "",
        email: loaded.email ?? "",
      })
  }, [loaded])
  const pending = create.isPending || update.isPending
  const set = (key: keyof Fields) => (value: string) => {
    setFields((previous) => ({ ...previous, [key]: value }))
    if (errors[key])
      setErrors((previous) => ({ ...previous, [key]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const nextErrors = validateCustomerFields(fields)
    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length) return
    const name = fields.name.trim()
    const phone = fields.phone.trim()
    const email = fields.email.trim()
    try {
      if (!customerId) {
        await create.mutateAsync({
          name,
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
        })
        onSaved({ name, created: true })
        return
      }
      if (!loaded) return
      if (
        name === loaded.name &&
        phone === (loaded.phone ?? "") &&
        email === (loaded.email ?? "")
      ) {
        onClose()
        return
      }
      await update.mutateAsync({
        customerId,
        expectedRevision: loaded.revision,
        ...(name !== loaded.name ? { name } : {}),
        ...(phone !== (loaded.phone ?? "") ? { phone: phone || null } : {}),
        ...(email !== (loaded.email ?? "") ? { email: email || null } : {}),
      })
      await client.invalidateQueries({
        queryKey: trpc.customers.getById.queryKey({ customerId }),
      })
      onSaved({ name, created: false })
    } catch (failure) {
      const code = errorCode(failure)
      setFormError(customerSaveError(customerId ? "update" : "create", code))
      if (customerId && code === "CONFLICT") void current.refetch()
    }
  }

  const title = editing ? "Edit customer" : "Add customer"
  return (
    <SheetFrame
      title={title}
      description={editing ? loaded?.name : undefined}
      closeDisabled={pending}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={pending || (editing && !loaded)}
          >
            {pending ? "Saving…" : editing ? "Save changes" : "Add customer"}
          </Button>
        </>
      }
    >
      {editing && current.isPending ? (
        <output aria-busy="true" className="text-sm text-muted-foreground">
          Loading customer…
        </output>
      ) : editing && current.isError ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>
            {customerSaveError("load", errorCode(current.error))}
          </AlertDescription>
          <Button variant="outline" onClick={() => void current.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : (
        <form
          id={formId}
          noValidate
          className="grid gap-5"
          onSubmit={(event) => void submit(event)}
        >
          {formError ? (
            <Alert appearance="dashboard" variant="destructive" role="alert">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <ControlField label="Name" error={errors.name}>
            <Input
              autoComplete="name"
              autoFocus
              maxLength={160}
              placeholder="e.g. Amina Bello"
              value={fields.name}
              disabled={pending}
              onChange={(event) => set("name")(event.target.value)}
            />
          </ControlField>
          <ControlField
            label={
              <>
                Phone number{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </>
            }
            description="Used to find them and to send Order updates on WhatsApp."
            error={errors.phone}
          >
            <Input
              type="tel"
              autoComplete="tel"
              maxLength={40}
              placeholder="e.g. 0803 123 4567"
              value={fields.phone}
              disabled={pending}
              onChange={(event) => set("phone")(event.target.value)}
            />
          </ControlField>
          <ControlField
            label={
              <>
                Email{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </>
            }
            error={errors.email}
          >
            <Input
              type="email"
              autoComplete="email"
              maxLength={320}
              placeholder="name@example.com"
              value={fields.email}
              disabled={pending}
              onChange={(event) => set("email")(event.target.value)}
            />
          </ControlField>
          {editing ? (
            <p className="text-sm text-muted-foreground">
              To change what they owe, record a payment or add a starting
              balance from their statement.
            </p>
          ) : null}
        </form>
      )}
    </SheetFrame>
  )
}
