import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import {
  type CustomerConversationDetailQaState,
  projectCustomerConversationDetailQaInteractions,
} from "@/lib/customer-conversation-detail-qa"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  deriveStoreConversationChannelMode,
  projectStoreConversationAccountInvitation,
} from "@ewatrade/service-commerce"
import type { StoreConversationAttachmentDraft } from "@ewatrade/utils"
import { useRef, useState } from "react"
import { FlatList } from "react-native"

import { projectCustomerConversationAvailability } from "./customer-conversation-availability-presentation"
import { CustomerConversationChannelBoundary } from "./customer-conversation-channel-boundary"
import { CustomerConversationChannelMode } from "./customer-conversation-channel-mode"
import { resolveCustomerConversationDisabledComposerLabel } from "./customer-conversation-channel-mode-state"
import { CustomerConversationComposer } from "./customer-conversation-composer"
import { resolveCustomerConversationChannelBoundary } from "./customer-conversation-detail-presentation"
import {
  CustomerConversationNotice,
  CustomerConversationTransientNotice,
} from "./customer-conversation-notice"
import { CustomerConversationPrivacyControl } from "./customer-conversation-privacy-control"
import { projectCustomerConversationRestriction } from "./customer-conversation-restriction-presentation"
import { CustomerMessage } from "./customer-message"
import { CustomerNotificationGuestContent } from "./customer-notification-guest-content"
import type { CustomerNotificationGuestChannel } from "./customer-notification-guest-presentation"
import { CustomerRequestChoice } from "./customer-request-choice"
import { CustomerShellHeader } from "./customer-shell-header"
import { useConversationKeyboardInset } from "./use-scroll-conversation-to-end-on-keyboard"

type Timeline =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]
type Message = Timeline["messages"][number]

const MESSAGES: Message[] = [
  {
    attachments: [],
    author: { kind: "customer", label: "You" },
    channel: "mobile",
    id: "qa-message-1",
    kind: "customer_text",
    occurredAt: new Date("2026-08-25T08:42:00.000Z"),
    request: { id: "qa-request", kind: "prescription_request" },
    sequence: 1,
    text: "Hi, is my prescription ready for pickup?",
  },
  {
    attachments: [],
    author: { kind: "store_attendant", label: "Store" },
    channel: "mobile",
    id: "qa-message-2",
    kind: "store_text",
    occurredAt: new Date("2026-08-25T08:46:00.000Z"),
    request: { id: "qa-request", kind: "prescription_request" },
    sequence: 2,
    text: "Yes, it’s ready. Please bring your ID when you come in.",
  },
  {
    attachments: [],
    author: { kind: "customer", label: "You" },
    channel: "mobile",
    id: "qa-message-3",
    kind: "customer_text",
    occurredAt: new Date("2026-08-25T08:48:00.000Z"),
    request: { id: "qa-request", kind: "prescription_request" },
    sequence: 3,
    text: "Thank you. I’ll be there this afternoon.",
  },
]

const MIXED_TIMELINE_MESSAGES: Message[] = [
  ...MESSAGES.slice(0, 2),
  {
    attachments: [],
    author: { kind: "customer", label: "You" },
    channel: "whatsapp",
    id: "qa-mixed-whatsapp-inbound",
    kind: "customer_text",
    occurredAt: new Date("2026-08-25T08:52:00.000Z"),
    request: { id: "qa-request", kind: "prescription_request" },
    sequence: 3,
    text: "I’m at the entrance now.",
    whatsAppObservation: {
      occurredAt: new Date("2026-08-25T08:52:00.000Z"),
      provenance: "cloud_api_inbound",
      status: "received",
    },
  },
  {
    attachments: [],
    author: { kind: "store_attendant", label: "Store" },
    channel: "whatsapp",
    id: "qa-mixed-whatsapp-outbound",
    kind: "store_text",
    occurredAt: new Date("2026-08-25T08:54:00.000Z"),
    request: { id: "qa-request", kind: "prescription_request" },
    sequence: 4,
    text: "I’ll meet you at the pickup desk.",
    whatsAppObservation: {
      occurredAt: new Date("2026-08-25T08:54:08.000Z"),
      provenance: "cloud_api_outbound",
      status: "delivered",
    },
  },
  {
    attachments: [],
    author: { kind: "customer", label: "You" },
    channel: "web",
    id: "qa-mixed-ewatrade-return",
    kind: "customer_text",
    occurredAt: new Date("2026-08-25T08:58:00.000Z"),
    request: { id: "qa-request", kind: "prescription_request" },
    sequence: 5,
    text: "Found you, thank you.",
  },
]

