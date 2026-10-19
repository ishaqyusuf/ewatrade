import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { Textarea } from "@/components/ui/textarea"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import {
  type CustomerMessageEventKey,
  getCustomerMessageEvent,
} from "@ewatrade/customer-messages/client"
import { usePreventRemove } from "@react-navigation/native"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Clipboard from "expo-clipboard"
import { useNavigation, useRouter } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, Linking } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { MessageBubble, MessageComposer } from "./message-composer"
import {
  LANGUAGE_OPTIONS,
  type MessageLanguage,
  type MessageTone,
  OPEN_MAX_CHARACTERS,
  type OrderMessagePreview,
  PREVIEW_STALE_MS,
  TONE_OPTIONS,
  type TemplateScope,
  blockedMessageCopy,
  expectedFor,
  hidesCachedData,
  messageLength,
  orderFacts,
  saveFailureText,
  savedMessageLabel,
  scopeTemplate,
  tryRenderMessage,
} from "./message-model"

/**
 * The one native owner for an Order's WhatsApp message. Route params are
 * opaque ids; the text and phone stay in memory and are gone on close.
 */
const SCROLL_CONTENT = { gap: 16, paddingBottom: 40, paddingHorizontal: 18 }

export function CustomerMessageScreen({
  orderId,
  eventKey: initialEvent,
  sourceId: initialSource,
}: {
  orderId: string
  eventKey?: CustomerMessageEventKey
  sourceId?: string
}) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [eventKey, setEventKey] = useState(initialEvent)
  const [sourceId, setSourceId] = useState(initialSource)
  const dirty = useRef(false)
  const [unsaved, setUnsaved] = useState(false)
  const trackDirty = useCallback((value: boolean) => {
    dirty.current = value
    setUnsaved(value)
  }, [])
  const navigation = useNavigation()
  // Back, close and swipe-down all ask before typed text is thrown away.
  usePreventRemove(unsaved, ({ data }) => {
    Alert.alert("Discard this message?", "Your changes aren’t saved.", [
      { style: "cancel", text: "Keep editing" },
      {
        onPress: () => navigation.dispatch(data.action),
        style: "destructive",
        text: "Discard",
      },
    ])
  })
  // A new event or record starts a new draft: confirm before losing one.
  const switchTo = (apply: () => void) => {
    if (!dirty.current) return apply()
    Alert.alert("Switch messages?", "Your changes aren’t saved.", [
      { style: "cancel", text: "Keep editing" },
      { onPress: apply, style: "destructive", text: "Switch" },
    ])
  }
  const query = useQuery(
    trpc.customerMessages.preview.queryOptions(
      { orderId, eventKey, sourceId },
      { enabled: !offline, retry: false, staleTime: PREVIEW_STALE_MS },
    ),
  )
  return (
    <WorkflowModalScreen
      allowSalesRep
      back
      closeLabel="Close WhatsApp message"
      title="WhatsApp message"
    >
      <KeyboardAwareScrollView
        bottomOffset={24}
        // KeyboardAwareScrollView ignores contentContainerClassName.
        contentContainerStyle={SCROLL_CONTENT}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {offline ? (
          <StatusBanner
            tone="warning"
            title="You’re offline"
            message="Messages use the order as it’s saved on the server. Reconnect to prepare one."
          />
        ) : query.isPending ? (
          <Text className="text-muted-foreground">Preparing the message…</Text>
        ) : !query.data || (query.isError && hidesCachedData(query.error)) ? (
          <StatusBanner
            tone="destructive"
            title="This message couldn’t be prepared"
            message="Check the selected Store and your access."
            actionLabel="Try again"
            onActionPress={() => void query.refetch()}
          />
        ) : (
          <>
            <MessageHeader
              preview={query.data}
              onEvent={(next) => {
                if (next === query.data.eventKey) return
                switchTo(() => {
                  setEventKey(next)
                  setSourceId(undefined)
                })
              }}
              onSource={(next) => {
                if (next === query.data.sourceId) return
                switchTo(() => setSourceId(next))
              }}
            />
            <MessageBody
              key={`${query.data.eventKey}:${query.data.sourceId ?? ""}`}
              preview={query.data}
              refreshing={query.isFetching}
              refreshFailed={query.isError}
              onRetry={() => void query.refetch()}
              onDirtyChange={trackDirty}
            />
          </>
        )}
      </KeyboardAwareScrollView>
    </WorkflowModalScreen>
  )
}

