"use client"
import {
  Button,
  Input,
  SubmitButton,
  buttonVariants,
  toast,
} from "@ewatrade/ui"

import { ComplianceField } from "@/components/compliance/compliance-form-parts"
import { SettingsSection } from "@/components/settings/settings-page"
import { useTRPC } from "@/trpc/client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { useEffect, useId, useState } from "react"

const CONNECTION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Connected",
  DRAFT: "Not finished",
  RECONNECTING: "Reconnecting",
  REVOKED: "Removed",
  SUSPENDED: "Paused",
  TESTING: "Testing",
}

const MANUAL_FIELDS: Array<{
  autoComplete?: string
  help: string
  label: string
  name: string
  required?: boolean
  type?: string
}> = [
  {
    help: "The name customers see on WhatsApp.",
    label: "Business name (optional)",
    name: "businessDisplayName",
  },
  {
    help: "With the country code, for example +234 801 234 5678.",
    label: "WhatsApp number",
    name: "displayNumber",
    required: true,
  },
  {
    help: "In Meta Business Suite, under WhatsApp accounts.",
    label: "WhatsApp Business account ID",
    name: "wabaId",
    required: true,
  },
  {
    help: "In WhatsApp Manager, under API setup, next to your number.",
    label: "Phone number ID",
    name: "phoneNumberId",
    required: true,
  },
  {
    help: "Who pays Meta for messages, if not the pharmacy.",
    label: "Who pays Meta (optional)",
    name: "billingOwner",
  },
  {
    help: "A number that has agreed to get messages from you. We send it one test message.",
    label: "Number to send a test to",
    name: "testRecipient",
    required: true,
  },
  {
    autoComplete: "new-password",
    help: "A permanent access token from your Meta app. We store it securely.",
    label: "Meta access token",
    name: "accessToken",
    required: true,
    type: "password",
  },
]

