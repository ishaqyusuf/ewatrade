"use client"
import {
  Button,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import { FormFeedback } from "@/components/forms/form-feedback"

import { useTRPC } from "@/trpc/client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

export function WhatsAppConnectionSetup({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState<string | null>(null)
  const [manualSetupOpen, setManualSetupOpen] = useState(false)
  const [testRecipient, setTestRecipient] = useState("")
  const selectionToken = searchParams.get("whatsapp_selection") ?? ""
  const connections = useQuery(
    trpc.prescriptions.whatsappConnections.queryOptions(undefined, {
      retry: false,
    }),
  )
  const embedded = useQuery(
    trpc.prescriptions.whatsappEmbeddedSignupUrl.queryOptions(
      { storeId },
      { retry: false },
    ),
  )
  const selection = useQuery({
    ...trpc.prescriptions.whatsappEmbeddedSignupSession.queryOptions({
      publicToken: selectionToken,
      storeId,
    }),
    enabled: Boolean(selectionToken),
    retry: false,
  })
  useEffect(() => {
    if (embedded.error) setManualSetupOpen(true)
  }, [embedded.error])
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.prescriptions.whatsappConnections.queryKey(),
    })
  const connect = useMutation(
    trpc.prescriptions.connectWhatsAppManually.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        setMessage("Connection saved. Readiness testing is running.")
      },
    }),
  )
  const retest = useMutation(
    trpc.prescriptions.retestWhatsAppConnection.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        setMessage("Connection test queued.")
      },
    }),
  )
  const lifecycle = useMutation(
    trpc.prescriptions.updateWhatsAppConnectionLifecycle.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        setMessage("Connection lifecycle updated.")
      },
    }),
  )

  const suspendBinding = useMutation(
    trpc.prescriptions.suspendWhatsAppStoreBinding.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        setMessage("This sender is no longer routed to the current Store.")
      },
    }),
  )
  const selectNumber = useMutation(
    trpc.prescriptions.selectWhatsAppEmbeddedSignupNumber.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        window.history.replaceState({}, "", window.location.pathname)
        await invalidate()
        setMessage("Number selected. Readiness testing is running.")
      },
    }),
  )

  if (connections.isLoading) {
    return <div className="h-64 animate-pulse bg-muted" aria-busy="true" />
  }
  if (connections.error) {
    return (
      <div className="grid gap-3 rounded-none border border-destructive/30 p-5">
        <FormFeedback appearance="dashboard">
          {connections.error.message}
        </FormFeedback>
        <Button
          appearance="form"
          className="w-fit"
          onClick={() => void connections.refetch()}
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <section className="grid gap-5 rounded-none border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">Pharmacy WhatsApp connection</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Each pharmacy authorizes its own Meta WhatsApp Business number.
            EwaTrade uses direct Meta Cloud API—not Twilio—and resolves the
            Store sender for every message.
          </p>
        </div>
        {embedded.isLoading ? (
          <Button appearance="form" disabled type="button">
            Checking Meta signup…
          </Button>
        ) : embedded.data?.available && embedded.data.url ? (
          <a
            className="inline-flex h-10 items-center justify-center rounded-none bg-primary px-4 text-sm font-medium text-primary-foreground"
            href={embedded.data.url}
          >
            Connect with Meta
          </a>
        ) : (
          <Button appearance="form" disabled type="button">
            Embedded signup unavailable
          </Button>
        )}
      </div>
      {embedded.error ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <FormFeedback appearance="dashboard">
            Meta Embedded Signup could not be checked. Manual pilot setup is
            still available below.
          </FormFeedback>
          <Button
            appearance="form"
            onClick={() => void embedded.refetch()}
            type="button"
            variant="outline"
          >
            Retry Meta check
          </Button>
        </div>
      ) : null}
      {message ? <p className="bg-muted px-4 py-3 text-sm">{message}</p> : null}
      {selectionToken ? (
        <section className="grid gap-3 border border-primary/30 bg-primary/5 p-4">
          <div>
            <h3 className="font-medium">Choose the number for this Store</h3>
            <p className="text-sm text-muted-foreground">
              Only the selected pharmacy-owned sender will be bound. Other
              authorized numbers remain unchanged.
            </p>
          </div>
          {selection.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading authorized numbers…
            </p>
          ) : selection.error ? (
            <FormFeedback appearance="dashboard">
              {selection.error.message}
            </FormFeedback>
          ) : selection.data?.numbers.length ? (
            <div className="grid gap-3">
              <ControlField
                label={<>Test-message recipient</>}
                afterControl={
                  <span className="text-xs text-muted-foreground">
                    Use a consented admin number. Activation requires a
                    successful neutral test message.
                  </span>
                }
              >
                <Input
                  onChange={(event) => setTestRecipient(event.target.value)}
                  placeholder="e.g. +234…"
                  value={testRecipient}
                />
              </ControlField>
              <div className="grid gap-2 sm:grid-cols-2">
                {selection.data.numbers.map((number) => (
                  <button
                    className="border border-border bg-background p-3 text-left hover:border-primary disabled:opacity-60"
                    disabled={
                      selectNumber.isPending || testRecipient.trim().length < 7
                    }
                    key={number.phoneNumberId}
                    onClick={() =>
                      selectNumber.mutate({
                        phoneNumberId: number.phoneNumberId,
                        publicToken: selectionToken,
                        storeId,
                        testRecipient,
                      })
                    }
                    type="button"
                  >
                    <span className="block font-medium">
                      {number.businessDisplayName || number.displayNumber}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {number.displayNumber}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-destructive">
              This selection expired or is unavailable. Start Embedded Signup
              again.
            </p>
          )}
        </section>
      ) : null}
      <div className="grid gap-3">
        {connections.data?.length ? (
          connections.data.map((connection) => (
            <article
              className="grid gap-3 border border-border p-4"
              key={connection.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {connection.businessDisplayName || connection.displayNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {connection.displayNumber} ·{" "}
                    {connection.status.toLowerCase().replaceAll("_", " ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    appearance="form"
                    onClick={() =>
                      retest.mutate({ connectionId: connection.id, storeId })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Retest
                  </Button>
                  {connection.bindings.some(
                    (binding) =>
                      binding.storeId === storeId &&
                      binding.status !== "SUSPENDED",
                  ) ? (
                    <Button
                      appearance="form"
                      onClick={() =>
                        suspendBinding.mutate({
                          connectionId: connection.id,
                          storeId,
                        })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Disconnect this Store
                    </Button>
                  ) : null}
                  {connection.status !== "REVOKED" ? (
                    <Button
                      appearance="form"
                      onClick={() =>
                        lifecycle.mutate({
                          connectionId: connection.id,
                          status: "suspended",
                          storeId,
                        })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Suspend sender
                    </Button>
                  ) : null}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                {[
                  ["Business", connection.businessVerified],
                  ["Number", connection.numberVerified],
                  ["Webhook", connection.webhookSubscribed],
                  ["Outbound", connection.outboundVerified],
                  ["Templates", connection.templatesReady],
                ].map(([label, ready]) => (
                  <div className="border border-border p-2" key={String(label)}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd
                      className={ready ? "text-emerald-700" : "text-amber-700"}
                    >
                      {ready ? "Ready" : "Incomplete"}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No pharmacy WhatsApp number is connected.
          </p>
        )}
      </div>
      <details
        className="border-t border-border pt-4"
        open={manualSetupOpen}
        onToggle={(event) => setManualSetupOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium">
          Manual pilot setup
        </summary>
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            connect.mutate({
              accessToken: String(data.get("accessToken") ?? ""),
              billingOwner: String(data.get("billingOwner") ?? "") || undefined,
              businessDisplayName:
                String(data.get("businessDisplayName") ?? "") || undefined,
              displayNumber: String(data.get("displayNumber") ?? ""),
              phoneNumberId: String(data.get("phoneNumberId") ?? ""),
              storeId,
              testRecipient: String(data.get("testRecipient") ?? ""),
              wabaId: String(data.get("wabaId") ?? ""),
            })
          }}
        >
          <FieldGroup className="min-w-0 grid gap-3 md:grid-cols-2">
            <Input
              name="businessDisplayName"
              placeholder="Business display name"
            />
            <Input name="displayNumber" placeholder="Display number" required />
            <Input name="wabaId" placeholder="WABA ID" required />
            <Input
              name="phoneNumberId"
              placeholder="Phone number ID"
              required
            />
            <Input name="billingOwner" placeholder="Billing owner (optional)" />
            <Input
              name="testRecipient"
              placeholder="Consented test-message recipient"
              required
            />
            <Input
              autoComplete="new-password"
              name="accessToken"
              placeholder="Meta access token"
              required
              type="password"
            />
            <FormActions>
              <SubmitButton
                isSubmitting={connect.isPending}
                className="md:col-span-2"
                disabled={connect.isPending}
                type="submit"
              >
                {connect.isPending
                  ? "Saving securely…"
                  : "Save and test connection"}
              </SubmitButton>
            </FormActions>
          </FieldGroup>
        </form>
      </details>
      <p className="text-xs text-muted-foreground">
        Meta conversation/template charges remain owned by the pharmacy’s WABA.
        EwaTrade platform and payment-provider fees are tracked separately.
      </p>
    </section>
  )
}
