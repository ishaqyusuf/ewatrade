"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import { useCustomerChannelParams } from "@/hooks/use-customer-channel-params"
import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import type {
  ServiceCommerceManualWhatsAppConnection,
  ServiceCommerceStoreBindingConfiguration,
} from "@ewatrade/service-commerce"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
} from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState, useSyncExternalStore } from "react"

import { ConnectionForm } from "./connection-form"
import { ConversationAvailabilityForm } from "./conversation-availability-form"
import { ConversationModeForm } from "./conversation-mode-form"
import { EmbeddedSignupSelection } from "./embedded-signup-selection"
import { EntryPointCard } from "./entry-point-card"
import { QuoteApprovalForm } from "./quote-approval-form"
import { QuoteReleasePolicyForm } from "./quote-release-policy-form"
import { StoreBindingForm } from "./store-binding-form"
import { TeamRoutingForm } from "./team-routing-form"

const subscribeToHydration = () => () => undefined

export function CustomerChannelSheetContent({
  mode,
  registerFormReset,
  storeId,
}: {
  mode:
    | "availability"
    | "conversation_mode"
    | "connection"
    | "entry_point"
    | "quote_approval"
    | "quote_policy"
    | "team"
  registerFormReset: RegisterServiceCommerceFormReset
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useServiceCommerceParams()
  const channelParams = useCustomerChannelParams()
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  const [message, setMessage] = useState<string | null>(null)
  const policyOperationId = useRef(crypto.randomUUID())
  const approvalDecisionId = useRef(crypto.randomUUID())
  const rejectionDecisionId = useRef(crypto.randomUUID())
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
    enabled:
      mode === "connection" &&
      channelParams.whatsapp !== "select-number" &&
      Boolean(workspace.data?.access.canManage),
    retry: false,
  })
  const selection = useQuery({
    ...trpc.serviceCommerce.channelEmbeddedSignupSession.queryOptions({
      storeId,
    }),
    enabled:
      mode === "connection" &&
      channelParams.whatsapp === "select-number" &&
      Boolean(workspace.data?.access.canManage),
    retry: false,
  })
  const releaseSettings = useQuery({
    ...trpc.serviceCommerce.quoteReleaseSettings.queryOptions({ storeId }),
    enabled: mode === "quote_policy",
    retry: false,
  })
  const availabilitySettings = useQuery({
    ...trpc.serviceCommerce.storeConversationAvailabilitySettings.queryOptions({
      storeId,
    }),
    enabled: mode === "availability",
    retry: false,
  })
  const conversationModeSettings = useQuery({
    ...trpc.serviceCommerce.storeConversationChannelModeSettings.queryOptions({
      storeId,
    }),
    enabled: mode === "conversation_mode",
    retry: false,
  })
  const approvalDetail = useQuery({
    ...trpc.serviceCommerce.quoteApprovalDetail.queryOptions({
      approvalId: params.quoteApprovalId ?? "",
      storeId,
    }),
    enabled: mode === "quote_approval" && Boolean(params.quoteApprovalId),
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

  const invalidateQuoteApproval = async () => {
    const invalidations: Array<Promise<unknown>> = [
      queryClient.invalidateQueries({
        exact: true,
        queryKey: trpc.serviceCommerce.pendingQuoteApprovals.queryKey({
          storeId,
        }),
      }),
    ]
    if (approvalDetail.data) {
      invalidations.push(
        queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.sourceProjection.queryKey({
            source: {
              id: approvalDetail.data.sourceId,
              kind: approvalDetail.data.sourceKind,
            },
            storeId,
          }),
        }),
      )
    }
    if (params.quoteApprovalId) {
      invalidations.push(
        queryClient.invalidateQueries({
          exact: true,
          queryKey: trpc.serviceCommerce.quoteApprovalDetail.queryKey({
            approvalId: params.quoteApprovalId,
            storeId,
          }),
        }),
      )
    }
    await Promise.all(invalidations)
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
  const updateQuotePolicy = useMutation(
    trpc.serviceCommerce.updateQuoteReleaseSettings.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            exact: true,
            queryKey: trpc.serviceCommerce.quoteReleaseSettings.queryKey({
              storeId,
            }),
          }),
          invalidateQuoteApproval(),
        ])
        policyOperationId.current = crypto.randomUUID()
        setMessage("Quotation approval policy saved.")
      },
    }),
  )
  const approveQuote = useMutation(
    trpc.serviceCommerce.approveQuoteVersion.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidateQuoteApproval()
        approvalDecisionId.current = crypto.randomUUID()
        setMessage("Quotation approved and released to the customer.")
      },
    }),
  )
  const rejectQuote = useMutation(
    trpc.serviceCommerce.rejectQuoteVersion.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidateQuoteApproval()
        rejectionDecisionId.current = crypto.randomUUID()
        setMessage("Quotation version rejected. It remains private.")
      },
    }),
  )

  if (
    !hydrated ||
    workspace.isLoading ||
    (mode === "availability" && availabilitySettings.isLoading) ||
    (mode === "conversation_mode" && conversationModeSettings.isLoading) ||
    (mode === "quote_policy" && releaseSettings.isLoading) ||
    (mode === "quote_approval" && approvalDetail.isLoading)
  ) {
    return <div className="h-72 animate-pulse rounded-xl bg-muted" />
  }
  const error =
    workspace.error ??
    (mode === "availability" ? availabilitySettings.error : null) ??
    (mode === "conversation_mode" ? conversationModeSettings.error : null) ??
    (mode === "quote_policy" ? releaseSettings.error : null) ??
    (mode === "quote_approval" ? approvalDetail.error : null)
  if (error || !workspace.data) {
    return (
      <div className="grid gap-3">
        <FormFeedback appearance="dashboard">
          {error?.message ?? "Customer channel settings are unavailable."}
        </FormFeedback>
        <Button
          className="w-fit"
          onClick={() =>
            void Promise.all([
              workspace.refetch(),
              mode === "availability"
                ? availabilitySettings.refetch()
                : Promise.resolve(),
              mode === "conversation_mode"
                ? conversationModeSettings.refetch()
                : Promise.resolve(),
              mode === "quote_policy"
                ? releaseSettings.refetch()
                : Promise.resolve(),
              mode === "quote_approval"
                ? approvalDetail.refetch()
                : Promise.resolve(),
            ])
          }
          variant="outline"
          appearance="form"
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
    revokeEntry.isPending ||
    updateQuotePolicy.isPending ||
    approveQuote.isPending ||
    rejectQuote.isPending

  return (
    <div className="grid gap-5">
      <SetupProgress active={mode} />
      {message ? (
        <FormFeedback variant="default" appearance="dashboard">
          {message}
        </FormFeedback>
      ) : null}

      {mode === "availability" && availabilitySettings.data ? (
        <ConversationAvailabilityForm
          onMessage={setMessage}
          registerReset={registerFormReset}
          settings={availabilitySettings.data}
          storeId={storeId}
        />
      ) : null}

      {mode === "conversation_mode" && conversationModeSettings.data ? (
        <ConversationModeForm
          onMessage={setMessage}
          registerReset={registerFormReset}
          settings={conversationModeSettings.data}
          storeId={storeId}
        />
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
          embeddedSignupError={!!embedded.error}
          embeddedSignupLoading={embedded.isFetching}
          error={saveConnection.error?.message}
          isPending={saveConnection.isPending}
          onRetryEmbeddedSignup={() => void embedded.refetch()}
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
              appearance="form"
            >
              Retest connection
            </Button>
            <Button
              onClick={() => setConnectionAction("suspended")}
              variant="outline"
              appearance="form"
            >
              Suspend
            </Button>
            <Button
              onClick={() => setConnectionAction("revoked")}
              variant="outline"
              appearance="form"
            >
              Revoke
            </Button>
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
      {mode === "quote_policy" && releaseSettings.data ? (
        <QuoteReleasePolicyForm
          isPending={updateQuotePolicy.isPending}
          onSubmit={(values) =>
            updateQuotePolicy.mutate({
              ...values,
              clientOperationId: policyOperationId.current,
              expectedRevision: releaseSettings.data.policy.revision,
              storeId,
            })
          }
          settings={releaseSettings.data}
        />
      ) : null}
      {mode === "quote_approval" && approvalDetail.data ? (
        <QuoteApprovalForm
          approval={approvalDetail.data}
          isPending={approveQuote.isPending || rejectQuote.isPending}
          onApprove={(values) =>
            approveQuote.mutateAsync({
              approvalId: approvalDetail.data.id,
              clientDecisionId: approvalDecisionId.current,
              expectedPolicyRevision: approvalDetail.data.policyRevision,
              quoteId: approvalDetail.data.quoteId,
              quoteVersionId: approvalDetail.data.quoteVersionId,
              reason: values.reason,
              storeId,
            })
          }
          onReject={(values) =>
            rejectQuote.mutateAsync({
              approvalId: approvalDetail.data.id,
              clientDecisionId: rejectionDecisionId.current,
              expectedPolicyRevision: approvalDetail.data.policyRevision,
              quoteId: approvalDetail.data.quoteId,
              quoteVersionId: approvalDetail.data.quoteVersionId,
              reason: values.reason,
              storeId,
            })
          }
        />
      ) : null}
      {mode === "connection" && selectedConnection ? (
        <AlertDialog
          open={connectionAction !== null}
          onOpenChange={(open) => {
            if (!open && !lifecycle.isPending) setConnectionAction(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogTitle className="text-lg font-medium">
              {connectionAction === "revoked"
                ? "Revoke this connection?"
                : "Suspend this connection?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {connectionAction === "revoked"
                ? "Revocation is permanent. Current Store routes will stop using this connection."
                : "Current Store routes will stop using this connection until it is reactivated."}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={lifecycle.isPending}>
                Cancel
              </AlertDialogCancel>
              <Button
                appearance="form"
                disabled={lifecycle.isPending}
                onClick={() => {
                  if (!connectionAction) return
                  lifecycle.mutate({
                    connectionId: selectedConnection.id,
                    status: connectionAction,
                    storeId,
                  })
                }}
                type="button"
                variant="destructive"
              >
                {lifecycle.isPending
                  ? "Updating…"
                  : connectionAction === "revoked"
                    ? "Revoke connection"
                    : "Suspend connection"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}

function SetupProgress({
  active,
}: {
  active:
    | "availability"
    | "conversation_mode"
    | "connection"
    | "entry_point"
    | "quote_approval"
    | "quote_policy"
    | "team"
}) {
  const steps = [
    { active: active === "availability", label: "Availability" },
    { active: active === "conversation_mode", label: "Channel mode" },
    { active: active === "connection", label: "Setup & configure" },
    { active: active === "connection", label: "Test" },
    {
      active:
        active === "team" ||
        active === "quote_policy" ||
        active === "quote_approval",
      label: "Team & approval",
    },
    { active: active === "entry_point", label: "Publish" },
  ]
  return (
    <ol
      aria-label="Customer channel setup progress"
      className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6"
    >
      {steps.map((step, index) => (
        <li
          className={`rounded-md border px-3 py-2 ${step.active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}
          key={step.label}
        >
          {index + 1}. {step.label}
        </li>
      ))}
    </ol>
  )
}

function SheetError({ message }: { message: string }) {
  return <FormFeedback appearance="dashboard">{message}</FormFeedback>
}
