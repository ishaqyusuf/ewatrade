import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import {
  type GeneralAction,
  type GeneralProposal,
  generalActionSummary,
} from "@ewatrade/assistant/general/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { ScrollView } from "react-native"
import { ActionButton } from "../action-button"
import { FullScreenForm } from "../full-screen-form"
import { StatusBanner } from "../status-banner"
import { ProposalCard, ResultCard } from "./assistant-cards"
import { mobileAssistantSystemTitle } from "./assistant-wording"
import { generalReceiptRoute } from "./general-model"
import { GeneralProposalEditor } from "./general-proposal-editor"

type Opened = RouterOutputs["assistant"]["openReceiptApproval"]
type Ready = Extract<Opened, { status: "ready" }>
type Closed = Exclude<Opened, { status: "ready" }>

const RECEIPT_APPROVAL_ID = /^[A-Za-z0-9_-]{1,128}$/

const notices: Record<
  Exclude<Closed["status"], "approved" | "declined">,
  { title: string; message: string }
> = {
  expired: {
    title: "Request expired",
    message: "Ask them to send the receipt again.",
  },
  cancelled: {
    title: "Request cancelled",
    message: "Nothing was saved.",
  },
  scope_mismatch: {
    title: "Another Store's request",
    message: "Switch to the Store this request belongs to, then open it again.",
  },
  unavailable: {
    title: "Request unavailable",
    message: "It may have been removed. Nothing was saved.",
  },
  forbidden: {
    title: "Owners and admins approve",
    message: "Only an owner or admin of this business can approve it.",
  },
}

/**
 * A receipt staff sent for approval (Workshop 19l). Opening drafts the request
 * as your own proposal, so the usual review, edit and confirm apply; approving
 * records it once and tells the person who sent it.
 */
