"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { Button, ControlField, Input } from "@ewatrade/ui"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"

import { useEffect, useState } from "react"

type NumberOption = {
  businessDisplayName?: string
  displayNumber: string
  phoneNumberId: string
  wabaId: string
}

export function EmbeddedSignupSelection({
  error,
  isLoading,
  isPending,
  numbers,
  onSelect,
  registerReset,
}: {
  error?: string | null
  isLoading: boolean
  isPending: boolean
  numbers: NumberOption[]
  onSelect: (input: {
    billingOwner?: string
    phoneNumberId: string
    testRecipient: string
  }) => void
  registerReset?: RegisterServiceCommerceFormReset
}) {
  const [testRecipient, setTestRecipient] = useState("")
  const [billingOwner, setBillingOwner] = useState("")
  useEffect(
    () =>
      registerReset?.(() => {
        setBillingOwner("")
        setTestRecipient("")
      }),
    [registerReset],
  )

  return (
    <section className="grid gap-4 rounded-none border border-primary/30 bg-primary/5 p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          Authorized numbers
        </p>
        <h2 className="font-semibold">Choose the number to connect</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          EwaTrade never guesses the first number. Choose one explicitly and use
          a consented recipient for the neutral readiness test.
        </p>
      </div>
      {isLoading ? (
        <div className="h-28 animate-pulse rounded-none bg-muted" />
      ) : error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : numbers.length === 0 ? (
        <FormFeedback appearance="dashboard">
          This selection expired or has no authorized numbers. Start Embedded
          Signup again.
        </FormFeedback>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ControlField label={<>Consented test recipient</>}>
              <Input
                onChange={(event) => setTestRecipient(event.target.value)}
                placeholder="+234…"
                value={testRecipient}
              />
            </ControlField>
            <ControlField label={<>Billing owner</>}>
              <Input
                onChange={(event) => setBillingOwner(event.target.value)}
                placeholder="Business"
                value={billingOwner}
              />
            </ControlField>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {numbers.map((number) => (
              <Button
                className="h-auto justify-start px-4 py-3 text-left"
                disabled={isPending || testRecipient.trim().length < 7}
                key={number.phoneNumberId}
                onClick={() =>
                  onSelect({
                    billingOwner: billingOwner.trim() || undefined,
                    phoneNumberId: number.phoneNumberId,
                    testRecipient,
                  })
                }
                type="button"
                variant="outline"
                appearance="form"
              >
                <span>
                  <span className="block font-medium">
                    {number.businessDisplayName || number.displayNumber}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {number.displayNumber}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
