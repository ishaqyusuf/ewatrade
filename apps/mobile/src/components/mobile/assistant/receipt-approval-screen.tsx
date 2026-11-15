import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type {
  GeneralAction,
  GeneralProposal,
} from "@ewatrade/assistant/general/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react"
import { ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "../action-button"
import { FullScreenForm } from "../full-screen-form"
import { StatusBanner } from "../status-banner"
import { generalReceiptRoute } from "./general-model"
import { GeneralProposalEditor } from "./general-proposal-editor"
import {
  type ApprovalRow,
  type ApprovalSummary,
  approvalSummary,
  approvalWhen,
  receiptSlip,
} from "./receipt-approval-model"

type Opened = RouterOutputs["assistant"]["openReceiptApproval"]
type Ready = Extract<Opened, { status: "ready" }>
type Closed = Exclude<Opened, { status: "ready" }>

const RECEIPT_APPROVAL_ID = /^[A-Za-z0-9_-]{1,128}$/

const notices: Record<
  Exclude<Closed["status"], "approved" | "declined">,
  { icon: IconKeys; tint: GreenTillTint; title: string; message: string }
> = {
  expired: {
    icon: "Hourglass",
    tint: "amber",
    title: "Request expired",
    message: "Ask them to send the receipt again.",
  },
  cancelled: {
    icon: "Ban",
    tint: "amber",
    title: "Request cancelled",
    message: "Nothing was saved.",
  },
  scope_mismatch: {
    icon: "Store",
    tint: "sky",
    title: "Another Store's request",
    message: "Switch to the Store this request belongs to, then open it again.",
  },
  unavailable: {
    icon: "AlertCircle",
    tint: "amber",
    title: "Request unavailable",
    message: "It may have been removed. Nothing was saved.",
  },
  forbidden: {
    icon: "AlertCircle",
    tint: "amber",
    title: "Owners and admins approve",
    message: "Only an owner or admin of this business can approve it.",
  },
}

const capitalized = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

/**
 * A receipt staff sent for approval (Workshop 19l; layout: Workshop
 * mobile/receipt-approval 03 · Summary card). Opening drafts the request as
 * your own proposal, so the usual edit and confirm apply; approving records it
 * once and tells the person who sent it.
 */
export function ReceiptApprovalScreen({ id }: { id: string | undefined }) {
  const valid = !!id && RECEIPT_APPROVAL_ID.test(id)
  const auth = useAuthContext()
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const colors = useColors()
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
  const [busy, setBusy] = useState<"approve" | "decline" | "edit" | null>(null)
  const [expanded, setExpanded] = useState(false)
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

  async function run(
    kind: "approve" | "decline" | "edit",
    task: () => Promise<void>,
  ) {
    if (busy) return
    setBusy(kind)
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
      setBusy(null)
    }
  }

  const decide = (decision: "approve" | "decline") =>
    run(decision, async () => {
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
    run("edit", async () => {
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
  const summary =
    ready && proposal
      ? approvalSummary((saved ?? proposal).payload, ready.currencyCode)
      : null
  const slip = ready ? receiptSlip(ready.facts) : null
  const draftOpen =
    proposal?.status === "PENDING" &&
    !!proposal.approvalToken &&
    new Date(proposal.expiresAt).getTime() > Date.now()
  const locked = !!busy || offline
  const footerPadding = { paddingBottom: Math.max(insets.bottom, 12) + 8 }

  let body: ReactNode = null
  let footer: ReactNode = null
  if (result && summary) {
    const approved = result.status === "approved"
    body = (
      <>
        <SummaryCard
          avatar={
            approved
              ? { icon: "Check", tint: "mint" }
              : { icon: "Ban", tint: "muted" }
          }
          title={
            approved
              ? (saved?.receipt?.title ??
                `${capitalized(ready?.kind ?? "receipt")} recorded`)
              : "Declined"
          }
          summary={summary}
          rows={summary.rows}
          inline
        />
        <Caption>
          {approved
            ? `${requester} will be told in their chat.`
            : `Nothing was saved. ${requester} will be told in their chat.`}
        </Caption>
      </>
    )
    if (approved && savedRoute)
      footer = (
        <ActionButton
          trailingIcon="ArrowRight"
          onPress={() => router.push(savedRoute)}
        >
          Open record
        </ActionButton>
      )
  } else if (ready && proposal && summary) {
    body = (
      <>
        <Heading>
          {ready.requestedBy} sent a {ready.kind} to approve
        </Heading>
        <SummaryCard
          avatar={{ icon: "Receipt", tint: "amber" }}
          pill={busy === "approve" ? "Saving" : "To approve"}
          summary={summary}
          rows={[
            ...summary.rows,
            {
              label: "Sent",
              value: approvalWhen(ready.requestedAt),
              detail: ready.storeName,
            },
          ]}
        >
          {slip && (slip.amount || slip.rows.length) ? (
            <ReceiptDetails
              caption={slip.caption}
              expanded={expanded}
              onToggle={() => setExpanded((value) => !value)}
              amount={slip.amount}
              rows={slip.rows}
            />
          ) : null}
        </SummaryCard>
        <Caption>
          {draftOpen
            ? `Nothing is saved until you approve. ${requester} is told either way.`
            : "This draft timed out. Open the request again to approve it."}
        </Caption>
      </>
    )
    footer = draftOpen ? (
      <>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <ActionButton
              variant="outline"
              icon="SquarePen"
              disabled={locked}
              onPress={() => setEditing(true)}
            >
              Edit
            </ActionButton>
          </View>
          <View className="flex-[1.5]">
            <ActionButton
              tone="gold"
              icon="Check"
              disabled={locked}
              isLoading={busy === "approve"}
              loadingLabel="Approving…"
              onPress={() => void decide("approve")}
            >
              Approve and save
            </ActionButton>
          </View>
        </View>
        <ActionButton
          variant="destructive"
          disabled={locked}
          isLoading={busy === "decline"}
          onPress={() => void decide("decline")}
        >
          Decline
        </ActionButton>
      </>
    ) : (
      <ActionButton
        variant="outline"
        disabled={locked}
        onPress={() => setRetry((value) => value + 1)}
      >
        Open the request again
      </ActionButton>
    )
  } else if (closed) {
    const decided = closed.status === "approved" || closed.status === "declined"
    const shown = decided
      ? {
          icon: (closed.status === "approved"
            ? "CheckCircle2"
            : "Ban") as IconKeys,
          tint: (closed.status === "approved" ? "mint" : "muted") as
            | GreenTillTint
            | "muted",
          title:
            closed.status === "approved"
              ? `Already approved by ${closed.decidedBy}`
              : `Declined by ${closed.decidedBy}`,
          message: closed.summary || "Nothing more to do.",
        }
      : notices[closed.status]
    body = (
      <NoticeCard
        icon={shown.icon}
        tint={shown.tint}
        title={shown.title}
        message={shown.message}
        action={
          closed.status === "scope_mismatch"
            ? {
                label: "Switch Store",
                onPress: () => router.push("/business-switch-modal" as never),
              }
            : undefined
        }
      />
    )
  } else if (offline) {
    body = (
      <NoticeCard
        icon="Wind"
        tint="amber"
        title="You're offline"
        message="Reconnect to open and approve this request."
      />
    )
  } else if (!notice) {
    body = (
      <View className="gap-4" accessibilityLabel="Opening the request">
        <Skeleton className="h-7 w-4/5 rounded-md" />
        <Skeleton className="h-64 rounded-[20px]" />
      </View>
    )
  }

  return (
    <View className="flex-1">
      <ScrollView
        contentContainerClassName="gap-3.5 px-[18px] pb-8"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
        {offline && (ready || result) ? (
          <StatusBanner
            icon="Wind"
            message="Reconnect to approve or decline."
            title="You're offline"
            tone="warning"
          />
        ) : null}
        {body}
      </ScrollView>
      {footer ? (
        // style only: a ui View drops its className when given a style.
        <View
          style={{
            backgroundColor: colors.background,
            gap: 10,
            paddingHorizontal: 16,
            paddingTop: 12,
            ...footerPadding,
          }}
        >
          {footer}
        </View>
      ) : null}
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
            disabled={locked}
            onSave={(payload) => void save(payload)}
          />
        ) : null}
      </FullScreenForm>
    </View>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      className="text-[22px] font-extrabold [-rn-line-height:28] text-foreground"
    >
      {children}
    </Text>
  )
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <Text className="px-1 text-sm [-rn-line-height:20] text-muted-foreground">
      {children}
    </Text>
  )
}

function useTintColors(tint: GreenTillTint | "muted") {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const colors = useColors()
  if (tint === "muted") return { bg: colors.muted, fg: colors.mutedForeground }
  return { bg: palette[tint], fg: palette[`${tint}Foreground`] }
}

function Avatar({
  icon,
  tint,
}: {
  icon: IconKeys
  tint: GreenTillTint | "muted"
}) {
  const colors = useTintColors(tint)
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.bg,
        borderRadius: 21,
        height: 42,
        justifyContent: "center",
        width: 42,
      }}
    >
      <Icon className="size-[20px]" color={colors.fg} name={icon} />
    </View>
  )
}

