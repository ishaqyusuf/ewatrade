"use client"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import { useCustomerChannelParams } from "@/hooks/use-customer-channel-params"
import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import type {
  ServiceCommerceManualWhatsAppConnection,
  ServiceCommerceStoreBindingConfiguration,
} from "@ewatrade/service-commerce"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { ConnectionForm } from "./connection-form"
import { EmbeddedSignupSelection } from "./embedded-signup-selection"
import { EntryPointCard } from "./entry-point-card"
import { StoreBindingForm } from "./store-binding-form"
import { TeamRoutingForm } from "./team-routing-form"

export function CustomerChannelSheetContent({
  mode,
  registerFormReset,
  storeId,
}: {
  mode: "connection" | "entry_point" | "team"
  registerFormReset: RegisterServiceCommerceFormReset
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useServiceCommerceParams()
  const channelParams = useCustomerChannelParams()
  const [message, setMessage] = useState<string | null>(null)
  const [connectionAction, setConnectionAction] = useState<
    "revoked" | "suspended" | null
  >(null)
  const workspace = useQuery(
    trpc.serviceCommerce.channelWorkspace.queryOptions(
      { storeId },
      { retry: false },
    ),
  )
  const embedded = useQuery({
    ...trpc.serviceCommerce.channelEmbeddedSignupUrl.queryOptions({ storeId }),
    enabled: mode === "connection",
    retry: false,
  })
  const selection = useQuery({
    ...trpc.serviceCommerce.channelEmbeddedSignupSession.queryOptions({
      storeId,
    }),
    enabled:
      mode === "connection" && channelParams.whatsapp === "select-number",
    retry: false,
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        exact: true,
        queryKey: trpc.serviceCommerce.channelWorkspace.queryKey({ storeId }),
      }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: trpc.serviceCommerce.workspaceAccess.queryKey({ storeId }),
      }),
    ])
  }
  const succeeded = async (nextMessage: string) => {
    await invalidate()
    setMessage(nextMessage)
  }

  const saveConnection = useMutation(
    trpc.serviceCommerce.saveCustomerWhatsAppConnection.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () =>
        succeeded("Connection candidate saved. Readiness testing is running."),
    }),
  )
  const completeSignup = useMutation(
    trpc.serviceCommerce.completeChannelEmbeddedSignup.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        await channelParams.setParams({ whatsapp: null })
        setMessage("Number selected. Readiness testing is running.")
      },
    }),
  )
  const saveBindings = useMutation(
    trpc.serviceCommerce.saveCustomerChannelBindings.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () =>
        succeeded("Store assignments saved. Retest to promote new routes."),
    }),
  )
  const retest = useMutation(
    trpc.serviceCommerce.retestCustomerChannelConnection.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () => succeeded("Connection readiness test queued."),
    }),
  )
  const lifecycle = useMutation(
    trpc.serviceCommerce.setCustomerChannelConnectionLifecycle.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidate()
        setConnectionAction(null)
        setMessage("Connection lifecycle updated.")
      },
    }),
  )
  const assign = useMutation(
    trpc.serviceCommerce.assignChannelAttendant.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () => succeeded("Attendant assigned to this Store."),
    }),
  )
  const revokeAttendant = useMutation(
    trpc.serviceCommerce.revokeChannelAttendant.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () =>
        succeeded("Attendant removed from future customer routing."),
    }),
  )
  const publish = useMutation(
    trpc.serviceCommerce.publishCustomerEntryPoint.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () => succeeded("Customer entry link and QR are ready."),
    }),
  )
  const revokeEntry = useMutation(
    trpc.serviceCommerce.revokeCustomerEntryPoint.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: () => succeeded("Customer entry link revoked."),
    }),
  )

  if (workspace.isLoading || (mode === "connection" && embedded.isLoading)) {
    return <div className="h-72 animate-pulse rounded-xl bg-muted" />
  }
  const error = workspace.error ?? embedded.error
  if (error || !workspace.data) {
    return (
      <div className="grid gap-3">
        <p
          className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {error?.message ?? "Customer channel settings are unavailable."}
        </p>
        <Button
          className="w-fit"
          onClick={() =>
            void Promise.all([workspace.refetch(), embedded.refetch()])
          }
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }

  const data = workspace.data
  const selectedConnection = data.connections.find(
    (connection) => connection.id === params.connectionId,
  )
  if (params.connectionId && !selectedConnection) {
    return (
      <SheetError message="This connection is stale or no longer authorized." />
    )
  }
  const pending =
    saveConnection.isPending ||
    completeSignup.isPending ||
    saveBindings.isPending ||
    retest.isPending ||
    lifecycle.isPending ||
    assign.isPending ||
    revokeAttendant.isPending ||
    publish.isPending ||
    revokeEntry.isPending

  return (
    <div className="grid gap-5">
      <SetupProgress active={mode} />
      {message ? (
        <output className="rounded-lg bg-muted px-4 py-3 text-sm">
          {message}
        </output>
      ) : null}

      {mode === "connection" && channelParams.whatsapp === "select-number" ? (
        <EmbeddedSignupSelection
          error={selection.error?.message}
          isLoading={selection.isLoading}
          isPending={completeSignup.isPending}
          numbers={selection.data?.numbers ?? []}
          onSelect={(values) => completeSignup.mutate({ ...values, storeId })}
          registerReset={registerFormReset}
        />
      ) : null}
      {mode === "connection" &&
      channelParams.whatsapp !== "select-number" &&
      !selectedConnection ? (
        <ConnectionForm
          embeddedSignupUrl={embedded.data?.url ?? null}
          error={saveConnection.error?.message}
          isPending={saveConnection.isPending}
          onSubmit={(values: ServiceCommerceManualWhatsAppConnection) =>
            saveConnection.mutate({ ...values, storeId })
          }
          registerReset={registerFormReset}
        />
      ) : null}
      {mode === "connection" && selectedConnection ? (
        <div className="grid gap-4">
          <StoreBindingForm
            connection={selectedConnection}
            isPending={saveBindings.isPending}
            onCancel={() => void params.setParams({ connectionId: null })}
            onSubmit={(values: ServiceCommerceStoreBindingConfiguration) =>
              saveBindings.mutate(values)
            }
            registerReset={registerFormReset}
            stores={data.stores}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                retest.mutate({ connectionId: selectedConnection.id, storeId })
              }
              variant="outline"
            >
              Retest connection
            </Button>
            {connectionAction ? (
              <>
                <p className="basis-full text-sm text-destructive" role="alert">
                  Confirm{" "}
                  {connectionAction === "revoked"
                    ? "permanent revocation"
                    : "suspension"}
                  . Current Store routes will stop using this connection.
                </p>
                <Button
                  disabled={pending}
                  onClick={() =>
                    lifecycle.mutate({
                      connectionId: selectedConnection.id,
                      status: connectionAction,
                      storeId,
                    })
                  }
                  variant="destructive"
                >
                  Confirm{" "}
                  {connectionAction === "revoked" ? "revoke" : "suspend"}
                </Button>
                <Button
                  onClick={() => setConnectionAction(null)}
                  variant="outline"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => setConnectionAction("suspended")}
                  variant="outline"
                >
                  Suspend
                </Button>
                <Button
                  onClick={() => setConnectionAction("revoked")}
                  variant="outline"
                >
                  Revoke
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {mode === "team" ? (
        <TeamRoutingForm
          isPending={pending}
          onAssign={(values) => assign.mutate({ ...values, storeId })}
          onRevoke={(assignment) =>
            revokeAttendant.mutate({
              assignmentId: assignment.id,
              expectedRevision: assignment.revision,
              reason: "Removed from customer request routing",
              storeId,
            })
          }
          registerReset={registerFormReset}
          team={data.team}
          teamOptions={data.teamOptions}
        />
      ) : null}
      {mode === "entry_point" ? (
        <EntryPointCard
          canManage={data.access.canManage}
          entryPoint={data.entryPoint}
          isPending={pending}
          onPublish={() => publish.mutate({ storeId })}
          onRevoke={() => {
            if (!data.entryPoint) return
            revokeEntry.mutate({
              entryPointId: data.entryPoint.id,
              expectedRevision: data.entryPoint.revision,
              reason: "Revoked from Customer channels",
              storeId,
            })
          }}
          readiness={data.readiness}
          team={data.team}
        />
      ) : null}
    </div>
  )
}

function SetupProgress({
  active,
}: {
  active: "connection" | "entry_point" | "team"
}) {
  const steps = [
    { active: active === "connection", label: "Setup & configure" },
    { active: active === "connection", label: "Test" },
    { active: active === "team", label: "Assign team" },
    { active: active === "entry_point", label: "Publish" },
  ]
  return (
    <ol
      aria-label="Customer channel setup progress"
      className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"
    >
      {steps.map((step, index) => (
        <li
          className={`rounded-lg border px-3 py-2 ${step.active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}
          key={step.label}
        >
          {index + 1}. {step.label}
        </li>
      ))}
    </ol>
  )
}

function SheetError({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  )
}