function MessageHeader({
  preview,
  onEvent,
  onSource,
}: {
  preview: OrderMessagePreview
  onEvent: (eventKey: CustomerMessageEventKey) => void
  onSource: (sourceId: string) => void
}) {
  // Payment and refund messages always show which record they describe.
  const showSources =
    preview.sourceChoices.length > 0 &&
    (preview.eventKey === "payment.recorded" ||
      preview.eventKey === "payment.refund_recorded")
  return (
    <View className="gap-4">
      <View className="gap-0.5 rounded-[20px] bg-card px-3.5 py-3 shadow-sm">
        <Text
          className="text-base font-bold text-foreground"
          numberOfLines={1}
        >
          {preview.recipient?.name || "Customer"}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {[preview.recipient?.phoneDisplay, preview.orderNumber]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {orderFacts(preview).length ? (
          <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
            {orderFacts(preview).map((fact) => (
              <Text key={fact.label} className="text-xs text-foreground">
                <Text className="text-xs text-muted-foreground">
                  {fact.label}{" "}
                </Text>
                {fact.value}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <View className="gap-2">
        <Text className="text-base font-bold text-foreground">
          Message about
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {preview.events.map((event) => {
            const selected = event.key === preview.eventKey
            return (
              <Pressable
                key={event.key}
                accessibilityLabel={`${event.label}, ${savedMessageLabel(event.state, event.scope)}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                className={cn(
                  "min-h-11 justify-center rounded-2xl px-3.5 py-2 active:opacity-80",
                  selected ? "bg-primary" : "bg-card shadow-sm",
                )}
                haptic="selection"
                onPress={() => onEvent(event.key)}
              >
                <Text
                  className={cn(
                    "text-base font-bold",
                    selected ? "text-primary-foreground" : "text-foreground",
                  )}
                >
                  {event.label}
                </Text>
                <Text
                  className={cn(
                    "text-xs",
                    selected
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  {savedMessageLabel(event.state, event.scope)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
      {showSources ? (
        <View className="gap-2">
          <Text className="text-base font-bold text-foreground">
            {preview.eventKey === "payment.refund_recorded"
              ? "Which refund?"
              : "Which payment?"}
          </Text>
          {preview.sourceChoices.map((choice) => {
            const selected = preview.sourceId === choice.id
            return (
              <Pressable
                key={choice.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                className={cn(
                  "min-h-12 flex-row items-center gap-3 rounded-2xl px-3.5 py-3 active:opacity-80",
                  selected ? "bg-tint-mint" : "bg-card shadow-sm",
                )}
                haptic="selection"
                onPress={() => onSource(choice.id)}
              >
                <Icon
                  className="size-[18px] text-foreground"
                  name={selected ? "CircleCheck" : "Square"}
                />
                <Text className="flex-1 text-base text-foreground">
                  {choice.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

type Mode =
  | { kind: "view" }
  | { kind: "edit"; text: string }
  | { kind: "compose" }

function MessageBody({
  preview,
  refreshing,
  refreshFailed,
  onRetry,
  onDirtyChange,
}: {
  preview: OrderMessagePreview
  refreshing: boolean
  /** The last re-read failed: text stays, opening waits for a good read. */
  refreshFailed: boolean
  onRetry: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const router = useRouter()
  const event = getCustomerMessageEvent(preview.eventKey)
  const [mode, setMode] = useState<Mode>(
    preview.state === "not_composed" ? { kind: "compose" } : { kind: "view" },
  )
  const [composeBody, setComposeBody] = useState("")
  // Edited text was written against these facts; new facts need a review.
  const [reviewed, setReviewed] = useState(preview.previewVersion)
  const factsChanged =
    mode.kind !== "view" && preview.previewVersion !== reviewed
  const version = mode.kind === "view" ? preview.previewVersion : reviewed
  // While order facts re-read, nothing opens or copies from the old ones.
  const holdReason = refreshing
    ? "Updating the order details…"
    : refreshFailed
      ? "Couldn’t refresh the order details. Try again."
      : factsChanged
        ? "Check the updated order details first."
        : null
  const dirty =
    (mode.kind === "edit" && mode.text !== preview.message) ||
    (mode.kind === "compose" && composeBody.trim().length > 0)
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  const retryNotice =
    refreshFailed && !refreshing ? (
      <StatusBanner
        tone="warning"
        message="Couldn’t refresh the order details. Your text is kept."
        actionLabel="Try again"
        onActionPress={onRetry}
      />
    ) : null
  const changedNotice = factsChanged ? (
    <StatusBanner
      tone="warning"
      title="This order changed"
      message="Check the recipient and details above, then continue."
      actionLabel="I’ve checked it"
      onActionPress={() => setReviewed(preview.previewVersion)}
    />
  ) : null
  const openSaved = () =>
    router.push({
      pathname: "/whatsapp-messages-settings-modal",
      params: { eventKey: preview.eventKey },
    })
  const blocked = blockedMessageCopy(preview)
  if (blocked && mode.kind !== "compose")
    return (
      <View className="gap-3">
        <StatusBanner tone="muted" message={blocked} />
        {preview.state === "disabled" && preview.canManageTemplates ? (
          <ActionButton variant="outline" onPress={openSaved}>
            Open message settings
          </ActionButton>
        ) : null}
        {preview.state === "disabled" &&
        preview.canManageTemplates &&
        preview.canComposeOneOff ? (
          <ActionButton
            variant="ghost"
            onPress={() => setMode({ kind: "compose" })}
          >
            Write a one-time message
          </ActionButton>
        ) : null}
      </View>
    )
  if (mode.kind === "compose")
    return (
      <View className="gap-4">
        {retryNotice}
        {changedNotice}
        <Composer
          preview={preview}
          body={composeBody}
          onBody={setComposeBody}
          version={version}
          holdReason={holdReason}
        />
      </View>
    )
  const text = mode.kind === "edit" ? mode.text : (preview.message ?? "")
  return (
    <View className="gap-4">
      {mode.kind === "edit" ? (
        <View className="gap-2">
          <Text className="text-base font-bold text-foreground">
            This message only
          </Text>
          <Textarea
            accessibilityLabel="This message only"
            className="min-h-40 rounded-2xl border-0 bg-card px-3.5 py-3 text-base"
            numberOfLines={10}
            onChangeText={(next) => setMode({ kind: "edit", text: next })}
            value={mode.text}
          />
          <Text className="text-xs text-muted-foreground">
            Changes here aren’t saved for other orders.
          </Text>
        </View>
      ) : (
        <MessageBubble text={text} />
      )}
      <Text className="text-xs text-muted-foreground">
        {event.label}. Send it from WhatsApp after it opens.
      </Text>
      {retryNotice}
      {changedNotice}
      <OpenActions
        preview={preview}
        text={text}
        previewVersion={version}
        disabledReason={holdReason}
      />
      <View className="flex-row flex-wrap gap-2">
        <ActionButton
          variant="ghost"
          onPress={() =>
            setMode(
              mode.kind === "view"
                ? { kind: "edit", text: preview.message ?? "" }
                : { kind: "view" },
            )
          }
        >
          {mode.kind === "view" ? "Edit this message" : "Use saved wording"}
        </ActionButton>
        {preview.canManageTemplates ? (
          <ActionButton variant="ghost" onPress={openSaved}>
            Edit saved message
          </ActionButton>
        ) : null}
      </View>
    </View>
  )
}

function Composer({
  preview,
  body,
  onBody,
  version,
  holdReason,
}: {
  preview: OrderMessagePreview
  body: string
  onBody: (body: string) => void
  version: OrderMessagePreview["previewVersion"]
  holdReason: string | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const event = getCustomerMessageEvent(preview.eventKey)
  const [scope, setScope] = useState<TemplateScope>("business")
  const [tone, setTone] = useState<MessageTone>("friendly")
  const [language, setLanguage] = useState<MessageLanguage>("en")
  const [source, setSource] = useState<"MANUAL" | "AI_ASSISTED" | "STARTER">(
    "MANUAL",
  )
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const list = useQuery(
    trpc.customerMessages.templates.list.queryOptions(undefined, {
      enabled: preview.canManageTemplates,
      retry: false,
    }),
  )
  // Saved rows this one-time draft started against; Save never adopts a
  // revision someone else wrote meanwhile.
  const guards = useRef(
    new Map<TemplateScope, ReturnType<typeof expectedFor>>(),
  )
  if (list.data)
    for (const each of ["business", "store"] as const)
      if (!guards.current.has(each))
        guards.current.set(
          each,
          expectedFor(scopeTemplate(list.data, preview.eventKey, each)),
        )
  const save = useMutation(
    trpc.customerMessages.templates.save.mutationOptions({
      // Started before a sign-out or switch: leave the new cache alone.
      onMutate: () => getDataCacheGeneration(),
      onSettled: (_result, _failure, _input, generation) => {
        if (generation !== getDataCacheGeneration()) return
        void queryClient.invalidateQueries(trpc.customerMessages.pathFilter())
      },
    }),
  )
  const draft = useMutation(trpc.customerMessages.draftWithAi.mutationOptions())
  const rendered = body.trim()
    ? tryRenderMessage(preview.eventKey, body, preview.variables)
    : null
  return (
    <View className="gap-4">
      <MessageComposer
        eventKey={preview.eventKey}
        exampleLabel={`What ${preview.recipient?.name || "the customer"} will see`}
        label={`${event.label} message`}
        onChange={(next) => {
          onBody(next)
          setNotice(null)
          if (source !== "MANUAL") setSource("MANUAL")
        }}
        value={body}
        variables={preview.variables}
      />
      <View className="flex-row flex-wrap gap-2">
        <ActionButton
          variant="outline"
          onPress={() => {
            onBody(event.starterBody)
            setSource("STARTER")
            setNotice("Starter wording added. Change anything you like.")
          }}
        >
          Use starter wording
        </ActionButton>
      </View>
      {preview.canManageTemplates ? (
        <View className="gap-2">
          <ChoiceRow
            label="Tone"
            options={TONE_OPTIONS}
            value={tone}
            onChange={setTone}
          />
          <ChoiceRow
            label="Language"
            options={LANGUAGE_OPTIONS}
            value={language}
            onChange={setLanguage}
          />
          <ActionButton
            icon="Sparkles"
            isLoading={draft.isPending}
            loadingLabel="Writing…"
            variant="outline"
            onPress={() => {
              setProblem(null)
              draft.mutate(
                { eventKeys: [preview.eventKey], tone, language },
                {
                  onSuccess: (result) => {
                    const next = result.drafts.find(
                      (row) => row.eventKey === preview.eventKey,
                    )
                    if (!next) {
                      setProblem("No draft came back. Write your own here.")
                      return
                    }
                    onBody(next.body)
                    setSource(next.source)
                    setNotice(
                      result.source === "ai"
                        ? "Draft ready. Read it before you use it."
                        : `Starter wording; AI unavailable${result.reason ? ` (${result.reason})` : ""}.`,
                    )
                  },
                  onError: (failure) => setProblem(failure.message),
                },
              )
            }}
          >
            Help me write
          </ActionButton>
        </View>
      ) : null}
      {notice ? (
        <Text className="text-xs text-muted-foreground">{notice}</Text>
      ) : null}
      {problem ? <StatusBanner tone="destructive" message={problem} /> : null}
      {preview.canComposeOneOff ? (
        <OpenActions
          preview={preview}
          text={rendered?.text ?? ""}
          previewVersion={version}
          disabledReason={
            holdReason
              ? holdReason
              : !body.trim()
                ? "Write a message first."
                : rendered?.problem
                  ? "Fix the message first."
                  : null
          }
        />
      ) : null}
      {preview.canManageTemplates ? (
        <View className="gap-3 rounded-[20px] bg-card px-3.5 py-3 shadow-sm">
          <Text className="text-base text-foreground">
            Save it so future {event.label.toLowerCase()} messages are ready.
          </Text>
          <ChoiceRow
            label="Save for"
            options={[
              { value: "business", label: "All Stores" },
              {
                value: "store",
                label: list.data ? `${list.data.storeName} only` : "This Store",
              },
            ]}
            value={scope}
            onChange={setScope}
          />
          <ActionButton
            disabled={!list.data || !body.trim() || Boolean(rendered?.problem)}
            isLoading={save.isPending}
            loadingLabel="Saving…"
            tone="soft"
            onPress={() => {
              if (!list.data) return
              setProblem(null)
              save.mutate(
                {
                  eventKey: preview.eventKey,
                  scope,
                  body,
                  enabled: true,
                  source,
                  ...(guards.current.get(scope) ?? { expectedRevision: 0 }),
                },
                {
                  onSuccess: (result) => {
                    guards.current.set(
                      scope,
                      result.removed
                        ? { expectedRevision: 0 }
                        : expectedFor(result.template),
                    )
                    setNotice("Message saved.")
                  },
                  onError: (failure) => setProblem(saveFailureText(failure)),
                },
              )
            }}
          >
            Save message
          </ActionButton>
        </View>
      ) : null}
    </View>
  )
}

export function ChoiceRow<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: ReadonlyArray<{ value: Value; label: string }>
  value: Value
  onChange: (value: Value) => void
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`${label}: ${option.label}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              className={cn(
                "min-h-10 justify-center rounded-full px-3.5 active:opacity-80",
                selected ? "bg-primary" : "bg-muted",
              )}
              haptic="selection"
              onPress={() => onChange(option.value)}
            >
              <Text
                className={cn(
                  "text-xs font-semibold",
                  selected ? "text-primary-foreground" : "text-foreground",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/**
 * Open WhatsApp checks current facts first (prepareOpen), then hands the
 * prepared link to the phone. Copy always keeps the exact text.
 */
function OpenActions({
  preview,
  text,
  previewVersion,
  disabledReason = null,
}: {
  preview: OrderMessagePreview
  text: string
  /** The facts this text was reviewed against. */
  previewVersion: OrderMessagePreview["previewVersion"]
  disabledReason?: string | null
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const prepare = useMutation(
    trpc.customerMessages.prepareOpen.mutationOptions(),
  )
  const mounted = useRef(true)
  const operation = useRef(0)
  const latest = useRef({ text, previewVersion })
  latest.current = { text, previewVersion }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const reason =
    disabledReason ??
    (!text.trim()
      ? "Write a message first."
      : messageLength(text) > OPEN_MAX_CHARACTERS
        ? `Keep this message under ${OPEN_MAX_CHARACTERS.toLocaleString()} characters for the link, or copy it instead.`
        : null)
  return (
    <View className="gap-2">
      <ActionButton
        disabled={Boolean(reason)}
        icon="WhatsApp"
        isLoading={prepare.isPending}
        loadingLabel="Checking…"
        onPress={() => {
          setProblem(null)
          setStatus(null)
          // Bound to this text and these facts; nothing opens for a closed
          // screen or a context that changed while we waited.
          operation.current += 1
          const started = { id: operation.current, text, previewVersion }
          const stillCurrent = () =>
            mounted.current &&
            operation.current === started.id &&
            latest.current.text === started.text &&
            latest.current.previewVersion === started.previewVersion
          void prepare
            .mutateAsync({
              orderId: preview.orderId,
              eventKey: preview.eventKey,
              sourceId: preview.sourceId ?? undefined,
              previewVersion,
              body: text,
            })
            .then(
              (result) => {
                if (!stillCurrent()) return
                if (result.state === "ready" && result.waUrl) {
                  void Linking.openURL(result.waUrl).then(
                    () => setStatus("WhatsApp opened. Send it there."),
                    () =>
                      setProblem(
                        "WhatsApp couldn’t be opened on this phone. Copy the message instead.",
                      ),
                  )
                  return
                }
                setProblem(
                  "Order details changed since this message was prepared. Check it again; your text is kept.",
                )
                void queryClient.invalidateQueries(
                  trpc.customerMessages.preview.pathFilter(),
                )
              },
              (failure: unknown) => {
                if (!stillCurrent()) return
                setProblem(
                  failure instanceof Error
                    ? failure.message
                    : "WhatsApp couldn’t be opened. Copy the message instead.",
                )
              },
            )
        }}
      >
        Open WhatsApp
      </ActionButton>
      <ActionButton
        disabled={!text.trim() || Boolean(disabledReason)}
        icon="Copy"
        variant="outline"
        onPress={() =>
          void Clipboard.setStringAsync(text).then(
            () => setStatus("Message copied."),
            () => setProblem("Copy didn’t work. Select the text instead."),
          )
        }
      >
        Copy
      </ActionButton>
      {reason && text.trim() ? (
        <Text className="text-xs text-muted-foreground">{reason}</Text>
      ) : null}
      {status ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs text-muted-foreground"
        >
          {status}
        </Text>
      ) : null}
      {problem ? <StatusBanner tone="destructive" message={problem} /> : null}
    </View>
  )
}