const REQUEST_CHOICE_MESSAGE: Message = {
  attachments: [],
  author: { kind: "customer", label: "You" },
  channel: "mobile",
  id: "qa-message-request-choice",
  kind: "customer_text",
  occurredAt: new Date("2026-08-26T08:42:00.000Z"),
  sequence: 4,
  text: "Can you help me find a blood pressure monitor?",
}

const QUOTE_MESSAGES: Message[] = [
  {
    attachments: [],
    author: { kind: "customer", label: "You" },
    channel: "mobile",
    id: "qa-quote-request",
    kind: "customer_text",
    occurredAt: new Date("2026-08-26T09:10:00.000Z"),
    request: { id: "qa-product-request", kind: "commerce_inquiry" },
    sequence: 5,
    text: "Please send me the options for the blood pressure monitor.",
  },
  {
    attachments: [],
    author: { kind: "store_attendant", label: "Store" },
    channel: "mobile",
    id: "qa-quote-intro",
    kind: "store_text",
    occurredAt: new Date("2026-08-26T09:14:00.000Z"),
    request: { id: "qa-product-request", kind: "commerce_inquiry" },
    sequence: 6,
    text: "I’ve prepared two pickup options for you.",
  },
  {
    actionMessage: {
      actions: [
        {
          action: "choose_quote_option",
          amountMinor: 2_650_000,
          capabilityToken: "qa-standard-quote-capability-token",
          confirmation: "required",
          consequence: "Select Standard pickup as the exact quotation option.",
          currencyCode: "NGN",
          expiresAt: new Date("2026-08-27T09:14:00.000Z"),
          label: "Choose Standard",
        },
        {
          action: "choose_quote_option",
          amountMinor: 3_100_000,
          capabilityToken: "qa-express-quote-capability-token",
          confirmation: "required",
          consequence: "Select Express pickup as the exact quotation option.",
          currencyCode: "NGN",
          expiresAt: new Date("2026-08-27T09:14:00.000Z"),
          label: "Choose Express",
        },
      ],
      currencyCode: "NGN",
      kind: "quote",
      lifecycle: "current",
      options: [
        {
          id: "qa-standard-option",
          label: "Standard pickup",
          selected: false,
          totalMinor: 2_650_000,
        },
        {
          id: "qa-express-option",
          label: "Express pickup",
          selected: false,
          totalMinor: 3_100_000,
        },
      ],
      quoteVersion: 2,
      recovery: null,
    },
    attachments: [],
    author: { kind: "system", label: "ẸwáTrade" },
    channel: "system",
    id: "qa-quote-current",
    kind: "action_message",
    occurredAt: new Date("2026-08-26T09:14:00.000Z"),
    request: { id: "qa-product-request", kind: "commerce_inquiry" },
    sequence: 7,
    text: "Quotation version 2",
  },
]

const ACCOUNT_INVITATION_MESSAGES: Message[] = [
  ...QUOTE_MESSAGES,
  {
    accountInvitation: projectStoreConversationAccountInvitation({
      id: "qa-account-invitation",
      state: "offered",
    }),
    attachments: [],
    author: { kind: "system", label: "ẸwáTrade" },
    channel: "system",
    id: "qa-account-invitation-message",
    kind: "account_invitation",
    occurredAt: new Date("2026-08-26T09:14:01.000Z"),
    request: { id: "qa-product-request", kind: "commerce_inquiry" },
    sequence: 8,
    text: "Optional Customer Account invitation",
  },
]

const REQUEST_CHOICE_REQUESTS: Timeline["requests"] = [
  {
    createdAt: new Date("2026-08-25T08:30:00.000Z"),
    id: "qa-prescription-request",
    kind: "prescription_request",
    label: "Prescription refill",
    lifecycle: "active",
    revision: 2,
    status: "needs_information",
  },
]

const VOICE_RECORDING_LEVELS = [
  0.18, 0.34, 0.52, 0.28, 0.72, 0.44, 0.84, 0.62, 0.36, 0.76, 0.48, 0.9, 0.58,
  0.32, 0.68, 0.42, 0.8, 0.54, 0.26, 0.64, 0.38, 0.74, 0.5, 0.86, 0.46, 0.7,
  0.4, 0.6,
]

const VOICE_PREVIEW_DRAFT: StoreConversationAttachmentDraft = {
  failureMessage: null,
  file: {
    kind: "audio",
    localReference: "file:///data/local/tmp/ewatrade-qa-voice-note.m4a",
    mimeType: "audio/mp4",
    name: "voice-note.m4a",
    size: 84_000,
  },
  operationId: "qa-voice-preview",
  progress: 0,
  status: "selected",
}