export function WhatsAppConnectionSetup({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const ids = useId()
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
      onSuccess: async () => {
        await invalidate()
        setManualSetupOpen(false)
        toast("Number saved. We're sending a test message to check it.")
      },
    }),
  )
  const retest = useMutation(
    trpc.prescriptions.retestWhatsAppConnection.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: async () => {
        await invalidate()
        toast("Testing the number again.")
      },
    }),
  )
  const lifecycle = useMutation(
    trpc.prescriptions.updateWhatsAppConnectionLifecycle.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: async () => {
        await invalidate()
        toast("Number paused.")
      },
    }),
  )
  const suspendBinding = useMutation(
    trpc.prescriptions.suspendWhatsAppStoreBinding.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: async () => {
        await invalidate()
        toast("This store no longer uses this number.")
      },
    }),
  )
  const selectNumber = useMutation(
    trpc.prescriptions.selectWhatsAppEmbeddedSignupNumber.mutationOptions({
      onSuccess: async () => {
        const next = new URL(window.location.href)
        next.searchParams.delete("whatsapp_selection")
        window.history.replaceState({}, "", `${next.pathname}${next.search}`)
        await invalidate()
        toast("Number chosen. We're sending a test message to check it.")
      },
    }),
  )

  const connectAction = embedded.isLoading ? (
    <Button disabled size="sm" type="button">
      Checking…
    </Button>
  ) : embedded.data?.available && embedded.data.url ? (
    <a className={buttonVariants({ size: "sm" })} href={embedded.data.url}>
      Connect with Meta
    </a>
  ) : null

  return (
    <SettingsSection
      title="Pharmacy WhatsApp number"
      description="Connect your pharmacy's own WhatsApp Business number. Messages to customers come from it."
      action={connections.error ? null : connectAction}
    >
      {connections.isLoading ? (
        <div
          className="m-4 h-24 animate-pulse rounded-md bg-muted"
          aria-busy="true"
        />
      ) : connections.error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <p className="text-sm">Couldn't load your WhatsApp numbers.</p>
          <Button
            onClick={() => void connections.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          {embedded.error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
              <p className="min-w-0 flex-[1_1_220px] text-sm">
                We couldn't check Connect with Meta. You can still set up the
                number by hand below.
              </p>
              <Button
                onClick={() => void embedded.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Try again
              </Button>
            </div>
          ) : embedded.data && !embedded.data.available ? (
            <p className="px-4 py-3.5 text-sm text-muted-foreground">
              Connect with Meta isn't available right now. You can set up the
              number by hand below.
            </p>
          ) : null}

          {selectionToken ? (
            <div className="grid gap-3 bg-primary/5 px-4 py-4">
              <div>
                <p className="text-sm font-medium">
                  Choose a WhatsApp number for this store
                </p>
                <p className="text-sm text-muted-foreground">
                  Only the number you choose is used. Your other numbers aren't
                  changed.
                </p>
              </div>
              {selection.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading your numbers…
                </p>
              ) : selection.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {selection.error.message}
                </p>
              ) : selection.data?.numbers.length ? (
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <label
                      htmlFor={`${ids}recipient`}
                      className="text-sm font-medium"
                    >
                      Number to send a test to
                    </label>
                    <p
                      id={`${ids}recipient-help`}
                      className="-mt-1 text-sm text-muted-foreground"
                    >
                      A number that has agreed to get messages from you. We send
                      it one test message to check the connection.
                    </p>
                    <Input
                      aria-describedby={`${ids}recipient-help`}
                      className="max-w-72"
                      id={`${ids}recipient`}
                      inputMode="tel"
                      onChange={(event) => setTestRecipient(event.target.value)}
                      placeholder="+234…"
                      value={testRecipient}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selection.data.numbers.map((number) => (
                      <button
                        className="rounded-md border border-border bg-background p-3 text-left hover:border-primary disabled:opacity-60"
                        disabled={
                          selectNumber.isPending ||
                          testRecipient.trim().length < 7
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
                        <span className="block text-sm font-medium">
                          {number.businessDisplayName || number.displayNumber}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {number.displayNumber}
                        </span>
                      </button>
                    ))}
                  </div>
                  {selectNumber.error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {selectNumber.error.message}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-destructive">
                  This choice has expired. Select Connect with Meta to start
                  again.
                </p>
              )}
            </div>
          ) : null}

          {connections.data?.length ? (
            connections.data.map((connection) => (
              <div className="grid gap-3 px-4 py-3.5" key={connection.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {connection.businessDisplayName ||
                        connection.displayNumber}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {connection.displayNumber} ·{" "}
                      {CONNECTION_STATUS_LABELS[connection.status] ??
                        "Checking"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={retest.isPending}
                      onClick={() =>
                        retest.mutate({ connectionId: connection.id, storeId })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Test again
                    </Button>
                    {connection.bindings.some(
                      (binding) =>
                        binding.storeId === storeId &&
                        binding.status !== "SUSPENDED",
                    ) ? (
                      <Button
                        disabled={suspendBinding.isPending}
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
                        Remove from this store
                      </Button>
                    ) : null}
                    {connection.status !== "REVOKED" ? (
                      <Button
                        disabled={lifecycle.isPending}
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
                        Pause number
                      </Button>
                    ) : null}
                  </div>
                </div>
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  {(
                    [
                      ["Business verified", connection.businessVerified],
                      ["Number verified", connection.numberVerified],
                      ["Receiving messages", connection.webhookSubscribed],
                      ["Sending messages", connection.outboundVerified],
                      ["Message templates approved", connection.templatesReady],
                    ] as const
                  ).map(([label, ready]) => (
                    <div
                      className="flex items-center justify-between gap-2"
                      key={label}
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd
                        className={
                          ready
                            ? "font-medium text-emerald-700 dark:text-emerald-400"
                            : "font-medium text-amber-700 dark:text-amber-400"
                        }
                      >
                        {ready ? "Ready" : "Not yet"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))
          ) : (
            <p className="px-4 py-3.5 text-sm text-muted-foreground">
              No WhatsApp number connected yet.
            </p>
          )}

          <details
            className="group"
            open={manualSetupOpen}
            onToggle={(event) => setManualSetupOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer px-4 py-3.5 text-sm font-medium">
              Set up the number by hand
            </summary>
            <form
              className="grid border-t border-border"
              onSubmit={(event) => {
                event.preventDefault()
                const data = new FormData(event.currentTarget)
                const value = (name: string) => String(data.get(name) ?? "")
                connect.mutate({
                  accessToken: value("accessToken"),
                  billingOwner: value("billingOwner") || undefined,
                  businessDisplayName:
                    value("businessDisplayName") || undefined,
                  displayNumber: value("displayNumber"),
                  phoneNumberId: value("phoneNumberId"),
                  storeId,
                  testRecipient: value("testRecipient"),
                  wabaId: value("wabaId"),
                })
              }}
            >
              <div className="grid sm:grid-cols-2">
                {MANUAL_FIELDS.map((field) => (
                  <ComplianceField
                    help={field.help}
                    helpId={`${ids}${field.name}-help`}
                    htmlFor={`${ids}${field.name}`}
                    key={field.name}
                    label={field.label}
                  >
                    <Input
                      aria-describedby={`${ids}${field.name}-help`}
                      autoComplete={field.autoComplete}
                      id={`${ids}${field.name}`}
                      name={field.name}
                      required={field.required}
                      type={field.type ?? "text"}
                    />
                  </ComplianceField>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3.5 pt-1">
                {connect.error ? (
                  <p
                    role="alert"
                    className="min-w-0 flex-[1_1_220px] text-sm text-destructive"
                  >
                    {connect.error.message}
                  </p>
                ) : null}
                <SubmitButton
                  className="ml-auto"
                  isSubmitting={connect.isPending}
                  size="sm"
                >
                  Save and send a test
                </SubmitButton>
              </div>
            </form>
          </details>

          <p className="px-4 py-3 text-sm text-muted-foreground">
            Meta bills your pharmacy directly for WhatsApp messages. EwaTrade
            and payment fees are separate.
          </p>
        </>
      )}
    </SettingsSection>
  )
}