function Route({ summary }: { summary: ApprovalSummary }) {
  const colors = useColors()
  if (summary.from || summary.to)
    return (
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text className="text-sm [-rn-line-height:20] text-muted-foreground">
          {summary.from ?? "An account"}
        </Text>
        <Icon
          className="size-[14px]"
          color={colors.mutedForeground}
          name="ArrowRight"
        />
        <Text className="text-sm [-rn-line-height:20] text-muted-foreground">
          {summary.to ?? "an account"}
        </Text>
      </View>
    )
  return summary.line ? (
    <Text className="text-sm [-rn-line-height:20] text-muted-foreground">
      {summary.line}
    </Text>
  ) : null
}

/** The draft in one card: amount, accounts, then labelled rows. */
function SummaryCard({
  avatar,
  children,
  inline = false,
  pill,
  rows,
  summary,
  title,
}: {
  avatar: { icon: IconKeys; tint: GreenTillTint | "muted" }
  children?: ReactNode
  /** Result states: the title leads and the amount joins the route line. */
  inline?: boolean
  pill?: string
  rows: ApprovalRow[]
  summary: ApprovalSummary
  title?: string
}) {
  const amber = useTintColors("amber")
  return (
    <View className="overflow-hidden rounded-[20px] bg-card shadow-sm">
      <View className="flex-row items-center gap-3 px-3.5 pb-3.5 pt-4">
        <Avatar icon={avatar.icon} tint={avatar.tint} />
        <View className="min-w-0 flex-1 gap-0.5">
          {inline ? (
            <>
              <Text className="text-base font-extrabold [-rn-line-height:22] text-foreground">
                {title}
              </Text>
              <View className="flex-row flex-wrap items-center gap-1.5">
                {summary.amount ? (
                  <Text className="text-sm [-rn-line-height:20] text-muted-foreground">
                    {summary.amount} ·
                  </Text>
                ) : null}
                <Route summary={summary} />
              </View>
            </>
          ) : (
            <>
              <View className="flex-row items-center justify-between gap-2">
                <Text
                  numberOfLines={1}
                  className="min-w-0 flex-1 text-2xl font-extrabold tracking-tight [-rn-line-height:30] text-foreground"
                >
                  {summary.amount ?? "Amount pending"}
                </Text>
                {pill ? (
                  <View
                    style={{
                      backgroundColor: amber.bg,
                      borderRadius: 999,
                      justifyContent: "center",
                      minHeight: 26,
                      paddingHorizontal: 9,
                    }}
                  >
                    <Text
                      style={{
                        color: amber.fg,
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      {pill}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Route summary={summary} />
            </>
          )}
        </View>
      </View>
      {rows.length ? (
        <View className="border-t border-border px-3.5">
          {rows.map((row, index) => (
            <Fragment key={row.label}>
              {index > 0 ? <View className="h-px bg-border" /> : null}
              <View className="min-h-11 flex-row items-start justify-between gap-3 py-2.5">
                <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
                  {row.label}
                </Text>
                <View className="min-w-0 flex-1 items-end">
                  <Text className="text-right text-[15px] font-bold [-rn-line-height:22] text-foreground">
                    {row.value}
                  </Text>
                  {row.detail ? (
                    <Text className="text-right text-[13px] [-rn-line-height:20] text-muted-foreground">
                      {row.detail}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Fragment>
          ))}
        </View>
      ) : null}
      {children}
    </View>
  )
}

/** "Receipt details" expands the receipt as read, on paper. */
function ReceiptDetails({
  amount,
  caption,
  expanded,
  onToggle,
  rows,
}: {
  amount: string | null
  caption: string
  expanded: boolean
  onToggle: () => void
  rows: ApprovalRow[]
}) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const paper = colorScheme === "dark" ? palette.paper : palette.paperBand
  return (
    <View className="border-t border-border">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={
          expanded ? "Hide receipt details" : "Show receipt details"
        }
        className="min-h-14 flex-row items-center gap-3 px-3.5 py-3 active:bg-accent"
        haptic
        onPress={onToggle}
      >
        <View className="size-8 items-center justify-center rounded-[10px] bg-muted">
          <Icon
            className="size-[16px]"
            color={colors.mutedForeground}
            name="Receipt"
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold [-rn-line-height:21] text-foreground">
            Receipt details
          </Text>
          {caption ? (
            <Text
              numberOfLines={1}
              className="text-[13px] [-rn-line-height:18] text-muted-foreground"
            >
              {caption}
            </Text>
          ) : null}
        </View>
        <View
          style={expanded ? { transform: [{ rotate: "180deg" }] } : undefined}
        >
          <Icon
            className="size-[18px]"
            color={colors.mutedForeground}
            name="ChevronDown"
          />
        </View>
      </Pressable>
      {expanded ? (
        <View className="px-3.5 pb-4">
          <View
            style={{
              backgroundColor: paper,
              borderColor: palette.paperLine,
              borderTopLeftRadius: 6,
              borderTopRightRadius: 6,
              borderWidth: colorScheme === "dark" ? 0 : 1,
              borderBottomWidth: 0,
              paddingHorizontal: 14,
              paddingTop: 14,
              paddingBottom: 10,
            }}
          >
            {amount ? (
              <View
                style={{
                  alignItems: "center",
                  borderBottomColor: "#D4D9E2",
                  borderBottomWidth: 1,
                  borderStyle: "dashed",
                  marginBottom: 8,
                  paddingBottom: 12,
                }}
              >
                <Text style={{ color: palette.paperMuted, fontSize: 12 }}>
                  Amount
                </Text>
                <Text
                  style={{
                    color: palette.paperInk,
                    fontSize: 22,
                    fontVariant: ["tabular-nums"],
                    fontWeight: "800",
                    lineHeight: 28,
                  }}
                >
                  {amount}
                </Text>
              </View>
            ) : null}
            {rows.map((row) => (
              <View
                key={row.label}
                style={{
                  flexDirection: "row",
                  gap: 12,
                  justifyContent: "space-between",
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={{
                    color: palette.paperMuted,
                    fontSize: 13,
                    lineHeight: 18,
                  }}
                >
                  {row.label}
                </Text>
                <View style={{ alignItems: "flex-end", flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: palette.paperInk,
                      fontSize: 13,
                      fontWeight: "600",
                      lineHeight: 18,
                      textAlign: "right",
                    }}
                  >
                    {row.value}
                  </Text>
                  {row.detail ? (
                    <Text
                      style={{
                        color: palette.paperMuted,
                        fontSize: 13,
                        lineHeight: 18,
                        textAlign: "right",
                      }}
                    >
                      {row.detail}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
          <PaperEdge color={paper} />
        </View>
      ) : null}
    </View>
  )
}

/** The torn bottom edge of a printed receipt. */
function PaperEdge({ color }: { color: string }) {
  const [width, setWidth] = useState(0)
  const count = Math.ceil(width / 14)
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ flexDirection: "row", height: 6, overflow: "hidden" }}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed scallop row
          key={index}
          style={{
            backgroundColor: color,
            borderRadius: 6,
            height: 12,
            marginHorizontal: 1,
            marginTop: -6,
            width: 12,
          }}
        />
      ))}
    </View>
  )
}

function NoticeCard({
  action,
  icon,
  message,
  tint,
  title,
}: {
  action?: { label: string; onPress: () => void }
  icon: IconKeys
  message: string
  tint: GreenTillTint | "muted"
  title: string
}) {
  return (
    <View
      accessibilityRole="summary"
      className="overflow-hidden rounded-[20px] bg-card shadow-sm"
    >
      <View className="flex-row items-center gap-3 px-3.5 pb-3.5 pt-4">
        <Avatar icon={icon} tint={tint} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-extrabold [-rn-line-height:22] text-foreground">
            {title}
          </Text>
          <Text className="text-sm [-rn-line-height:20] text-muted-foreground">
            {message}
          </Text>
        </View>
      </View>
      {action ? (
        <View className="px-3.5 pb-3.5">
          <ActionButton tone="soft" onPress={action.onPress}>
            {action.label}
          </ActionButton>
        </View>
      ) : null}
    </View>
  )
}
