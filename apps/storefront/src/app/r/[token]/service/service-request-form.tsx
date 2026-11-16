"use client"

import { useActionState } from "react"

import {
  type StoreConversationServiceFormError,
  type StoreConversationServiceFormState,
  submitStoreConversationServiceAction,
} from "./actions"

export type ServiceRequestFormOffering = {
  defaultQuantity?: string
  guidance: string | null
  id: string
  name: string
  price: string
}

const ERROR_MESSAGES: Record<StoreConversationServiceFormError, string> = {
  contact: "Enter your name and either a phone number or email address.",
  invalid:
    "This Request could not be linked. Return to the conversation and try again.",
  items: "Choose at least one service and enter a quantity.",
  time: "Choose both a day and a time, later than now and within six months, or leave both empty.",
}

const INITIAL_STATE: StoreConversationServiceFormState = {
  error: null,
  submission: 0,
  values: {},
}

export function ServiceRequestForm({
  changeServiceHref,
  clientOperationId,
  conversationId,
  messageId,
  offerings,
  publicToken,
  selectedOfferingId,
}: {
  changeServiceHref: string | null
  clientOperationId: string
  conversationId: string
  messageId: string | null
  offerings: ServiceRequestFormOffering[]
  publicToken: string
  selectedOfferingId: string | null
}) {
  const [state, action, pending] = useActionState(
    submitStoreConversationServiceAction,
    INITIAL_STATE,
  )
  const kept = (name: string, fallback?: string) =>
    state.submission > 0 ? (state.values[name] ?? "") : fallback
  return (
    <>
      {state.error ? (
        <p
          className="mb-5 border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {ERROR_MESSAGES[state.error]}
        </p>
      ) : null}
      {/* Remount after each failed attempt so the kept values reappear after React resets the form. */}
      <form action={action} className="grid gap-6" key={state.submission}>
        <input name="publicToken" type="hidden" value={publicToken} />
        <input name="conversationId" type="hidden" value={conversationId} />
        <input name="messageId" type="hidden" value={messageId ?? ""} />
        <input
          name="serviceOfferingId"
          type="hidden"
          value={selectedOfferingId ?? ""}
        />
        <input
          name="clientOperationId"
          type="hidden"
          value={clientOperationId}
        />
        <section className="grid border border-border">
          <h2 className="p-5 font-semibold">Services</h2>
          {offerings.map((offering) => (
            <div
              className="grid gap-3 border-t border-border p-5 sm:grid-cols-[1fr_110px] sm:items-center"
              key={offering.id}
            >
              <div>
                <p className="font-medium">{offering.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {offering.price}
                </p>
                {offering.guidance ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {offering.guidance}
                  </p>
                ) : null}
              </div>
              <input
                aria-label={`${offering.name} quantity`}
                className="h-11 border border-border bg-background px-3 text-sm"
                defaultValue={kept(
                  `quantity:${offering.id}`,
                  offering.defaultQuantity,
                )}
                inputMode="decimal"
                name={`quantity:${offering.id}`}
                placeholder="Quantity"
              />
            </div>
          ))}
        </section>
        {changeServiceHref ? (
          <a
            className="text-sm underline underline-offset-4"
            href={changeServiceHref}
          >
            Choose another service
          </a>
        ) : null}
        <fieldset className="grid gap-4 border border-border p-5">
          <legend className="px-1 font-semibold">
            Preferred day and time (optional)
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Day
              <input
                className="h-11 border border-border bg-background px-3 text-sm"
                defaultValue={kept("preferredDate")}
                name="preferredDate"
                type="date"
              />
            </label>
            <label className="grid gap-1 text-sm">
              Time
              <input
                className="h-11 border border-border bg-background px-3 text-sm"
                defaultValue={kept("preferredTime")}
                name="preferredTime"
                step={900}
                type="time"
              />
            </label>
          </div>
        </fieldset>
        <section className="grid gap-4 border border-border p-5">
          <h2 className="font-semibold">Contact details</h2>
          <input
            aria-label="Name"
            className="h-11 border border-border bg-background px-3 text-sm"
            defaultValue={kept("customerName")}
            name="customerName"
            placeholder="Name"
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              aria-label="Phone"
              className="h-11 border border-border bg-background px-3 text-sm"
              defaultValue={kept("customerPhone")}
              inputMode="tel"
              name="customerPhone"
              placeholder="Phone"
            />
            <input
              aria-label="Email"
              className="h-11 border border-border bg-background px-3 text-sm"
              defaultValue={kept("customerEmail")}
              inputMode="email"
              name="customerEmail"
              placeholder="Email"
              type="email"
            />
          </div>
          <textarea
            aria-label="Extra details (optional)"
            className="min-h-28 border border-border bg-background p-3 text-sm"
            defaultValue={kept("details")}
            name="details"
            placeholder="Extra details (optional)"
          />
        </section>
        <button
          className="h-12 bg-foreground px-5 font-medium text-background disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Sending…" : "Add Service Request to conversation"}
        </button>
      </form>
    </>
  )
}
