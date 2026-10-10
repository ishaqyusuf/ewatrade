import { Modal, useModal } from "@/components/ui/modal"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import {
  type GeneralProposal,
  generalActionSummary,
} from "@ewatrade/assistant/general/contracts"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { FlatList, type TextInput } from "react-native"
import { KeyboardAvoidingView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "../action-button"
import { ListCard } from "../green-till/kit"
import { StatusBanner } from "../status-banner"
import {
  AssistantAnswerCard,
  ProposalCard,
  ResultCard,
} from "./assistant-cards"
import { AssistantChatRow, AssistantHome } from "./assistant-home"
import {
  AssistantBubble,
  AssistantComposer,
  AssistantDayMarker,
  AssistantHeader,
  AssistantThinking,
} from "./assistant-ui"
import {
  generalAnswers,
  generalPlainText,
  generalReceiptRoute,
} from "./general-model"
import { GeneralProposalEditor } from "./general-proposal-editor"
import { useGeneralAssistant } from "./use-general-assistant"
export function AskAssistantLive() {
  const vm = useGeneralAssistant()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const saved = useModal()
  const editor = useModal()
  const [editing, setEditing] = useState<GeneralProposal | null>(null)
  const list = useRef<FlatList>(null)
  const input = useRef<TextInput>(null)
  const atBottom = useRef(true)
  const disabled =
    vm.offline ||
    vm.scopeChanged ||
    vm.state.isError ||
    vm.pending ||
    vm.busy ||
    !!vm.runId
  const exhausted =
    !!vm.data &&
    (vm.data.allowance.remainingRequests <= 0 ||
      vm.data.allowance.remainingTokens <= 0)
  const noAccess = vm.sessionUnavailable
    ? "Active business access is needed to use the assistant."
    : vm.scopeChanged
      ? "Your session or Store changed. Close and reopen the assistant."
      : !vm.offline && vm.availability.data && !vm.availability.data.enabled
        ? "The assistant is being set up for this business."
        : vm.availability.isError
          ? "Availability could not load. Reconnect and try again."
          : null
  useEffect(() => {
    if (vm.offline || vm.scopeChanged) {
      editor.dismiss()
      setEditing(null)
    }
  }, [vm.offline, vm.scopeChanged, editor.dismiss])
  const messages = vm.scopeChanged
    ? []
    : vm.offline
      ? (vm.data?.messages ?? [])
      : vm.chat.messages
  const role = vm.profile?.role?.trim().toLowerCase()
  const firstName = vm.profile?.name?.trim().split(/\s+/)[0]
  const times = new Map(
    (vm.data?.messages ?? []).map((m) => [m.id, m.createdAt] as const),
  )
  const ids = messages.map((m) => m.id)
  // Chats with no question yet are empty and stay out of the lists.
  const chats = (vm.conversations.data ?? []).filter((chat) => chat.title)
  const home =
    !messages.length &&
    !vm.queued &&
    !vm.busy &&
    !!vm.availability.data?.enabled &&
    !vm.offline &&
    !noAccess &&
    !(vm.state.isPending && vm.conversationId)
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <AssistantHeader
          title="Assistant"
          business={[
            vm.data?.businessName ?? vm.profile?.businessName,
            firstName && role
              ? `${firstName} (${role.charAt(0).toUpperCase()}${role.slice(1)})`
              : undefined,
          ]
            .filter(Boolean)
            .join(" · ")}
          icons={
            vm.availability.data?.enabled && !vm.offline
              ? [
                  { icon: "Clock", label: "All chats", onPress: saved.present },
                  ...(home
                    ? []
                    : [
                        {
                          icon: "SquarePen" as const,
                          label: "New chat",
                          onPress: vm.fresh,
                        },
                      ]),
                ]
              : undefined
          }
          disabled={
            vm.offline ||
            vm.scopeChanged ||
            vm.busy ||
            vm.pending ||
            !!vm.runId ||
            !!vm.queued
          }
        />
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 30 }}
          onScroll={(event) => {
            const n = event.nativeEvent
            atBottom.current =
              n.contentSize.height -
                n.layoutMeasurement.height -
                n.contentOffset.y <
              100
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (atBottom.current) list.current?.scrollToEnd({ animated: false })
          }}
          ListHeaderComponent={
            <View className="gap-3 pb-3">
              {vm.offline ? (
                <StatusBanner
                  title="Saved answers"
                  tone="warning"
                  message={
                    vm.data
                      ? `Offline · saved ${new Date(vm.savedAt ?? 0).toLocaleString()}. Reconnect to ask or confirm.`
                      : "No saved thread is available. Reconnect to load it."
                  }
                />
              ) : null}
              {noAccess ? (
                <>
                  <StatusBanner
                    title="Assistant unavailable"
                    tone="warning"
                    message={noAccess}
                  />
                  <ActionButton
                    variant="outline"
                    onPress={() => router.push("/global-search")}
                  >
                    Open search
                  </ActionButton>
                </>
              ) : null}
              {(vm.availability.isPending ||
                (vm.state.isPending && vm.conversationId)) &&
              !vm.offline &&
              !noAccess ? (
                <Skeleton className="h-24 rounded-[18px]" />
              ) : null}
              {vm.state.isError && !noAccess ? (
                <StatusBanner
                  title="Thread could not load"
                  tone="warning"
                  message="Try again to load saved answers and current drafts."
                />
              ) : null}
              {home ? (
                <AssistantHome
                  name={vm.profile?.name}
                  role={vm.profile?.role}
                  chats={chats
                    .filter((chat) => chat.id !== vm.conversationId)
                    .slice(0, 3)}
                  disabled={disabled || exhausted}
                  onSuggestion={(suggestion) => {
                    if (suggestion.send) void vm.ask(suggestion.prompt)
                    else {
                      vm.setDraft(suggestion.prompt)
                      input.current?.focus()
                    }
                  }}
                  onChat={vm.choose}
                  onAllChats={saved.present}
                />
              ) : null}
              {vm.queued ? (
                <>
                  <AssistantBubble user text={vm.queued} />
                  <AssistantThinking />
                </>
              ) : null}
              {vm.data && !vm.offline ? (
                <Text className="text-xs text-muted-foreground">
                  {vm.data.allowance.remainingRequests} requests left this month
                  · resets{" "}
                  {new Date(vm.data.allowance.resetsAt).toLocaleDateString()}
                </Text>
              ) : null}
              {exhausted && !vm.offline ? (
                <StatusBanner
                  title="Monthly allowance used"
                  tone="warning"
                  message="You can still review and confirm saved drafts. Ask again after the allowance resets."
                />
              ) : null}
              {vm.notice || vm.chat.error ? (
                <StatusBanner
                  title="Check your thread"
                  tone="warning"
                  message={
                    vm.notice ??
                    "Reply interrupted. Check reply status before sending again."
                  }
                />
              ) : null}
              {vm.runId &&
              !vm.busy &&
              !vm.offline &&
              (vm.notice || vm.chat.error) ? (
                <ActionButton
                  variant="outline"
                  disabled={vm.pending}
                  onPress={() => void vm.recover()}
                >
                  Check reply status
                </ActionButton>
              ) : null}
              {vm.state.isError && !vm.offline ? (
                <ActionButton
                  variant="outline"
                  onPress={() => void vm.refresh().catch(() => {})}
                >
                  Try again
                </ActionButton>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => {
            const text = generalPlainText(item.parts)
            const answers =
              item.role === "assistant" ? generalAnswers(item.parts) : []
            return (
              <View className="gap-3">
                <AssistantDayMarker times={times} ids={ids} index={index} />
                {text ? (
                  <AssistantBubble text={text} user={item.role === "user"} />
                ) : null}
                {answers.map((answer) => (
                  <AssistantAnswerCard
                    key={answer.id}
                    title={answer.title}
                    value={answer.value}
                    scope={answer.scope}
                    asOf={new Date(answer.asOf).toLocaleString()}
                  >
                    <Text className="text-sm text-muted-foreground">
                      {answer.detail}
                    </Text>
                  </AssistantAnswerCard>
                ))}
              </View>
            )
          }}
          ListFooterComponent={
            <View className="gap-4 pt-3">
              {vm.busy ? <AssistantThinking /> : null}
              {vm.data?.proposals.map((proposal) => (
                <View key={proposal.id} className="gap-3">
                  {proposal.receipt ? (
                    <ResultCard
                      title={proposal.receipt.title}
                      detail={proposal.receipt.detail}
                      onOpen={() => {
                        if (!proposal.receipt) return
                        router.push(generalReceiptRoute(proposal.receipt))
                      }}
                    />
                  ) : (
                    <ProposalCard
                      title={capabilityForAction(proposal.payload.action).title}
                      summary={
                        proposal.review?.join("\n") ??
                        generalActionSummary(
                          proposal.payload,
                          vm.data?.currencyCode ?? "NGN",
                        )
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
                      disabled={disabled || !!noAccess}
                      confirmDisabled={
                        !proposal.approvalToken ||
                        new Date(proposal.expiresAt).getTime() <= Date.now()
                      }
                      reason={
                        proposal.status === "PENDING"
                          ? vm.offline
                            ? "Reconnect to review and confirm this draft."
                            : `Check every field. Expires ${new Date(proposal.expiresAt).toLocaleTimeString()}.`
                          : proposal.status === "EXPIRED"
                            ? "Approval expired. Edit and review a fresh draft."
                            : proposal.status.toLowerCase()
                      }
                      onConfirm={() => void vm.confirm(proposal)}
                      onCancel={() => void vm.cancel(proposal)}
                      onEdit={() => {
                        setEditing(proposal)
                        editor.present()
                      }}
                    />
                  )}
                  {proposal.status === "EXPIRED" ? (
                    <ActionButton
                      variant="outline"
                      disabled={disabled || !!noAccess}
                      onPress={() => {
                        setEditing(proposal)
                        editor.present()
                      }}
                    >
                      Edit and renew draft
                    </ActionButton>
                  ) : null}
                </View>
              ))}
            </View>
          }
        />
        <AssistantComposer
          value={vm.draft}
          onChange={vm.setDraft}
          onSend={() => void vm.send()}
          onStop={() => void vm.chat.stop()}
          busy={vm.busy}
          disabled={disabled || exhausted || !!vm.queued || !!noAccess}
          inputRef={input}
          placeholder="Ask a question or say what to record…"
          reason={
            vm.offline
              ? "Saved answers are available offline. Reconnect to make changes."
              : undefined
          }
        />
        <Modal ref={saved.ref} title="All chats" snapPoints={["90%"]}>
          <BottomSheetScrollView
            contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 32 }}
          >
            <ActionButton
              disabled={disabled || !!noAccess}
              onPress={() => {
                saved.dismiss()
                vm.fresh()
              }}
            >
              New chat
            </ActionButton>
            {chats.length ? (
              <ListCard>
                {chats.map((conversation) => (
                  <AssistantChatRow
                    key={conversation.id}
                    chat={conversation}
                    disabled={disabled || !!noAccess}
                    onPress={() => {
                      vm.choose(conversation.id)
                      saved.dismiss()
                    }}
                  />
                ))}
              </ListCard>
            ) : null}
          </BottomSheetScrollView>
        </Modal>
        <Modal ref={editor.ref} title="Edit draft" snapPoints={["90%"]}>
          {editing ? (
            <GeneralProposalEditor
              key={`${editing.id}:${editing.revision}`}
              proposal={editing}
              disabled={disabled || !!noAccess}
              onSave={async (payload) => {
                if (await vm.save(editing, payload)) {
                  editor.dismiss()
                  setEditing(null)
                }
              }}
            />
          ) : null}
        </Modal>
      </KeyboardAvoidingView>
    </View>
  )
}