const QA_AVAILABILITY: Timeline["availability"] = {
  available: true,
  customerMessage: null,
  reason: null,
  recovery: [],
  reopensAt: null,
  state: "available",
}

const QA_PAUSED_AVAILABILITY: Timeline["availability"] = {
  available: false,
  customerMessage: "Luma Pharmacy has paused new chat messages.",
  reason: null,
  recovery: [],
  reopensAt: new Date("2026-08-26T15:00:00.000Z"),
  state: "manually_paused",
}

const QA_MODERATION: Timeline["conversation"]["moderation"] = {
  customerMessage: null,
  recovery: null,
  restrictedAt: null,
  revision: 0,
  state: "open",
}

const QA_RESTRICTED_MODERATION: Timeline["conversation"]["moderation"] = {
  customerMessage:
    "This Store has paused new messages in this conversation. Your existing history and requests are still available.",
  recovery: "wait_for_reinstatement",
  restrictedAt: new Date("2026-08-27T07:30:00.000Z"),
  revision: 2,
  state: "restricted",
}

const QA_WHATSAPP_ONLY_CHANNEL_MODE = deriveStoreConversationChannelMode({
  chat: { available: false, blockers: ["chat_unavailable"] },
  desiredMode: "whatsapp",
  revision: 3,
  whatsapp: { available: true, blockers: [] },
})

const QA_WHATSAPP_BRIDGE_CHANNEL_MODE = deriveStoreConversationChannelMode({
  chat: { available: true, blockers: [] },
  desiredMode: "both",
  revision: 4,
  whatsapp: { available: true, blockers: [] },
})

const noOp = () => {}

