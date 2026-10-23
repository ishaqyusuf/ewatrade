"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { SettingsRow } from "@/components/settings/settings-page"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { normalizeWhatsAppPhone } from "@ewatrade/customer-messages"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FormActions,
  Input,
  SelectControl,
  Skeleton,
} from "@ewatrade/ui"
import { COUNTRIES } from "@ewatrade/utils/countries"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useId, useRef, useState } from "react"

type Contact = RouterOutputs["stores"]["contact"]

const countries = [
  { value: "", label: "Not set" },
  ...COUNTRIES.map((country) => ({ value: country.code, label: country.name })),
]

export function StoreContactRow({
  storeId,
  storeName,
}: { storeId: string; storeName: string }) {
  const trpc = useTRPC()
  const contact = useQuery(
    trpc.stores.contact.queryOptions({ storeId }, { retry: false }),
  )
  const [editing, setEditing] = useState(false)
  return (
    <SettingsRow
      label={storeName}
      description={
        contact.isError ? (
          <span role="alert">
            Couldn't load the contact. {contact.error.message}
          </span>
        ) : contact.isPending ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          (contact.data.supportPhone ?? "No customer phone number")
        )
      }
    >
      {contact.isError ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void contact.refetch()}
        >
          Try again
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={!contact.isSuccess}
          onClick={() => setEditing(true)}
          aria-label={`Edit contact for ${storeName}`}
        >
          Edit contact
        </Button>
      )}
      {editing && contact.isSuccess ? (
        <StoreContactDialog
          key={storeId}
          contact={contact.data}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </SettingsRow>
  )
}

function StoreContactDialog({
  contact: initialContact,
  onClose,
}: { contact: Contact; onClose: () => void }) {
  const [contact] = useState(initialContact)
  const trpc = useTRPC()
  const cache = useQueryClient()
  const id = useId()
  const [phone, setPhone] = useState(contact.supportPhone ?? "")
  const [country, setCountry] = useState(contact.countryCode ?? "")
  const [error, setError] = useState<string | null>(null)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)
  const mounted = useRef(true)
  const generation = useRef(getDataCacheGeneration())
  const update = useMutation(trpc.stores.updateContact.mutationOptions())
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const busy = update.isPending || reloading
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent className="max-w-[455px]">
        <div className="p-4">
          <DialogHeader className="mb-6 pr-8">
            <DialogTitle>Customer contact · {contact.name}</DialogTitle>
            <DialogDescription>
              Used for enquiries and receipts when those features are available.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              if (
                !mounted.current ||
                busy ||
                generation.current !== getDataCacheGeneration()
              )
                return
              setError(null)
              if (
                phone.trim() &&
                !normalizeWhatsAppPhone(phone.trim(), country || undefined)
              ) {
                setPhoneError(
                  "Enter a valid contact phone number with its country code.",
                )
                return
              }
              setPhoneError(null)
              try {
                const saved = await update.mutateAsync({
                  storeId: contact.id,
                  expected: {
                    supportPhone: contact.supportPhone,
                    countryCode: contact.countryCode,
                  },
                  supportPhone: phone.trim() || null,
                  countryCode: country || null,
                })
                if (
                  !mounted.current ||
                  generation.current !== getDataCacheGeneration()
                )
                  return
                cache.setQueryData(
                  trpc.stores.contact.queryKey({ storeId: contact.id }),
                  saved,
                )
                await Promise.allSettled([
                  cache.invalidateQueries({
                    queryKey: trpc.stores.contact.queryKey({
                      storeId: contact.id,
                    }),
                  }),
                  cache.invalidateQueries({
                    queryKey: trpc.tenant.stores.queryKey(),
                  }),
                  cache.invalidateQueries({
                    queryKey: trpc.tenant.current.queryKey(),
                  }),
                ])
                if (
                  mounted.current &&
                  generation.current === getDataCacheGeneration()
                )
                  onClose()
              } catch (failure) {
                if (
                  mounted.current &&
                  generation.current === getDataCacheGeneration()
                ) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "Couldn't save the contact. Try again.",
                  )
                }
              }
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${id}-country`}>Country</FieldLabel>
                <SelectControl
                  id={`${id}-country`}
                  value={country}
                  onValueChange={setCountry}
                  options={countries}
                  disabled={busy}
                />
                <FieldDescription>
                  Changing the country rechecks service availability.
                </FieldDescription>
              </Field>
              <Field data-invalid={Boolean(phoneError)}>
                <FieldLabel htmlFor={`${id}-phone`}>
                  Customer phone number
                </FieldLabel>
                <Input
                  id={`${id}-phone`}
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  maxLength={40}
                  aria-invalid={Boolean(phoneError)}
                  onChange={(event) => {
                    setPhone(event.target.value)
                    setPhoneError(null)
                  }}
                  disabled={busy}
                />
                <FieldDescription>
                  Include the country code, or use a local number for the
                  selected country. Leave blank to remove it.
                </FieldDescription>
                {phoneError ? <FieldError>{phoneError}</FieldError> : null}
              </Field>
              {error ? (
                <FormFeedback appearance="dashboard">
                  {error}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !mounted.current ||
                        generation.current !== getDataCacheGeneration()
                      )
                        return
                      setReloading(true)
                      try {
                        await cache.fetchQuery(
                          trpc.stores.contact.queryOptions(
                            { storeId: contact.id },
                            { staleTime: 0 },
                          ),
                        )
                        if (
                          mounted.current &&
                          generation.current === getDataCacheGeneration()
                        )
                          onClose()
                      } catch {
                        if (
                          mounted.current &&
                          generation.current === getDataCacheGeneration()
                        )
                          setError("Couldn't reload the contact. Try again.")
                      } finally {
                        if (mounted.current) setReloading(false)
                      }
                    }}
                  >
                    Reload contact
                  </Button>
                </FormFeedback>
              ) : null}
              <FormActions>
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {update.isPending ? "Saving…" : "Save contact"}
                </Button>
              </FormActions>
            </FieldGroup>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
