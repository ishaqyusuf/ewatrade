"use client"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useCustomerSheetParams } from "@/hooks/use-customer-sheet-params"
import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  Button,
  ControlField,
  Input,
  MoneyInput,
  RadioGroup,
  RadioGroupItem,
  Sheet,
} from "@ewatrade/ui"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useEffect, useId, useState } from "react"

type Fields = { name: string; phone: string; email: string }
type FieldErrors = Partial<Record<keyof Fields | "startAmount", string>>
type StartingBalance = "none" | "owes" | "credit"

const EMPTY: Fields = { name: "", phone: "", email: "" }
/** The canonical opening needs a reason; the form doesn't ask for one. */
const STARTING_BALANCE_REASON = "Starting balance added with the customer"

/** A positive amount in minor units, or the reason it can't be used. */
export function startingBalanceMinor(
  start: StartingBalance,
  amount: string,
): { minor: string | null; error?: string } {
  if (start === "none") return { minor: null }
  try {
    return { minor: parseFinanceMoney(amount.replace(/,/g, "")) }
  } catch {
    return {
      minor: null,
      error:
        start === "owes"
          ? "Enter how much they owe, like 5000."
          : "Enter how much they paid ahead, like 5000.",
    }
  }
}

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
 * Add a customer, or edit one, as opened by `useCustomerSheetParams`. Saving
 * closes the sheet and reports the name back so the page can refresh its list.
 */
export function CustomerFormSheet({
  onSaved,
  canAddStartingBalance = false,
}: {
  onSaved: (result: { name: string; created: boolean }) => void
  /** Owners and Admins; the server checks again. */
  canAddStartingBalance?: boolean
}) {
  const { open, customerId, close } = useCustomerSheetParams()
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) void close()
      }}
    >
      {open ? (
        <CustomerFormFrame
          key={customerId ?? "new"}
          customerId={customerId}
          canAddStartingBalance={canAddStartingBalance}
          onClose={() => void close()}
          onSaved={(result) => {
            void close()
            onSaved(result)
          }}
        />
      ) : null}
    </Sheet>
  )
}

function CustomerFormFrame({
  customerId,
  canAddStartingBalance,
  onClose,
  onSaved,
}: {
  customerId: string | null
  canAddStartingBalance: boolean
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
  const book = useQuery(
    trpc.finance.book.queryOptions(undefined, {
      enabled: canAddStartingBalance && !editing,
      retry: false,
    }),
  )
  const create = useMutation(trpc.customers.create.mutationOptions())
  const createWithOpening = useMutation(
    trpc.customerLedger.createCustomerWithOpening.mutationOptions(),
  )
  // One identity per form, so a retried save can't add the customer twice.
  const [commandId] = useState(() => crypto.randomUUID())
  const [start, setStart] = useState<StartingBalance>("none")
  const [startAmount, setStartAmount] = useState("")
  const showStart = canAddStartingBalance && !editing && Boolean(book.data)
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
  const pending =
    create.isPending || update.isPending || createWithOpening.isPending
  const set = (key: keyof Fields) => (value: string) => {
    setFields((previous) => ({ ...previous, [key]: value }))
    if (errors[key])
      setErrors((previous) => ({ ...previous, [key]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const nextErrors: FieldErrors = validateCustomerFields(fields)
    const opening = showStart
      ? startingBalanceMinor(start, startAmount)
      : { minor: null }
    if (opening.error) nextErrors.startAmount = opening.error
    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length) return
    const name = fields.name.trim()
    const phone = fields.phone.trim()
    const email = fields.email.trim()
    try {
      if (!customerId && book.data && opening.minor) {
        await createWithOpening.mutateAsync({
          bookId: book.data.id,
          clientCommandId: commandId,
          customer: {
            name,
            ...(phone ? { phone } : {}),
            ...(email ? { email } : {}),
          },
          opening: {
            direction: start === "owes" ? "DEBT" : "CREDIT",
            amountMinor: opening.minor,
            reason: STARTING_BALANCE_REASON,
          },
        })
        onSaved({ name, created: true })
        return
      }
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
      await Promise.all([
        client.invalidateQueries({
          queryKey: trpc.customers.getById.queryKey({ customerId }),
        }),
        client.invalidateQueries({
          queryKey: trpc.customers.contact.queryKey({ customerId }),
        }),
      ])
      onSaved({ name, created: false })
    } catch (failure) {
      const code = errorCode(failure)
      // A starting balance can fail for finance reasons (a closed period,
      // Finance not set up); the server's own words say which.
      setFormError(
        !customerId && start !== "none" && failure instanceof Error && code
          ? failure.message
          : customerSaveError(customerId ? "update" : "create", code),
      )
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
          {showStart && book.data ? (
            <fieldset className="grid gap-3">
              <legend className="mb-3 text-sm font-medium">
                Do they already owe you, or have they paid ahead?
              </legend>
              <RadioGroup
                value={start}
                onValueChange={(value) => {
                  setStart(value as StartingBalance)
                  setErrors((previous) => ({
                    ...previous,
                    startAmount: undefined,
                  }))
                }}
                className="flex flex-wrap gap-4"
                disabled={pending}
              >
                {(
                  [
                    ["none", "No"],
                    ["owes", "They owe me"],
                    ["credit", "They paid ahead"],
                  ] as const
                ).map(([value, label]) => (
                  // biome-ignore lint/a11y/noLabelWithoutControl: the radio is the label's child
                  <label
                    key={value}
                    className="inline-flex items-center gap-2 text-sm"
                  >
                    <RadioGroupItem value={value} />
                    {label}
                  </label>
                ))}
              </RadioGroup>
              {start !== "none" ? (
                <ControlField
                  label={
                    start === "owes" ? "Amount they owe" : "Amount paid ahead"
                  }
                  description="Added to their statement as a starting balance. No money moves."
                  error={errors.startAmount}
                >
                  <MoneyInput
                    currencyCode={book.data.currencyCode}
                    placeholder="0"
                    value={startAmount}
                    disabled={pending}
                    onChange={(event) => {
                      setStartAmount(event.target.value)
                      if (errors.startAmount)
                        setErrors((previous) => ({
                          ...previous,
                          startAmount: undefined,
                        }))
                    }}
                  />
                </ControlField>
              ) : null}
            </fieldset>
          ) : null}
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
