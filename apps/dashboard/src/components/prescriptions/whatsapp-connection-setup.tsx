"use client"

import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { useState } from "react"

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

export function WhatsAppConnectionSetup({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState<string | null>(null)
  const [testRecipient, setTestRecipient] = useState("")
  const selectionToken = searchParams.get("whatsapp_selection") ?? ""
  const connections = useQuery(
    trpc.prescriptions.whatsappConnections.queryOptions(),
  )
  const embedded = useQuery(
    trpc.prescriptions.whatsappEmbeddedSignupUrl.queryOptions({ storeId }),
  )
  const selection = useQuery({
    ...trpc.prescriptions.whatsappEmbeddedSignupSession.queryOptions({
      publicToken: selectionToken,
      storeId,
    }),
    enabled: Boolean(selectionToken),
  })
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

  if (connections.isLoading || embedded.isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-muted" />
  }
  const queryError = connections.error ?? embedded.error
  if (queryError) {
    return (
      <div className="grid gap-3 rounded-xl border border-destructive/30 p-5">
        <p role="alert" className="text-sm text-destructive">
          {queryError.message}
        </p>
        <Button
          className="w-fit"
          onClick={() =>
            void Promise.all([connections.refetch(), embedded.refetch()])
          }
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <section className="grid gap-5 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">Pharmacy WhatsApp connection</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Each pharmacy authorizes its own Meta WhatsApp Business number.
            EwaTrade uses direct Meta Cloud API—not Twilio—and resolves the
            Store sender for every message.
          </p>
        </div>
        {embedded.data?.available && embedded.data.url ? (
          <a
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            href={embedded.data.url}
          >
            Connect with Meta
          </a>
        ) : (
          <Button disabled type="button">
            Embedded signup unavailable
          </Button>
        )}
      </div>
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
            <p role="alert" className="text-sm text-destructive">
              {selection.error.message}
            </p>
          ) : selection.data?.numbers.length ? (
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Test-message recipient</span>
                <input
                  className={fieldClass}
                  onChange={(event) => setTestRecipient(event.target.value)}
                  placeholder="e.g. +234…"
                  value={testRecipient}
                />
                <span className="text-xs text-muted-foreground">
                  Use a consented admin number. Activation requires a successful
                  neutral test message.
                </span>
              </label>
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
      <details className="border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-medium">
          Manual pilot setup
        </summary>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
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
          <input
            className={fieldClass}
            name="businessDisplayName"
            placeholder="Business display name"
          />
          <input
            className={fieldClass}
            name="displayNumber"
            placeholder="Display number"
            required
          />
          <input
            className={fieldClass}
            name="wabaId"
            placeholder="WABA ID"
            required
          />
          <input
            className={fieldClass}
            name="phoneNumberId"
            placeholder="Phone number ID"
            required
          />
          <input
            className={fieldClass}
            name="billingOwner"
            placeholder="Billing owner (optional)"
          />
          <input
            className={fieldClass}
            name="testRecipient"
            placeholder="Consented test-message recipient"
            required
          />
          <input
            autoComplete="off"
            className={fieldClass}
            name="accessToken"
            placeholder="Meta access token"
            required
            type="password"
          />
          <Button
            className="md:col-span-2"
            disabled={connect.isPending}
            type="submit"
          >
            {connect.isPending
              ? "Saving securely…"
              : "Save and test connection"}
          </Button>
        </form>
      </details>
      <p className="text-xs text-muted-foreground">
        Meta conversation/template charges remain owned by the pharmacy’s WABA.
        EwaTrade platform and payment-provider fees are tracked separately.
      </p>
    </section>
  )
}
