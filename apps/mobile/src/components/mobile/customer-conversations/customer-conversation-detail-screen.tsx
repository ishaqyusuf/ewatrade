import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { parseCustomerConversationDetailQaState } from "@/lib/customer-conversation-detail-qa"
import {
  isCustomerCredentialError,
  resolveCustomerConversationRetryTarget,
} from "@/lib/customer-conversation-state"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { router } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { FlatList, RefreshControl } from "react-native"
import { CustomerConversationAccountTerms } from "./customer-conversation-account-terms"
import { CustomerConversationAge } from "./customer-conversation-age"
import { projectCustomerConversationAvailability } from "./customer-conversation-availability-presentation"
import { CustomerConversationChannelBoundary } from "./customer-conversation-channel-boundary"
import { CustomerConversationChannelMode } from "./customer-conversation-channel-mode"
import { resolveCustomerConversationDisabledComposerLabel } from "./customer-conversation-channel-mode-state"
import { CustomerConversationComposer } from "./customer-conversation-composer"
import {
  type CustomerConversationTimelineItem,
  buildCustomerConversationTimelineItems,
  resolveCustomerConversationHeaderStatus,
} from "./customer-conversation-detail-presentation"
import { CustomerConversationDetailQaScreen } from "./customer-conversation-detail-qa-screen"
import { CustomerConversationGuestTerms } from "./customer-conversation-guest-terms"
import {
  CustomerConversationNotice,
  CustomerConversationTransientNotice,
} from "./customer-conversation-notice"
import { CustomerConversationPrivacyControl } from "./customer-conversation-privacy-control"
import { projectCustomerConversationRestriction } from "./customer-conversation-restriction-presentation"
import { CustomerConversationRouteState } from "./customer-conversation-route-state"
import { CustomerConversationSafetyControl } from "./customer-conversation-safety-control"
import { CustomerMessage } from "./customer-message"
import { CustomerNotificationControls } from "./customer-notification-controls"
import { CustomerRequestChoice } from "./customer-request-choice"
import { CustomerShellHeader } from "./customer-shell-header"
import { useCustomerConversationDetail } from "./use-customer-conversation-detail"
import { useConversationKeyboardInset } from "./use-scroll-conversation-to-end-on-keyboard"

type Message =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["messages"][number]

export function CustomerConversationDetailScreen({
  accountAccess = false,
  bootstrap = false,
  conversationId = null,
  entryAgeBand,
  publicToken,
  qaState,
  targetCredentialToken = null,
  transferToken = null,
}: {
  accountAccess?: boolean
  bootstrap?: boolean
  conversationId?: string | null
  entryAgeBand?: "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"
  publicToken: string | null
  qaState?: string | string[]
  targetCredentialToken?: string | null
  transferToken?: string | null
}) {
  const detailQaState = parseCustomerConversationDetailQaState({
    development: __DEV__,
    qaState,
  })
  if (detailQaState) {
    return (
      <CustomerConversationDetailQaScreen
        key={detailQaState}
        qaState={detailQaState}
      />
    )
  }

  return (
    <CustomerConversationDetailLiveScreen
      accountAccess={accountAccess}
      bootstrap={bootstrap}
      conversationId={conversationId}
      entryAgeBand={entryAgeBand}
      publicToken={publicToken}
      targetCredentialToken={targetCredentialToken}
      transferToken={transferToken}
    />
  )
}

