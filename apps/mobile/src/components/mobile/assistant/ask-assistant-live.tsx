import { Modal, useModal } from "@/components/ui/modal"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { getDataCacheGeneration } from "@/trpc/client"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { generalTokenBudgetUsed } from "@ewatrade/assistant/general/allowance"
import {
  type GeneralAnswer,
  type GeneralProposal,
  generalActionSummary,
  simpleSaleStep,
} from "@ewatrade/assistant/general/contracts"
import { productCreatePicture } from "@ewatrade/assistant/general/product-create"
import { readRecordTargetSchema } from "@ewatrade/assistant/general/read-record-target"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import {
  FlatList,
  type NativeScrollEvent,
  type ScrollView,
  type TextInput,
} from "react-native"
import { KeyboardAvoidingView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "../action-button"
import { FullScreenForm } from "../full-screen-form"
import { ListCard, RecordRow } from "../green-till/kit"
import { StatusBanner } from "../status-banner"
import { answerListLink, groupAnswerRows } from "./answer-groups"
import {
  AssistantAnswerCard,
  ProposalCard,
  ResultCard,
  UnavailableProposalCard,
} from "./assistant-cards"
import { AssistantChatBox } from "./assistant-chat-box"
import { AssistantChatRow, AssistantHome } from "./assistant-home"
import { isAssistantSessionCurrent } from "./assistant-scope"
import {
  AssistantBubble,
  AssistantDayMarker,
  AssistantHeader,
  AssistantThinking,
  assistantAsOf,
} from "./assistant-ui"
import { mobileAssistantSystemTitle } from "./assistant-wording"
import { ChatPhotoThumb, ChatSentFile } from "./chat-photo"
import {
  generalAnswerRoute,
  generalAnswers,
  generalPlainText,
  generalReceiptRoute,
} from "./general-model"
import { PaymentLinksResult } from "./general-payment-links"
import { GeneralProductThumb } from "./general-product-picture"
import { GeneralProposalEditor } from "./general-proposal-editor"
import { paymentLinksReviewLine } from "./native-payment-links-values"
import {
  useAssistantPrefillFocus,
  useAssistantStarterQuestion,
} from "./use-assistant-prefill"
import { useGeneralAssistant } from "./use-general-assistant"
const nearEnd = (n: NativeScrollEvent) =>
  n.contentSize.height - n.layoutMeasurement.height - n.contentOffset.y < 100

export function AskAssistantLive() {
  const vm = useGeneralAssistant()
  const [answerOrigin] = useState(() => getSession())
  const [answerCacheGeneration] = useState(getDataCacheGeneration)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const saved = useModal()
  const [editing, setEditing] = useState<GeneralProposal | null>(null)
  // The thread's notice sits behind the open editor, so a refused save is
  // repeated inside the editor instead of looking like a dead Save button.
  const [saveFailed, setSaveFailed] = useState(false)
  const closeEditor = () => {
    setEditing(null)
    setSaveFailed(false)
  }
  const list = useRef<FlatList>(null)
  const [composerHeight, setComposerHeight] = useState(0)
  const input = useRef<TextInput>(null)
  const atBottom = useRef(true)
  const focusedResponse = useRef<string | null>(null)
  const disabled =
    vm.offline ||
    vm.scopeChanged ||
    vm.state.isError ||
    vm.pending ||
    vm.busy ||
    !!vm.runId
  const openAnswerTarget = (target: GeneralAnswer["target"]) => {
    const current = getSession()
    if (
      vm.offline ||
      vm.scopeChanged ||
      vm.sessionUnavailable ||
      getDataCacheGeneration() !== answerCacheGeneration ||
      answerOrigin?.profile.role !== current?.profile.role ||
      !isAssistantSessionCurrent(
        answerOrigin,
        current,
        useOperationalModeStore.getState().isOfflineMode,
        false,
      )
    )
      return
    const freshRoute = generalAnswerRoute(target, {
      tenantId: current?.profile.businessId ?? "",
      storeId: current?.profile.storeId ?? "",
    })
    if (freshRoute) router.push(freshRoute)
  }
  const renderAnswerTargetAction = (
    target: GeneralAnswer["target"],
    recordLabel?: string,
  ) => {
    const record = readRecordTargetSchema.safeParse(target)
    const route = generalAnswerRoute(target, {
      tenantId: vm.profile?.businessId ?? "",
      storeId: vm.profile?.storeId ?? "",
    })
    const wrongRecordScope =
      record.success &&
      (record.data.origin.tenantId !== vm.profile?.businessId ||
        record.data.origin.storeId !== vm.profile?.storeId)
    if (route)
      return (
        <ActionButton
          variant="outline"
          disabled={vm.offline || vm.scopeChanged || vm.sessionUnavailable}
          accessibilityLabel={recordLabel ? `Open ${recordLabel}` : undefined}
          onPress={() => openAnswerTarget(target)}
        >
          {target?.kind === "staff_activity" ? "Open activity" : "Open record"}
        </ActionButton>
      )
    if (wrongRecordScope)
      return (
        <Text className="text-sm text-muted-foreground">
          Select the original business and Store to open this record.
        </Text>
      )
    if (record.success)
      return (
        <Text className="text-sm text-muted-foreground">
          Open this saved customer{" "}
          {record.data.kind === "customer_directory" ? "directory" : "record"}{" "}
          on the dashboard in the same business and Store.
        </Text>
      )
    return null
  }
  /** One record of a read as a short tappable row inside its page card. */
  const renderAnswerRow = (row: GeneralAnswer) => {
    const route = generalAnswerRoute(row.target, {
      tenantId: vm.profile?.businessId ?? "",
      storeId: vm.profile?.storeId ?? "",
    })
    const blocked = vm.offline || vm.scopeChanged || vm.sessionUnavailable
    const order = row.target?.kind === "order"
    return (
      <RecordRow
        accessibilityLabel={route ? `Open ${row.title}` : undefined}
        avatar={{
          icon: order
            ? "ReceiptText"
            : row.target?.kind === "catalog_item"
              ? "Package"
              : row.target?.kind === "customer"
                ? "User"
                : "FileText",
          tint: "muted",
        }}
        title={row.title}
        meta={(order ? row.summary : row.summary || row.value) || undefined}
        amount={order ? row.value : undefined}
        stackDetails
        onPress={
          route && !blocked ? () => openAnswerTarget(row.target) : undefined
        }
      />
    )
  }
  const exhausted = !!vm.data && generalTokenBudgetUsed(vm.data.allowance)
  const settingUp =
    !vm.sessionUnavailable &&
    !vm.scopeChanged &&
    !vm.offline &&
    !!vm.availability.data &&
    !vm.availability.data.enabled
  const noAccess = vm.sessionUnavailable
    ? "Active business access is needed to use the assistant."
    : vm.scopeChanged
      ? "Your session or Store changed. Close and reopen the assistant."
      : settingUp
        ? "The assistant is being set up for this business."
        : vm.availability.isError
          ? "Availability could not load. Reconnect and try again."
          : null
  const canType = !(disabled || exhausted || vm.queued || noAccess)
  useAssistantPrefillFocus(input, vm.draft, canType)
  useAssistantStarterQuestion(
    vm.ask,
    canType && vm.availability.data?.enabled === true,
  )
  useEffect(() => {
    if (vm.offline || vm.scopeChanged) {
      setEditing(null)
      setSaveFailed(false)
    }
  }, [vm.offline, vm.scopeChanged])
  // A chat opens at its newest message and follows it as the thread loads.
  useEffect(() => {
    if (vm.conversationId) atBottom.current = !vm.responseMessageId
  }, [vm.conversationId, vm.responseMessageId])
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
  // The home also carries the offline (no saved thread) and set-up states.
  const homeState = vm.offline ? "offline" : settingUp ? "setup" : undefined
  const home =
    !messages.length &&
    !vm.queued &&
    !vm.busy &&
    (!!homeState || (!!vm.availability.data?.enabled && !noAccess)) &&
    !(vm.state.isPending && vm.conversationId)
  return (
    // The chat is white (card colour), like the reply surface in ChatGPT.
    <View
      style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.card }}
    >
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
          initialNumToRender={vm.responseMessageId ? 42 : 10}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            focusedResponse.current = null
            list.current?.scrollToOffset({
              offset: averageItemLength * index,
              animated: false,
            })
          }}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 18,
            gap: 14,
            paddingBottom: 30 + composerHeight,
          }}
          // Only the owner's own scrolling decides whether the thread follows
          // new content; scroll events from the list re-laying out while a
          // chat loads do not.
          onScrollEndDrag={(event) => {
            atBottom.current = nearEnd(event.nativeEvent)
          }}
          onMomentumScrollEnd={(event) => {
            atBottom.current = nearEnd(event.nativeEvent)
          }}
          // FlatList's scrollToEnd works from the rows it has measured, which a
          // just-loaded thread does not have yet, so a reopened chat stayed at
          // the top. The native scroll view scrolls to its real end once the
          // new content is laid out.
          onContentSizeChange={() => {
            const responseId = vm.data?.responseMessage?.id
            if (responseId && focusedResponse.current !== responseId) {
              const index = messages.findIndex(
                (message) => message.id === responseId,
              )
              if (index >= 0) {
                atBottom.current = false
                focusedResponse.current = responseId
                requestAnimationFrame(() =>
                  list.current?.scrollToIndex({
                    index,
                    animated: false,
                    viewPosition: 0,
                  }),
                )
                return
              }
            }
            // The home reads from the top; only a thread follows its end.
            if (atBottom.current && !home)
              requestAnimationFrame(() =>
                (
                  list.current?.getNativeScrollRef() as ScrollView | null
                )?.scrollToEnd({ animated: false }),
              )
          }}
          ListHeaderComponent={
            <View className="gap-3 pb-3">
              {vm.offline && !home ? (
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
              {noAccess && !home ? (
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
                  state={homeState}
                  onSearch={() => router.push("/global-search")}
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
              {exhausted && !vm.offline ? (
                <StatusBanner
                  title="Monthly token allowance used"
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
                {item.id === vm.data?.responseMessage?.latestStartId ? (
                  <Text className="border-t border-border pt-3 text-xs text-muted-foreground">
                    Recent messages
                  </Text>
                ) : null}
                {item.id === vm.data?.responseMessage?.id ? (
                  <Text className="text-xs text-muted-foreground">
                    Saved response from WhatsApp
                  </Text>
                ) : null}
                <AssistantDayMarker times={times} ids={ids} index={index} />
                {item.role === "user"
                  ? item.parts.flatMap((part) =>
                      part.type === "data-setup-attachment"
                        ? [
                            <ChatSentFile
                              key={part.data.attachmentId}
                              file={part.data}
                            />,
                          ]
                        : [],
                    )
                  : null}
                {text ? (
                  <AssistantBubble
                    text={text}
                    user={item.role === "user"}
                    streaming={vm.busy && index === messages.length - 1}
                  />
                ) : null}
                {answers.length ? (
                  <View className="gap-6 pt-1">
                    {groupAnswerRows(answers).map(({ head: answer, rows }) => {
                      const more = answerListLink(answer)
                      return (
                        <AssistantAnswerCard
                          key={answer.id}
                          title={answer.title}
                          value={answer.value}
                          summary={answer.summary}
                        >
                          {rows.length ? (
                            <View className="pt-1">
                              {rows.map((row) => (
                                <View key={row.id}>{renderAnswerRow(row)}</View>
                              ))}
                            </View>
                          ) : null}
                          {more ? (
                            <ActionButton
                              variant="outline"
                              disabled={vm.offline || vm.scopeChanged}
                              onPress={() => router.push(more.href as never)}
                            >
                              {more.label}
                            </ActionButton>
                          ) : null}
                          {answer.records?.rows
                            .slice(0, 6)
                            .map((row, index) => (
                              <View
                                key={`${answer.id}:record:${index}`}
                                className="gap-2 rounded-xl bg-muted/40 p-3"
                              >
                                <Text className="font-semibold">
                                  {index + 1}. {row.title} · {row.type}
                                </Text>
                                {row.subtitle ? (
                                  <Text className="text-sm text-muted-foreground">
                                    {row.subtitle}
                                  </Text>
                                ) : null}
                                {renderAnswerTargetAction(
                                  row.target,
                                  row.title,
                                )}
                              </View>
                            ))}
                          {answer.records?.labelsShortened ? (
                            <Text className="text-sm text-muted-foreground">
                              Some names are shortened. Open the saved record
                              for full names.
                            </Text>
                          ) : null}
                          {renderAnswerTargetAction(answer.target)}
                        </AssistantAnswerCard>
                      )
                    })}
                  </View>
                ) : null}
              </View>
            )
          }}
          ListFooterComponent={
            <View className="gap-4 pt-3">
              {vm.busy ? <AssistantThinking /> : null}
              {vm.data?.unavailableProposals.map((row) => (
                <UnavailableProposalCard key={row.id} row={row} />
              ))}
              {vm.data?.proposals.map((proposal) => (
                <View key={proposal.id} className="gap-3">
                  {proposal.receipt?.kind === "payment_links" ? (
                    <PaymentLinksResult
                      receipt={proposal.receipt}
                      businessName={vm.data?.businessName}
                    />
                  ) : proposal.receipt ? (
                    <ResultCard
                      title={mobileAssistantSystemTitle(proposal.receipt.title)}
                      detail={proposal.receipt.detail}
                      media={
                        proposal.payload.action === "order_attachment_add" &&
                        proposal.payload.attachmentId ? (
                          <ChatPhotoThumb
                            attachmentId={proposal.payload.attachmentId}
                          />
                        ) : undefined
                      }
                      unavailable={
                        generalReceiptRoute(
                          proposal.receipt,
                          vm.profile?.storeId,
                        )
                          ? undefined
                          : "Saved. Open this record on the dashboard."
                      }
                      onOpen={() => {
                        const route =
                          proposal.receipt &&
                          generalReceiptRoute(
                            proposal.receipt,
                            vm.profile?.storeId,
                          )
                        if (route) router.push(route)
                      }}
                    />
                  ) : (
                    <View className="gap-2">
                      {proposal.payload.action === "sale_record" &&
                      proposal.status === "PENDING" &&
                      simpleSaleStep(proposal.payload) !== "review" ? null : (
                        <ProposalCard
                          title={mobileAssistantSystemTitle(
                            capabilityForAction(proposal.payload.action).title,
                          )}
                          media={
                            proposal.payload.action === "product_create" ? (
                              <GeneralProductThumb payload={proposal.payload} />
                            ) : proposal.payload.action ===
                                "order_attachment_add" &&
                              proposal.payload.attachmentId ? (
                              <ChatPhotoThumb
                                attachmentId={proposal.payload.attachmentId}
                              />
                            ) : proposal.payload.action === "sale_record" &&
                              proposal.payload.attachmentIds[0] ? (
                              <ChatPhotoThumb
                                attachmentId={proposal.payload.attachmentIds[0]}
                              />
                            ) : undefined
                          }
                          summary={(
                            proposal.review?.join("\n") ??
                            generalActionSummary(
                              proposal.payload,
                              vm.data?.currencyCode ?? "NGN",
                            )
                          )
                            .split("\n")
                            // The picture shows beside the text, so its line is not repeated.
                            .filter(
                              (line) =>
                                proposal.payload.action !== "product_create" ||
                                !proposal.payload.illustrationId ||
                                line !== productCreatePicture(proposal.payload),
                            )
                            .map((line) =>
                              proposal.payload.action === "payment_links_create"
                                ? paymentLinksReviewLine(line, proposal.payload)
                                : line,
                            )
                            .join("\n")}
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
                          }}
                        />
                      )}
                      {proposal.status === "PENDING" && proposal.question ? (
                        <View className="gap-2">
                          <Text>{proposal.question}</Text>
                          <View className="flex-row flex-wrap gap-2">
                            {proposal.choices?.map((choice) => (
                              <ActionButton
                                key={choice.text}
                                disabled={disabled || !!noAccess}
                                onPress={() =>
                                  void vm.ask(choice.label, {
                                    proposalId: proposal.id,
                                    revision: proposal.revision,
                                    text: choice.text,
                                  })
                                }
                              >
                                {choice.label}
                              </ActionButton>
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  )}
                  {proposal.status === "EXPIRED" ? (
                    <ActionButton
                      variant="outline"
                      disabled={disabled || !!noAccess}
                      onPress={() => {
                        setEditing(proposal)
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
        {/* The composer floats over the list's last pixels so messages
            scroll under its fade; the list pads by the same height. */}
        <View
          style={{ marginTop: -composerHeight }}
          onLayout={(event) =>
            setComposerHeight(Math.round(event.nativeEvent.layout.height))
          }
        >
          <AssistantChatBox
            conversationId={vm.composerConversationId}
            resetKey={vm.trayKey}
            onReadyChange={vm.setReadyFiles}
            value={vm.draft}
            onChange={vm.setDraft}
            onSend={() => void vm.send()}
            onStop={() => void vm.chat.stop()}
            busy={vm.busy}
            disabled={disabled || exhausted || !!vm.queued || !!noAccess}
            inputRef={input}
            placeholder="Ask anything"
            surface={colors.card}
            reason={
              vm.offline
                ? "Saved answers are available offline. Reconnect to make changes."
                : undefined
            }
          />
        </View>
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
        <FullScreenForm
          visible={!!editing}
          title="Edit draft"
          closeLabel="Close draft editor"
          onClose={closeEditor}
        >
          {saveFailed && !vm.pending ? (
            <View className="px-[18px] pb-3">
              <StatusBanner
                title="Draft not saved"
                tone="warning"
                message={
                  vm.notice ??
                  "Your changes are still here. Check the thread, then save again."
                }
              />
            </View>
          ) : null}
          {editing ? (
            <GeneralProposalEditor
              key={`${editing.id}:${editing.revision}`}
              proposal={editing}
              currencyCode={vm.data?.currencyCode ?? "NGN"}
              disabled={disabled || !!noAccess}
              onSave={async (payload) => {
                setSaveFailed(false)
                if (await vm.save(editing, payload)) closeEditor()
                else setSaveFailed(true)
              }}
            />
          ) : null}
        </FullScreenForm>
      </KeyboardAvoidingView>
    </View>
  )
}