export function CustomerConversationDetailQaScreen({
  qaState,
}: {
  qaState: CustomerConversationDetailQaState
}) {
  const listRef = useRef<FlatList<Message>>(null)
  const largeTextLayout = useLargeTextLayout()
  const [composerHeight, setComposerHeight] = useState(88)
  const accountInvitation = qaState === "account-invitation"
  const availabilityPaused = qaState === "availability-paused"
  const [draft, setDraft] = useState(
    availabilityPaused ? "Can I collect this tomorrow?" : "",
  )
  const attachmentPicker = qaState === "attachment-picker"
  const foregroundResponse = qaState === "foreground-response"
  const mixedTimeline = qaState === "mixed-timeline"
  const notificationSetup = qaState === "notification-setup"
  const privacyRestricted = qaState === "privacy-restricted"
  const quoteCurrent = qaState === "quote-current"
  const voicePreview = qaState === "voice-preview"
  const voiceRecording = qaState === "voice-recording"
  const whatsappBridge = qaState === "whatsapp-bridge"
  const [bridgeOpening, setBridgeOpening] = useState(false)
  const whatsappOnly = qaState === "whatsapp-only"
  const active =
    accountInvitation ||
    qaState === "active" ||
    availabilityPaused ||
    attachmentPicker ||
    foregroundResponse ||
    mixedTimeline ||
    notificationSetup ||
    privacyRestricted ||
    quoteCurrent ||
    voicePreview ||
    voiceRecording ||
    whatsappBridge ||
    whatsappOnly
  const requestChoice = qaState === "request-choice"
  const interactions = projectCustomerConversationDetailQaInteractions(qaState)
  const restrictionPresentation = projectCustomerConversationRestriction(
    privacyRestricted ? QA_RESTRICTED_MODERATION : QA_MODERATION,
  )
  const messages = mixedTimeline
    ? MIXED_TIMELINE_MESSAGES
    : accountInvitation
      ? ACCOUNT_INVITATION_MESSAGES
      : quoteCurrent
        ? QUOTE_MESSAGES
        : active
          ? MESSAGES
          : requestChoice
            ? [REQUEST_CHOICE_MESSAGE]
            : []
  const { keyboardInset, onConversationScroll } =
    useConversationKeyboardInset(listRef)
  const availabilityPresentation = projectCustomerConversationAvailability({
    available: !availabilityPaused,
    customerMessage: QA_PAUSED_AVAILABILITY.customerMessage,
    formatReopensAt: () => "4:00 PM",
    hasUnsentDraft: availabilityPaused && Boolean(draft.trim()),
    reopensAt: QA_PAUSED_AVAILABILITY.reopensAt,
  })

  return (
    <View className="flex-1 bg-background">
      <CustomerShellHeader
        backToList
        onBack={noOp}
        onToggleSound={noOp}
        soundEnabled={foregroundResponse}
        storeName="Luma Pharmacy"
        storeStatus={
          privacyRestricted
            ? "Messaging restricted"
            : accountInvitation || quoteCurrent
              ? "Quotation ready"
              : active
                ? "Ready for pickup"
                : requestChoice
                  ? "Needs information"
                  : "New conversation"
        }
      />
      {foregroundResponse ? (
        <View className="px-4 pt-4">
          <CustomerConversationTransientNotice
            message="New response from the Store. Sound alert is enabled."
            onDismiss={noOp}
            soundEnabled
            storeName="Luma Pharmacy"
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
        data={messages}
        keyExtractor={(message) => message.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          requestAnimationFrame(() =>
            listRef.current?.scrollToEnd({ animated: false }),
          )
        }
        onScroll={onConversationScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          active || requestChoice ? (
            <View className="gap-2">
              {foregroundResponse || availabilityPaused || privacyRestricted ? (
                <CustomerConversationNotice
                  availability={
                    availabilityPaused
                      ? QA_PAUSED_AVAILABILITY
                      : QA_AVAILABILITY
                  }
                  canLoadOlder={false}
                  loadingOlder={false}
                  moderation={
                    privacyRestricted ? QA_RESTRICTED_MODERATION : QA_MODERATION
                  }
                  onLoadOlder={noOp}
                  requests={[]}
                />
              ) : null}
              {whatsappOnly ? (
                <CustomerConversationChannelMode
                  channelMode={QA_WHATSAPP_ONLY_CHANNEL_MODE}
                  onOpen={noOp}
                  opening={false}
                />
              ) : null}
              {whatsappBridge ? (
                <CustomerConversationChannelMode
                  channelMode={QA_WHATSAPP_BRIDGE_CHANNEL_MODE}
                  onOpen={() => setBridgeOpening(true)}
                  opening={bridgeOpening}
                />
              ) : null}
              <QaConversationContext
                availabilityPaused={availabilityPaused}
                notificationSetup={notificationSetup}
                label={
                  accountInvitation || quoteCurrent
                    ? "Blood pressure monitor"
                    : requestChoice
                      ? "Prescription refill"
                      : "Prescription pickup"
                }
                status={
                  accountInvitation || quoteCurrent
                    ? "Quotation ready"
                    : requestChoice
                      ? "Needs information"
                      : "Ready for pickup"
                }
              />
              {privacyRestricted ? (
                <CustomerConversationPrivacyControl
                  conversationId="qa-conversation-luma"
                  inert
                  publicToken="qa-luma"
                />
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ index, item }) => {
          const boundary = resolveCustomerConversationChannelBoundary({
            channel: item.channel,
            messageId: item.id,
            previousChannel: messages[index - 1]?.channel ?? null,
          })
          return (
            <View className="gap-2">
              {boundary ? (
                <CustomerConversationChannelBoundary
                  detail={boundary.detail}
                  label={boundary.label}
                  source={boundary.source}
                />
              ) : null}
              <CustomerMessage
                accountAccess={false}
                accountInvitationInteractive={
                  interactions.accountInvitationInteractive
                }
                conversationId="qa-conversation-luma"
                message={item}
                onContactStore={noOp}
                onRecoverAttachment={noOp}
                onRefresh={async () => {}}
                publicToken="qa-luma"
                quoteInteractive={interactions.quoteInteractive}
                storeName="Luma Pharmacy"
              />
              {requestChoice ? (
                <CustomerRequestChoice
                  disabled={false}
                  onSelect={noOp}
                  requestKinds={["product_inquiry", "service", "prescription"]}
                  requests={REQUEST_CHOICE_REQUESTS}
                  selecting={false}
                />
              ) : null}
            </View>
          )
        }}
      />
      <CustomerConversationComposer
        attachment={voicePreview ? VOICE_PREVIEW_DRAFT : null}
        attachmentKinds={active ? ["audio", "document", "image"] : []}
        attachmentNotice={null}
        attachmentTargets={
          active ? [{ key: "qa-request", label: "Prescription" }] : []
        }
        disabled={availabilityPaused || privacyRestricted || whatsappOnly}
        disabledMessage={
          privacyRestricted
            ? restrictionPresentation?.recoveryLabel
            : whatsappOnly
              ? (resolveCustomerConversationDisabledComposerLabel({
                  composerEnabled: false,
                  whatsappAction: QA_WHATSAPP_ONLY_CHANNEL_MODE.whatsappAction,
                }) ?? undefined)
              : undefined
        }
        draft={draft}
        draftPreservation={
          availabilityPresentation?.draftTitle &&
          availabilityPresentation.draftDetail
            ? {
                detail: availabilityPresentation.draftDetail,
                title: availabilityPresentation.draftTitle,
              }
            : null
        }
        hasActiveRequest={false}
        onCancelAttachment={noOp}
        onCancelVoice={noOp}
        onChangeDraft={setDraft}
        onDismissVoiceNotice={noOp}
        onHeightChange={setComposerHeight}
        onPickDocument={noOp}
        onPickImage={noOp}
        onRemoveAttachment={noOp}
        onRemoveRestoredAttachment={noOp}
        onRetryAttachment={noOp}
        onSelectAttachmentTarget={noOp}
        onSend={noOp}
        onStartVoice={noOp}
        onStopVoice={noOp}
        onTogglePrescriptionConsent={noOp}
        onToggleRequestIntent={noOp}
        pickerInitiallyOpen={attachmentPicker}
        prescriptionConsentAccepted={false}
        prescriptionConsentRequired={false}
        restoredAttachmentKind={null}
        selectedAttachmentTargetKey={active ? "qa-request" : null}
        selectedAttachmentTargetLabel={
          attachmentPicker
            ? "Prescription pickup"
            : active
              ? "Prescription"
              : "Request"
        }
        sending={false}
        startingNewRequest={false}
        storeName="Luma Pharmacy"
        voiceState={
          voiceRecording
            ? {
                elapsedMs: 12_000,
                kind: "recording",
                levels: VOICE_RECORDING_LEVELS,
              }
            : { kind: "idle" }
        }
        voicePreviewPlaybackEnabled={!voicePreview}
      />
    </View>
  )
}

function QaConversationContext({
  availabilityPaused,
  label,
  notificationSetup,
  status,
}: {
  availabilityPaused: boolean
  label: string
  notificationSetup: boolean
  status: string
}) {
  const largeTextLayout = useLargeTextLayout()
  const [consented, setConsented] = useState(false)
  const [notificationChannel, setNotificationChannel] =
    useState<CustomerNotificationGuestChannel>("email")
  const [destination, setDestination] = useState("")

  return (
    <View className="gap-3 pb-2">
      <View className="items-center py-1">
        <Text className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Today
        </Text>
      </View>
      <View className="rounded-xl bg-muted px-3 py-2.5">
        <View className="min-h-9 flex-row items-center gap-3">
          <View className="size-2 rounded-full bg-primary" />
          <View className="min-w-0 flex-1">
            <Text
              className="text-sm font-bold text-foreground"
              numberOfLines={largeTextLayout ? 2 : 1}
            >
              {label}
            </Text>
            <Text
              className="text-xs text-muted-foreground"
              numberOfLines={largeTextLayout ? 2 : 1}
            >
              {status}
            </Text>
          </View>
        </View>
      </View>
      {!notificationSetup ? (
        <View
          className={
            availabilityPaused
              ? "min-h-11 flex-row items-center justify-between gap-2"
              : "min-h-11 items-end"
          }
        >
          {availabilityPaused ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-11 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3"
              onPress={noOp}
            >
              <Icon className="size-sm text-primary" name="Bell" />
              <Text
                className="min-w-0 flex-1 text-center text-xs font-bold text-primary"
                numberOfLines={1}
              >
                Notify me when available
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityHint="Configure alerts for unread Store replies"
            accessibilityLabel="Response notifications"
            accessibilityRole="button"
            accessibilityState={{ expanded: notificationSetup }}
            className="min-h-11 shrink-0 flex-row items-center gap-1.5 rounded-full px-2"
            onPress={noOp}
          >
            <Icon className="size-xs text-muted-foreground" name="Bell" />
            <Text className="text-xs font-medium text-muted-foreground">
              Notifications
            </Text>
            <Icon
              className={
                notificationSetup
                  ? "size-xs rotate-180 text-muted-foreground"
                  : "size-xs text-muted-foreground"
              }
              name="ChevronDown"
            />
          </Pressable>
        </View>
      ) : null}
      {notificationSetup ? (
        <CustomerNotificationGuestContent
          busy={false}
          channel={notificationChannel}
          code=""
          consented={consented}
          contacts={[]}
          destination={destination}
          loading={false}
          loadError={false}
          onChannelChange={(channel) => {
            setNotificationChannel(channel)
            setConsented(false)
            setDestination("")
          }}
          onChangeContact={noOp}
          onCodeChange={noOp}
          onCollapse={noOp}
          onConsentChange={setConsented}
          onDestinationChange={setDestination}
          onRemoveContact={noOp}
          onRequestCode={noOp}
          onRequestNewCode={noOp}
          onRetry={noOp}
          onVerifyCode={noOp}
          verificationId={null}
        />
      ) : null}
    </View>
  )
}