function CustomerConversationDetailLiveScreen({
  accountAccess,
  bootstrap,
  conversationId,
  entryAgeBand,
  publicToken,
  targetCredentialToken,
  transferToken,
}: {
  accountAccess: boolean
  bootstrap: boolean
  conversationId: string | null
  entryAgeBand?: "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"
  publicToken: string | null
  targetCredentialToken: string | null
  transferToken: string | null
}) {
  const listRef = useRef<FlatList<CustomerConversationTimelineItem>>(null)
  const largeTextLayout = useLargeTextLayout()
  const [composerHeight, setComposerHeight] = useState(190)
  const [guestTermsState, setGuestTermsState] = useState({
    allowed: false,
    scope: "",
  })
  const [accountTermsState, setAccountTermsState] = useState({
    allowed: false,
    scope: "",
  })
  const [ageState, setAgeState] = useState({ allowed: false, scope: "" })
  const [blockedState, setBlockedState] = useState<{
    scope: string
    value: boolean
  } | null>(null)
  const blockScope = `${accountAccess}:${conversationId}:${publicToken}`
  const guestTermsScope = `${conversationId}:${publicToken}`
  const guestTermsAllowed =
    guestTermsState.scope === guestTermsScope && guestTermsState.allowed
  const accountTermsAllowed =
    accountTermsState.scope === blockScope && accountTermsState.allowed
  const ageAllowed = ageState.scope === blockScope && ageState.allowed
  const setGuestTermsAllowed = useCallback(
    (allowed: boolean) =>
      setGuestTermsState({ allowed, scope: guestTermsScope }),
    [guestTermsScope],
  )
  const setAccountTermsAllowed = useCallback(
    (allowed: boolean) => setAccountTermsState({ allowed, scope: blockScope }),
    [blockScope],
  )
  const setAgeAllowed = useCallback(
    (allowed: boolean) => setAgeState({ allowed, scope: blockScope }),
    [blockScope],
  )
  const blockedOverride =
    blockedState?.scope === blockScope ? blockedState.value : null
  const updateComposerHeight = (nextHeight: number) => {
    setComposerHeight((currentHeight) =>
      Math.abs(currentHeight - nextHeight) > 1 ? nextHeight : currentHeight,
    )
  }
  const detail = useCustomerConversationDetail({
    accountAccess,
    bootstrap,
    conversationId,
    entryAgeBand,
    postingTermsAccepted:
      ageAllowed && (accountAccess ? accountTermsAllowed : guestTermsAllowed),
    publicToken,
    targetCredentialToken,
    transferToken,
  })
  const timeline = detail.timeline.data
  const customerBlocked =
    blockedOverride ?? timeline?.conversation.customerBlocked ?? false
  const messages = mergeMessages(detail.olderMessages, timeline?.messages ?? [])
  const activeRequests =
    timeline?.requests.filter((request) => request.lifecycle === "active") ?? []
  const messageById = new Map(messages.map((message) => [message.id, message]))
  const timelineItems = buildCustomerConversationTimelineItems({ messages })
  const transientNotice =
    detail.notice ??
    (detail.timeline.isError
      ? "Unable to refresh. Messages already shown remain available."
      : null)
  const unavailable = !publicToken || (!bootstrap && !conversationId)
  const loading =
    detail.opening || detail.transferring || detail.timeline.isLoading
  const credentialRejected = isCustomerCredentialError(detail.timeline.error)
  const newestSequence = messages.at(-1)?.sequence ?? 0
  const availabilityPresentation = timeline
    ? projectCustomerConversationAvailability({
        available: timeline.availability.available,
        customerMessage: timeline.availability.customerMessage,
        hasUnsentDraft: Boolean(
          detail.draft.trim() ||
            detail.attachmentDraft.draft ||
            detail.restoredAttachmentKind,
        ),
        reopensAt: timeline.availability.reopensAt,
      })
    : null
  const { keyboardInset, onConversationScroll } =
    useConversationKeyboardInset(listRef)
  const restrictionPresentation = timeline
    ? projectCustomerConversationRestriction(timeline.conversation.moderation)
    : null

  useEffect(() => {
    if (
      blockedOverride !== null &&
      timeline?.conversation.customerBlocked === blockedOverride
    ) {
      setBlockedState(null)
    }
  }, [blockedOverride, timeline?.conversation.customerBlocked])

  useEffect(() => {
    if (composerHeight <= 0 || newestSequence === 0) return
    let layoutFrame: number | undefined
    const contentFrame = requestAnimationFrame(() => {
      layoutFrame = requestAnimationFrame(() =>
        listRef.current?.scrollToEnd({ animated: true }),
      )
    })
    return () => {
      cancelAnimationFrame(contentFrame)
      if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame)
    }
  }, [composerHeight, newestSequence])

  return (
    <View className="flex-1 bg-background">
      <CustomerShellHeader
        backToList
        onToggleSound={() =>
          void detail.setSoundAlerts(!detail.soundAlertsEnabled)
        }
        soundEnabled={detail.soundAlertsEnabled}
        storeName={timeline?.conversation.storeName}
        storeStatus={
          timeline
            ? customerBlocked
              ? "Store blocked"
              : timeline.conversation.moderation.state === "restricted"
                ? "Messaging restricted"
                : resolveCustomerConversationHeaderStatus(timeline.requests, {
                    hasMessages: messages.length > 0,
                  })
            : undefined
        }
      />
      {!timeline ? (
        <CustomerConversationRouteState
          credentialRejected={credentialRejected}
          loading={loading}
          message={detail.notice}
          onRetry={() => {
            const target = resolveCustomerConversationRetryTarget({
              conversationId: detail.conversationId,
              timelineFailed: detail.timeline.isError,
            })
            void (target === "timeline"
              ? detail.timeline.refetch()
              : detail.openStore())
          }}
          unavailable={unavailable}
        />
      ) : (
        <>
          {transientNotice ? (
            <View className="px-4 pt-4">
              <CustomerConversationTransientNotice
                message={transientNotice}
                onDismiss={() => detail.setNotice(null)}
                soundEnabled={detail.soundAlertsEnabled}
                storeName={timeline.conversation.storeName}
              />
            </View>
          ) : null}
          <FlatList
            ref={listRef}
            contentContainerStyle={{
              gap: 12,
              paddingBottom:
                composerHeight + keyboardInset + (largeTextLayout ? 40 : 16),
              paddingHorizontal: 16,
              paddingTop: 16,
            }}
            data={timelineItems}
            keyExtractor={(item) => item.id}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScroll={onConversationScroll}
            scrollEventThrottle={16}
            ListHeaderComponent={
              <View className="gap-2">
                <CustomerConversationNotice
                  availability={timeline.availability}
                  canLoadOlder={detail.nextCursor !== null}
                  loadingOlder={detail.loadingOlder}
                  moderation={timeline.conversation.moderation}
                  onLoadOlder={() => void detail.loadOlder()}
                  onRecover={
                    publicToken
                      ? () =>
                          router.replace({
                            params: { token: publicToken },
                            pathname: "/(customer)/r/[token]",
                          })
                      : undefined
                  }
                  requests={timeline.requests}
                />
                {!customerBlocked ? (
                  <CustomerConversationChannelMode
                    channelMode={timeline.channelMode}
                    onOpen={() => void detail.openWhatsAppBridge()}
                    opening={detail.openingWhatsApp}
                  />
                ) : null}
                <CustomerNotificationControls
                  accountAccess={accountAccess}
                  available={timeline.availability.available}
                  blocked={customerBlocked}
                  conversationId={timeline.conversation.id}
                  onNotice={detail.setNotice}
                  publicToken={publicToken ?? ""}
                />
                <CustomerConversationSafetyControl
                  accountAccess={accountAccess}
                  blocked={customerBlocked}
                  conversationId={timeline.conversation.id}
                  key={`${accountAccess}:${timeline.conversation.id}`}
                  onBlockedChange={(blocked) => {
                    setBlockedState({ scope: blockScope, value: blocked })
                    void detail.timeline.refetch()
                  }}
                  publicToken={publicToken ?? ""}
                />
                {accountAccess ? (
                  <CustomerConversationPrivacyControl
                    conversationId={timeline.conversation.id}
                    publicToken={publicToken ?? ""}
                  />
                ) : null}
              </View>
            }
            refreshControl={
              <RefreshControl
                onRefresh={() => void detail.timeline.refetch()}
                refreshing={detail.timeline.isRefetching}
              />
            }
            renderItem={({ item }) => {
              if (item.kind === "day") {
                return (
                  <View className="items-center py-1">
                    <Text className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {item.label}
                    </Text>
                  </View>
                )
              }

              if (item.kind === "channel") {
                return (
                  <CustomerConversationChannelBoundary
                    detail={item.detail}
                    label={item.label}
                    source={item.source}
                  />
                )
              }

              const message = messageById.get(item.messageId)
              if (!message) return null
              return (
                <View className="gap-2">
                  <CustomerMessage
                    accountAccess={accountAccess}
                    accountInvitationActionsDisabled={
                      customerBlocked ||
                      timeline.conversation.moderation.state === "restricted"
                    }
                    accountInvitationInteractive={
                      !customerBlocked &&
                      timeline.conversation.moderation.state !== "restricted"
                    }
                    conversationId={timeline.conversation.id}
                    message={message}
                    onContactStore={() =>
                      detail.setNotice(
                        "Write your message below to continue with the Store.",
                      )
                    }
                    onRecoverAttachment={(candidate, recovery) => {
                      if (recovery === "contact_store") {
                        detail.setNotice(
                          "Send the Store a message for help with this attachment.",
                        )
                        return
                      }
                      const target = detail.attachmentTargets.find(
                        (attachmentTarget) =>
                          attachmentTarget.target.kind === "existing_request" &&
                          attachmentTarget.target.request.id ===
                            candidate.request?.id &&
                          attachmentTarget.target.request.kind ===
                            candidate.request?.kind,
                      )
                      if (target) detail.selectAttachmentTarget(target.key)
                      detail.setNotice(
                        target
                          ? "Request selected. Use + to upload the replacement."
                          : "This Request is no longer available. Message the Store for help.",
                      )
                    }}
                    onRefresh={() => detail.timeline.refetch()}
                    publicToken={publicToken ?? ""}
                    quoteInteractive={
                      !customerBlocked &&
                      timeline.conversation.moderation.state !== "restricted"
                    }
                    storeName={timeline.conversation.storeName}
                  />
                  {message.author.kind === "customer" && !message.request ? (
                    <CustomerRequestChoice
                      disabled={
                        (accountAccess
                          ? !accountTermsAllowed
                          : !guestTermsAllowed) ||
                        customerBlocked ||
                        detail.selecting ||
                        timeline.conversation.state !== "active" ||
                        !timeline.channelMode.composerEnabled
                      }
                      onSelect={(target) =>
                        void detail.selectRequest(message.id, target)
                      }
                      requestKinds={timeline.availableRequestKinds}
                      requests={timeline.requests}
                      selecting={detail.selecting}
                    />
                  ) : null}
                </View>
              )
            }}
          />
          <CustomerConversationAge
            accountAccess={accountAccess}
            onAllowedChange={setAgeAllowed}
          />
          {accountAccess ? (
            <CustomerConversationAccountTerms
              onAllowedChange={setAccountTermsAllowed}
            />
          ) : (
            <CustomerConversationGuestTerms
              onAllowedChange={setGuestTermsAllowed}
            />
          )}
          <CustomerConversationComposer
            attachment={detail.attachmentDraft.draft}
            attachmentKinds={
              detail.attachmentCapabilityAvailable &&
              detail.attachmentCapability.data
                ? detail.attachmentCapability.data.allowedKinds
                : []
            }
            attachmentNotice={detail.attachmentNotice}
            attachmentTargets={detail.attachmentTargets.map((target) => ({
              key: target.key,
              label: target.label,
            }))}
            disabled={
              !ageAllowed ||
              (accountAccess ? !accountTermsAllowed : !guestTermsAllowed) ||
              customerBlocked ||
              timeline.conversation.state !== "active" ||
              !timeline.channelMode.composerEnabled
            }
            disabledMessage={
              (!ageAllowed
                ? "Choose an eligible age range before posting."
                : null) ??
              ((accountAccess ? !accountTermsAllowed : !guestTermsAllowed)
                ? "Accept the current Terms before posting."
                : null) ??
              (customerBlocked
                ? "You blocked this Store. Unblock it to send messages."
                : null) ??
              restrictionPresentation?.recoveryLabel ??
              resolveCustomerConversationDisabledComposerLabel({
                composerEnabled: timeline.channelMode.composerEnabled,
                whatsappAction: timeline.channelMode.whatsappAction,
              }) ??
              undefined
            }
            draft={detail.draft}
            draftPreservation={
              availabilityPresentation?.draftTitle &&
              availabilityPresentation.draftDetail
                ? {
                    detail: availabilityPresentation.draftDetail,
                    title: availabilityPresentation.draftTitle,
                  }
                : null
            }
            hasActiveRequest={activeRequests.length > 0}
            onCancelAttachment={detail.attachmentDraft.cancel}
            onCancelVoice={detail.voiceNote.cancel}
            onChangeDraft={detail.setDraft}
            onDismissVoiceNotice={detail.voiceNote.dismiss}
            onPickDocument={() => void detail.attachmentDraft.pickDocument()}
            onPickImage={() => void detail.attachmentDraft.pickImage()}
            onRemoveAttachment={detail.attachmentDraft.remove}
            onRemoveRestoredAttachment={detail.removeRestoredAttachment}
            onRetryAttachment={detail.attachmentDraft.retry}
            onSelectAttachmentTarget={detail.selectAttachmentTarget}
            onTogglePrescriptionConsent={() =>
              detail.setPrescriptionConsentAccepted(
                !detail.prescriptionConsentAccepted,
              )
            }
            onSend={() => void detail.sendComposer()}
            onStartVoice={() => void detail.voiceNote.start()}
            onStopVoice={detail.voiceNote.stop}
            onHeightChange={updateComposerHeight}
            onToggleRequestIntent={() =>
              detail.setStartingNewRequest(!detail.startingNewRequest)
            }
            sending={detail.sending}
            selectedAttachmentTargetKey={
              detail.selectedAttachmentTarget
                ? JSON.stringify(detail.selectedAttachmentTarget)
                : null
            }
            selectedAttachmentTargetLabel={
              detail.attachmentTargets.find(
                (target) =>
                  target.key ===
                  JSON.stringify(detail.selectedAttachmentTarget),
              )?.label ?? "selected Request"
            }
            prescriptionConsentAccepted={detail.prescriptionConsentAccepted}
            prescriptionConsentRequired={
              detail.selectedAttachmentTarget?.kind ===
              "new_prescription_request"
            }
            restoredAttachmentKind={detail.restoredAttachmentKind}
            startingNewRequest={detail.startingNewRequest}
            storeName={timeline.conversation.storeName}
            voiceState={detail.voiceNote.state}
          />
        </>
      )}
    </View>
  )
}

function mergeMessages(older: Message[], latest: Message[]) {
  const messages = new Map<string, Message>()
  for (const message of [...older, ...latest]) messages.set(message.id, message)
  return [...messages.values()].sort((a, b) => a.sequence - b.sequence)
}
