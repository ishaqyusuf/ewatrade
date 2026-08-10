"use client"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import { Button } from "@ewatrade/ui"
import { useEffect, useState } from "react"

type NumberOption = {
  businessDisplayName?: string
  displayNumber: string
  phoneNumberId: string
  wabaId: string
}

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

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
    <section className="grid gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
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
        <div className="h-28 animate-pulse rounded-lg bg-muted" />
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : numbers.length === 0 ? (
        <p className="text-sm text-destructive" role="alert">
          This selection expired or has no authorized numbers. Start Embedded
          Signup again.
        </p>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Consented test recipient</span>
              <input
                className={fieldClass}
                onChange={(event) => setTestRecipient(event.target.value)}
                placeholder="+234…"
                value={testRecipient}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Billing owner</span>
              <input
                className={fieldClass}
                onChange={(event) => setBillingOwner(event.target.value)}
                placeholder="Business"
                value={billingOwner}
              />
            </label>
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