export function ReceiptApprovalScreen({ id }: { id: string | undefined }) {
  const valid = !!id && RECEIPT_APPROVAL_ID.test(id)
  const auth = useAuthContext()
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const open = useMutation(
    trpc.assistant.openReceiptApproval.mutationOptions({ gcTime: 0 }),
  )
  const decideRequest = useMutation(
    trpc.assistant.decideReceiptApproval.mutationOptions(),
  )
  const edit = useMutation(trpc.assistant.editProposal.mutationOptions())
  const [view, setView] = useState<Opened | null>(null)
  const [proposal, setProposal] = useState<GeneralProposal | null>(null)
  const [result, setResult] = useState<
    | { status: "approved"; proposal: GeneralProposal | null }
    | { status: "declined" }
    | null
  >(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const lifetime = useRef(0)
  const identity = `${auth.token}:${auth.profile?.businessId}:${auth.profile?.storeId}:${auth.profile?.role}`

  // biome-ignore lint/correctness/useExhaustiveDependencies: Identity changes and explicit retries reopen the request; each open drafts once.
  useEffect(() => {
    const observed = ++lifetime.current
    setView(null)
    setProposal(null)
    setNotice(null)
    if (!valid) {
      setView({ status: "unavailable" })
      return
    }
    if (!auth.token || offline) return
    void open
      .mutateAsync({ id })
      .then((next) => {
        if (lifetime.current !== observed) return
        setView(next)
        setProposal(next.status === "ready" ? next.proposal : null)
      })
      .catch((error: unknown) => {
        if (lifetime.current === observed)
          setNotice(
            error instanceof Error
              ? error.message
              : "Couldn't open this request. Check your connection.",
          )
      })
    return () => {
      lifetime.current++
    }
  }, [id, valid, identity, offline, retry])

  async function run(task: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      await task()
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't save that. Check the request and try again.",
      )
    } finally {
      setBusy(false)
    }
  }

  const decide = (decision: "approve" | "decline") =>
    run(async () => {
      if (!proposal || !id) return
      const outcome = await decideRequest.mutateAsync({
        id,
        decision,
        proposalId: proposal.id,
        revision: proposal.revision,
        ...(decision === "approve" && proposal.approvalToken
          ? { approvalToken: proposal.approvalToken }
          : {}),
      })
      setResult(
        outcome.status === "approved"
          ? { status: "approved", proposal: outcome.proposal }
          : { status: "declined" },
      )
      void queryClient.invalidateQueries({
        queryKey: trpc.assistant.receiptApprovals.queryKey(),
      })
    })

  const save = (payload: GeneralAction) =>
    run(async () => {
      if (!proposal) return
      const revised = await edit.mutateAsync({
        proposalId: proposal.id,
        revision: proposal.revision,
        payload,
      })
      setProposal(revised)
      setEditing(false)
    })

  const ready: Ready | null = view?.status === "ready" ? view : null
  const closed: Closed | null = view && view.status !== "ready" ? view : null
  const requester = ready?.requestedBy ?? "They"
  const saved = result?.status === "approved" ? result.proposal : null
  const savedRoute =
    saved?.receipt && generalReceiptRoute(saved.receipt, auth.profile?.storeId)

  return (
    <View className="flex-1">
      <ScrollView
        contentContainerClassName="gap-4 px-[18px] pb-10"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {offline && !result ? (
          <StatusBanner
            icon="Wind"
            message="Reconnect to open and approve this request."
            title="You're offline"
            tone="warning"
          />
        ) : null}
        {notice ? (
          <StatusBanner
            actionLabel={view ? undefined : "Try again"}
            icon="AlertCircle"
            message={notice}
            onActionPress={() => setRetry((value) => value + 1)}
            title={view ? "Not saved" : "Couldn't open the request"}
            tone="destructive"
          />
        ) : null}
        {result ? (
          result.status === "approved" ? (
            <View className="gap-3">
              <ResultCard
                title={mobileAssistantSystemTitle(
                  saved?.receipt?.title ?? "Approved and saved",
                )}
                detail={
                  saved?.receipt?.detail ??
                  `Saved. ${requester} will be told in their chat.`
                }
                unavailable={
                  savedRoute
                    ? undefined
                    : `Saved. ${requester} will be told in their chat.`
                }
                onOpen={() => {
                  if (savedRoute) router.push(savedRoute)
                }}
              />
              {savedRoute ? (
                <Text className="text-sm text-muted-foreground">
                  {requester} will be told in their chat.
                </Text>
              ) : null}
            </View>
          ) : (
            <StatusBanner
              icon="CheckCircle2"
              message={`Nothing was saved. ${requester} will be told in their chat.`}
              title="Declined"
              tone="muted"
            />
          )
        ) : ready && proposal ? (
          <>
            <View className="gap-1">
              <Text className="text-[22px] font-extrabold [-rn-line-height:28] text-foreground">
                {ready.requestedBy} sent a {ready.kind} to approve
              </Text>
              <Text className="text-sm text-muted-foreground">
                {ready.businessName} · {ready.storeName}
              </Text>
            </View>
            {ready.summary ? (
              <Text className="text-base text-foreground">{ready.summary}</Text>
            ) : null}
            {ready.facts.length ? (
              <View className="gap-2 rounded-[18px] bg-muted p-3.5">
                <Text className="text-sm font-bold text-foreground">
                  From the receipt
                </Text>
                {ready.facts.map((fact) => (
                  <View key={fact.label} className="flex-row gap-3">
                    <Text className="w-28 text-sm text-muted-foreground">
                      {fact.label}
                    </Text>
                    <Text className="min-w-0 flex-1 text-sm text-foreground">
                      {fact.value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <ProposalCard
              title={mobileAssistantSystemTitle(
                capabilityForAction(proposal.payload.action).title,
              )}
              summary={
                proposal.review?.join("\n") ??
                generalActionSummary(proposal.payload, ready.currencyCode)
              }
              state={
                proposal.status === "COMPLETED"
                  ? "confirmed"
                  : (proposal.status.toLowerCase() as
                      | "pending"
                      | "cancelled"
                      | "expired"
                      | "failed"
                      | "executing")
              }
              disabled={busy || offline}
              confirmDisabled={
                !proposal.approvalToken ||
                new Date(proposal.expiresAt).getTime() <= Date.now()
              }
              confirmLabel="Approve and save"
              cancelLabel="Decline"
              reason={`Nothing is saved until you approve. ${requester} is told either way.`}
              onConfirm={() => void decide("approve")}
              onCancel={() => void decide("decline")}
              onEdit={() => setEditing(true)}
            />
            {proposal.status === "EXPIRED" ? (
              <ActionButton
                variant="outline"
                disabled={busy || offline}
                onPress={() => setRetry((value) => value + 1)}
              >
                Open the request again
              </ActionButton>
            ) : null}
          </>
        ) : closed ? (
          closed.status === "approved" || closed.status === "declined" ? (
            <StatusBanner
              icon="CheckCircle2"
              message={closed.summary || "Nothing more to do."}
              title={
                closed.status === "approved"
                  ? `Already approved by ${closed.decidedBy}`
                  : `Declined by ${closed.decidedBy}`
              }
              tone="muted"
            />
          ) : (
            <StatusBanner
              actionLabel={
                closed.status === "scope_mismatch" ? "Switch Store" : undefined
              }
              icon="AlertCircle"
              message={notices[closed.status].message}
              onActionPress={() =>
                router.push("/business-switch-modal" as never)
              }
              title={notices[closed.status].title}
              tone="muted"
            />
          )
        ) : !notice && !offline ? (
          <View className="gap-3" accessibilityLabel="Opening the request">
            <Skeleton className="h-16 rounded-[18px]" />
            <Skeleton className="h-48 rounded-[18px]" />
          </View>
        ) : null}
      </ScrollView>
      <FullScreenForm
        visible={editing && !!proposal && !!ready}
        title="Edit draft"
        closeLabel="Close draft editor"
        onClose={() => setEditing(false)}
      >
        {notice && editing ? (
          <View className="px-[18px] pb-3">
            <StatusBanner
              title="Draft not saved"
              tone="warning"
              message={notice}
            />
          </View>
        ) : null}
        {proposal && ready ? (
          <GeneralProposalEditor
            key={`${proposal.id}:${proposal.revision}`}
            proposal={proposal}
            currencyCode={ready.currencyCode}
            disabled={busy || offline}
            onSave={(payload) => void save(payload)}
          />
        ) : null}
      </FullScreenForm>
    </View>
  )
}
