import { ActionButton } from "@/components/mobile/action-button"
import {
  ListCard,
  RecordRow,
  SectionHeader,
  StatusPill,
} from "@/components/mobile/green-till/kit"
import { StatusBanner } from "@/components/mobile/status-banner"
import {
  WorkflowModalScreen,
  useWorkflowHeader,
} from "@/components/mobile/workflow-modal-screen"
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
  customerMessageEvents,
  getCustomerMessageEvent,
} from "@ewatrade/customer-messages/client"
import { usePreventRemove } from "@react-navigation/native"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigation } from "expo-router"
import { useEffect, useState } from "react"
import { Alert } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { MessageBubble, MessageComposer } from "./message-composer"
import {
  LANGUAGE_OPTIONS,
  type MessageLanguage,
  type MessageTone,
  TONE_OPTIONS,
  type TemplateList,
  type TemplateScope,
  type TemplateWrite,
  type TemplateWriteResult,
  type WriteContext,
  adoptOwnWrite,
  applyTemplateWriteIfCurrent,
  captureBaselines,
  editorStateFor,
  expectedFor,
  reconcileEditor,
  sampleMessageVariables,
  saveFailureText,
  savedMessageLabel,
  scopeTemplate,
  tryRenderMessage,
  writeContextIsCurrent,
} from "./message-model"
import { ChoiceRow } from "./message-screen"

const SAMPLE_LABEL = "Example with sample details"

type SettingsView =
  | { kind: "list" }
  | { kind: "edit"; eventKey: CustomerMessageEventKey }
  | { kind: "compose-all" }

function useTemplateWrites() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const listKey = trpc.customerMessages.templates.list.queryKey()
  const now = (): WriteContext => ({
    storeId: queryClient.getQueryData(listKey)?.storeId ?? undefined,
    generation: getDataCacheGeneration(),
  })
  const options = {
    // Bound to the Store list and cache generation the write started in.
    onMutate: (): WriteContext => now(),
    onSuccess: async (
      result: TemplateWriteResult,
      write: TemplateWrite,
      started: WriteContext | undefined,
    ) => {
      if (!writeContextIsCurrent(started, now())) return
      // A list read already in flight predates this write: drop it first.
      await queryClient.cancelQueries({ queryKey: listKey })
      if (!writeContextIsCurrent(started, now())) return
      queryClient.setQueryData(listKey, (current) =>
        applyTemplateWriteIfCurrent(current, started?.storeId, write, result),
      )
    },
    // Not awaited: per-call callbacks run before the background refetch.
    onSettled: (
      _result: unknown,
      _failure: unknown,
      _write: TemplateWrite,
      started: WriteContext | undefined,
    ) => {
      if (!writeContextIsCurrent(started, now())) return
      void queryClient.invalidateQueries(trpc.customerMessages.pathFilter())
    },
  }
  return {
    save: useMutation(
      trpc.customerMessages.templates.save.mutationOptions(options),
    ),
    reset: useMutation(
      trpc.customerMessages.templates.reset.mutationOptions(options),
    ),
    setEnabled: useMutation(
      trpc.customerMessages.templates.setEnabled.mutationOptions(options),
    ),
  }
}

/** More → WhatsApp messages (Owner/Admin). */
const SCROLL_CONTENT = { gap: 16, paddingBottom: 40, paddingHorizontal: 18 }

export function WhatsAppMessageSettingsScreen({
  initialEvent,
}: {
  initialEvent?: CustomerMessageEventKey
}) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [view, setView] = useState<SettingsView>(
    initialEvent ? { kind: "edit", eventKey: initialEvent } : { kind: "list" },
  )
  const [scope, setScope] = useState<TemplateScope>("business")
  const [notice, setNotice] = useState<string | null>(null)
  // Unsaved wording or AI drafts: every way out asks first.
  const [dirty, setDirty] = useState(false)
  const navigation = useNavigation()
  const confirmLeave = (apply: () => void) => {
    if (!dirty) return apply()
    Alert.alert("Discard your changes?", "This wording isn’t saved.", [
      { style: "cancel", text: "Keep editing" },
      {
        onPress: () => {
          setDirty(false)
          apply()
        },
        style: "destructive",
        text: "Discard",
      },
    ])
  }
  usePreventRemove(dirty, ({ data }) =>
    confirmLeave(() => navigation.dispatch(data.action)),
  )
  const list = useQuery(
    trpc.customerMessages.templates.list.queryOptions(undefined, {
      enabled: !offline,
      retry: false,
    }),
  )
  return (
    <WorkflowModalScreen
      closeHref="/admin-home"
      closeLabel="Close WhatsApp messages"
      title="WhatsApp messages"
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
            message="Reconnect to change saved messages."
          />
        ) : list.isPending ? (
          <Text className="text-muted-foreground">Loading messages…</Text>
        ) : list.isError ? (
          <StatusBanner
            tone="destructive"
            title="Messages unavailable"
            message={list.error.message}
            actionLabel="Try again"
            onActionPress={() => void list.refetch()}
          />
        ) : (
          <>
            <ChoiceRow
              label="Wording for"
              options={[
                { value: "business", label: "All Stores" },
                { value: "store", label: list.data.storeName },
              ]}
              value={scope}
              onChange={(next) =>
                confirmLeave(() => {
                  setNotice(null)
                  setScope(next)
                })
              }
            />
            {notice ? <StatusBanner tone="success" message={notice} /> : null}
            {view.kind === "list" ? (
              <TemplateRows
                list={list.data}
                scope={scope}
                onEdit={(eventKey) => {
                  setNotice(null)
                  setView({ kind: "edit", eventKey })
                }}
                onComposeAll={() => {
                  setNotice(null)
                  setView({ kind: "compose-all" })
                }}
              />
            ) : view.kind === "edit" ? (
              <TemplateEditor
                // New rows start fresh; revisions never swap typed text.
                key={`${view.eventKey}:${scope}`}
                eventKey={view.eventKey}
                list={list.data}
                scope={scope}
                onNotice={setNotice}
                onDirtyChange={setDirty}
                onBack={() => confirmLeave(() => setView({ kind: "list" }))}
              />
            ) : (
              <ComposeAll
                list={list.data}
                scope={scope}
                onDirtyChange={setDirty}
                onBack={() => confirmLeave(() => setView({ kind: "list" }))}
              />
            )}
          </>
        )}
      </KeyboardAwareScrollView>
    </WorkflowModalScreen>
  )
}

function rowState(
  list: TemplateList,
  eventKey: CustomerMessageEventKey,
  scope: TemplateScope,
) {
  const row = scopeTemplate(list, eventKey, scope)
  if (scope === "business")
    return {
      row,
      state: row ? (row.enabled ? "composed" : "disabled") : "missing",
      label: savedMessageLabel(
        row ? (row.enabled ? "composed" : "disabled") : "missing",
        "business",
      ),
    } as const
  const effective =
    list.statuses.find((status) => status.eventKey === eventKey)?.state ??
    "missing"
  return {
    row,
    state: effective,
    label: row
      ? savedMessageLabel(effective, "store")
      : effective === "missing"
        ? "Not written yet"
        : `${savedMessageLabel(effective, "business")} · business wording`,
  } as const
}

function TemplateRows({
  list,
  scope,
  onEdit,
  onComposeAll,
}: {
  list: TemplateList
  scope: TemplateScope
  onEdit: (eventKey: CustomerMessageEventKey) => void
  onComposeAll: () => void
}) {
  const missing = list.statuses.filter((row) => row.state === "missing").length
  return (
    <View className="gap-3">
      <Text className="text-[13px] text-muted-foreground">
        {scope === "business"
          ? "Staff see these ready on orders, edit them for one customer if needed, then send from WhatsApp."
          : `What ${list.storeName} uses. Keep the business wording, write its own, or turn a message off.`}
      </Text>
      <ActionButton icon="Sparkles" tone="soft" onPress={onComposeAll}>
        {missing ? `Write ${missing} missing` : "Compose all"}
      </ActionButton>
      <SectionHeader title="Messages" />
      <ListCard>
        {customerMessageEvents.map((event) => {
          const { state, label } = rowState(list, event.key, scope)
          return (
            <RecordRow
              key={event.key}
              accessibilityLabel={`${event.label}, ${label}`}
              avatar={{
                icon: "WhatsApp",
                // Green only when written and on; otherwise neutral grey.
                tint: state === "composed" ? "mint" : "muted",
              }}
              meta={event.description}
              onPress={() => onEdit(event.key)}
              status={
                <StatusPill
                  label={label}
                  tone={
                    state === "composed"
                      ? "ok"
                      : state === "disabled"
                        ? "warn"
                        : "muted"
                  }
                />
              }
              stackDetails
              title={event.label}
            />
          )
        })}
      </ListCard>
    </View>
  )
}

function TemplateEditor({
  eventKey,
  list,
  scope,
  onNotice,
  onBack,
  onDirtyChange,
}: {
  eventKey: CustomerMessageEventKey
  list: TemplateList
  scope: TemplateScope
  onNotice: (notice: string | null) => void
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const trpc = useTRPC()
  const event = getCustomerMessageEvent(eventKey)
  useWorkflowHeader({
    title: event.label,
    backLabel: "Back to messages",
    onBack,
  })
  const row = scopeTemplate(list, eventKey, scope)
  const business = scopeTemplate(list, eventKey, "business")
  const inherits = scope === "store" && !row
  const [writing, setWriting] = useState(!inherits)
  // Text plus the saved row it writes against; a refetched row is adopted
  // only while nothing is typed, otherwise the guard stays and we ask.
  const [editor, setEditor] = useState(() => editorStateFor(row))
  const reconciled = reconcileEditor(editor, row)
  if (reconciled !== editor) setEditor(reconciled)
  const body = editor.body
  const setBody = (next: string) =>
    setEditor((current) => ({ ...current, body: next }))
  const adopt = (result: TemplateWriteResult) =>
    setEditor((current) => adoptOwnWrite(current, result))
  const unsaved = writing && body !== editor.baseline
  useEffect(() => onDirtyChange(unsaved), [unsaved, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  const [source, setSource] = useState<"MANUAL" | "AI_ASSISTED" | "STARTER">(
    "MANUAL",
  )
  const [tone, setTone] = useState<MessageTone>("friendly")
  const [language, setLanguage] = useState<MessageLanguage>("en")
  const [problem, setProblem] = useState<string | null>(null)
  const { save, reset, setEnabled } = useTemplateWrites()
  const draft = useMutation(trpc.customerMessages.draftWithAi.mutationOptions())
  const busy =
    save.isPending || reset.isPending || setEnabled.isPending || draft.isPending
  const variables = sampleMessageVariables({
    businessName: list.businessName,
    storeName: list.storeName,
  })
  const rendered = body.trim()
    ? tryRenderMessage(eventKey, body, variables)
    : null
  const fail = (failure: unknown) => setProblem(saveFailureText(failure))
  const scopeNote =
    scope === "business"
      ? "Every Store uses this unless it has its own wording."
      : row?.enabled
        ? `${list.storeName} uses its own wording.`
        : row
          ? `Turned off for ${list.storeName}. The business wording isn’t used here either.`
          : `${list.storeName} uses the business wording.`
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-[13px] text-muted-foreground">
          {event.description}
        </Text>
        <Text className="text-[14px] text-foreground">{scopeNote}</Text>
      </View>
      {inherits && !writing ? (
        <View className="gap-3">
          {business?.enabled ? (
            <View className="gap-2">
              <Text className="text-[12px] text-muted-foreground">
                Business wording · {SAMPLE_LABEL.toLowerCase()}
              </Text>
              {(() => {
                const shown = tryRenderMessage(
                  eventKey,
                  business.body,
                  variables,
                )
                return shown.text ? (
                  <MessageBubble text={shown.text} />
                ) : (
                  <Text className="text-destructive">{shown.problem}</Text>
                )
              })()}
            </View>
          ) : (
            <Text className="text-muted-foreground">
              There’s no business wording yet.
            </Text>
          )}
          <ActionButton
            variant="outline"
            onPress={() => {
              setBody(business?.body ?? "")
              setWriting(true)
            }}
          >
            Write wording for {list.storeName}
          </ActionButton>
          <ActionButton
            isLoading={setEnabled.isPending}
            variant="ghost"
            onPress={() =>
              setEnabled.mutate(
                { eventKey, scope, enabled: false, ...editor.guard },
                {
                  onSuccess: (result) => {
                    adopt(result)
                    onNotice(`Turned off for ${list.storeName}.`)
                  },
                  onError: fail,
                },
              )
            }
          >
            Turn off for {list.storeName}
          </ActionButton>
        </View>
      ) : (
        <>
          <MessageComposer
            editable={!busy}
            eventKey={eventKey}
            exampleLabel={SAMPLE_LABEL}
            label="Message"
            onChange={(next) => {
              setBody(next)
              if (source !== "MANUAL") setSource("MANUAL")
            }}
            value={body}
            variables={variables}
          />
          <ActionButton
            variant="outline"
            disabled={busy}
            onPress={() => {
              setBody(event.starterBody)
              setSource("STARTER")
            }}
          >
            Use starter wording
          </ActionButton>
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
            disabled={busy}
            onPress={() => {
              setProblem(null)
              draft.mutate(
                { eventKeys: [eventKey], tone, language },
                {
                  onSuccess: (result) => {
                    const next = result.drafts.find(
                      (item) => item.eventKey === eventKey,
                    )
                    if (!next) {
                      setProblem("No draft came back. Write your own here.")
                      return
                    }
                    setBody(next.body)
                    setSource(next.source)
                    onNotice(
                      result.source === "ai"
                        ? "Draft ready. Read it, then save."
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
          <ActionButton
            disabled={busy || !body.trim() || Boolean(rendered?.problem)}
            isLoading={save.isPending}
            loadingLabel="Saving…"
            onPress={() => {
              setProblem(null)
              save.mutate(
                {
                  eventKey,
                  scope,
                  body,
                  enabled: true,
                  source,
                  ...editor.guard,
                },
                {
                  onSuccess: (result) => {
                    adopt(result)
                    onNotice("Message saved.")
                  },
                  onError: fail,
                },
              )
            }}
          >
            {row?.enabled === false ? "Save and turn on" : "Save message"}
          </ActionButton>
          {row?.enabled ? (
            <ActionButton
              isLoading={setEnabled.isPending}
              variant="outline"
              disabled={busy}
              onPress={() =>
                setEnabled.mutate(
                  { eventKey, scope, enabled: false, ...editor.guard },
                  {
                    onSuccess: (result) => {
                      adopt(result)
                      onNotice("Turned off.")
                    },
                    onError: fail,
                  },
                )
              }
            >
              Turn off
            </ActionButton>
          ) : null}
          {scope === "store" && row ? (
            <ActionButton
              isLoading={reset.isPending}
              variant="ghost"
              disabled={busy}
              onPress={() =>
                reset.mutate(
                  { eventKey, scope, ...editor.guard },
                  {
                    onSuccess: (result) => {
                      adopt(result)
                      setWriting(false)
                      onNotice(
                        `${list.storeName} uses the business wording again.`,
                      )
                    },
                    onError: fail,
                  },
                )
              }
            >
              Use business wording
            </ActionButton>
          ) : null}
        </>
      )}
      {editor.conflict ? (
        <View className="gap-2">
          <StatusBanner
            tone="warning"
            title="Someone else changed this message"
            message={
              row?.body
                ? `Your text is kept. Saved now: ${row.body}`
                : "Your text is kept. The saved message was removed."
            }
          />
          <ActionButton
            variant="outline"
            onPress={() => setEditor(editorStateFor(row))}
          >
            Use their version
          </ActionButton>
          <ActionButton
            variant="ghost"
            onPress={() =>
              setEditor((current) => ({
                ...editorStateFor(row),
                body: current.body,
              }))
            }
          >
            Keep mine and save over it
          </ActionButton>
        </View>
      ) : null}
      {problem ? <StatusBanner tone="destructive" message={problem} /> : null}
    </View>
  )
}

type Draft = {
  eventKey: CustomerMessageEventKey
  body: string
  source: "AI_ASSISTED" | "STARTER"
  selected: boolean
  result: { ok: true } | { ok: false; message: string } | null
  /** Saved row this draft was written against; Save never moves it. */
  expected: ReturnType<typeof expectedFor>
}

function ComposeAll({
  list,
  scope,
  onBack,
  onDirtyChange,
}: {
  list: TemplateList
  scope: TemplateScope
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const trpc = useTRPC()
  useWorkflowHeader({
    title: "Compose all",
    backLabel: "Back to messages",
    onBack,
  })
  const statusOf = (eventKey: CustomerMessageEventKey) =>
    list.statuses.find((row) => row.eventKey === eventKey)
  const [chosen, setChosen] = useState<CustomerMessageEventKey[]>(() =>
    customerMessageEvents
      .filter((event) => statusOf(event.key)?.state !== "composed")
      .map((event) => event.key),
  )
  const [tone, setTone] = useState<MessageTone>("friendly")
  const [language, setLanguage] = useState<MessageLanguage>("en")
  const [instructions, setInstructions] = useState("")
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [origin, setOrigin] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [writing, setWriting] = useState(false)
  const generate = useMutation(
    trpc.customerMessages.draftWithAi.mutationOptions(),
  )
  const { save } = useTemplateWrites()
  const variables = sampleMessageVariables({
    businessName: list.businessName,
    storeName: list.storeName,
  })
  const scopeName = scope === "business" ? "all Stores" : list.storeName
  const unsaved = Boolean(
    drafts?.some((draft) => draft.selected && !draft.result?.ok),
  )
  useEffect(() => onDirtyChange(unsaved), [unsaved, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  const update = (eventKey: CustomerMessageEventKey, patch: Partial<Draft>) =>
    setDrafts(
      (current) =>
        current?.map((draft) =>
          draft.eventKey === eventKey ? { ...draft, ...patch } : draft,
        ) ?? null,
    )

  async function saveSelected() {
    if (!drafts) return
    setSaving(true)
    for (const draft of drafts) {
      if (!draft.selected || draft.result?.ok) continue
      try {
        await save.mutateAsync({
          eventKey: draft.eventKey,
          scope,
          body: draft.body,
          enabled: true,
          source: draft.source,
          ...draft.expected,
        })
        update(draft.eventKey, { result: { ok: true } })
      } catch (failure) {
        update(draft.eventKey, {
          result: { ok: false, message: saveFailureText(failure) },
        })
      }
    }
    setSaving(false)
  }

  if (!drafts)
    return (
      <View className="gap-4">
        <Text className="text-[13px] text-muted-foreground">
          Drafts are saved for {scopeName} only when you choose Save selected.
        </Text>
        <ListCard>
          {customerMessageEvents.map((event) => {
            const selected = chosen.includes(event.key)
            const state = statusOf(event.key)?.state ?? "missing"
            return (
              <Pressable
                key={event.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                className="-mx-3.5 min-h-[56px] flex-row items-center gap-3 px-3.5 py-3 active:opacity-80"
                haptic="selection"
                onPress={() =>
                  setChosen((current) =>
                    selected
                      ? current.filter((key) => key !== event.key)
                      : [...current, event.key],
                  )
                }
              >
                <Icon
                  className="size-[20px] text-foreground"
                  name={selected ? "CheckSquare" : "Square"}
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-[15px] font-semibold text-foreground">
                    {event.label}
                  </Text>
                  <Text className="text-[12px] text-muted-foreground">
                    {state === "composed"
                      ? "Replaces the saved wording if you save it"
                      : savedMessageLabel(
                          state,
                          statusOf(event.key)?.scope ?? null,
                        )}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </ListCard>
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
        <View className="gap-1.5">
          <Text className="text-[12px] text-muted-foreground">
            Anything to include? (optional)
          </Text>
          <Textarea
            accessibilityLabel="Anything to include"
            className="min-h-20 rounded-2xl border-0 bg-card px-3.5 py-3 text-[15px]"
            maxLength={500}
            numberOfLines={4}
            onChangeText={setInstructions}
            placeholder="For example: sign off with “– the Mama Put team”."
            value={instructions}
          />
        </View>
        {problem ? <StatusBanner tone="destructive" message={problem} /> : null}
        <ActionButton
          disabled={!chosen.length}
          icon="Sparkles"
          isLoading={writing}
          loadingLabel="Writing drafts…"
          onPress={async () => {
            setProblem(null)
            const baseline = captureBaselines(list, chosen, scope)
            setWriting(true)
            try {
              // Awaited, not observer callbacks: a remount can't strand it.
              const result = await generate.mutateAsync({
                eventKeys: chosen,
                tone,
                language,
                instructions: instructions.trim() || undefined,
              })
              setOrigin(
                result.source === "ai"
                  ? "Drafts ready. Read each one before you save."
                  : `Starter wording; AI unavailable${result.reason ? ` (${result.reason})` : ""}. Edit before you save.`,
              )
              setDrafts(
                result.drafts.map((draft) => ({
                  ...draft,
                  selected: true,
                  result: null,
                  expected: baseline.get(draft.eventKey) ?? {
                    expectedRevision: 0,
                  },
                })),
              )
            } catch (failure) {
              setProblem(
                failure instanceof Error
                  ? failure.message
                  : "Drafts couldn’t be written. Try again.",
              )
            } finally {
              setWriting(false)
            }
          }}
        >
          {`Write ${chosen.length} draft${chosen.length === 1 ? "" : "s"}`}
        </ActionButton>
      </View>
    )

  const pending = drafts.filter((draft) => draft.result?.ok !== true)
  const selectedCount = pending.filter((draft) => draft.selected).length
  const blocked = pending.some(
    (draft) =>
      draft.selected &&
      tryRenderMessage(draft.eventKey, draft.body, variables).problem,
  )
  const allSaved = drafts.every((draft) => !draft.selected || draft.result?.ok)
  return (
    <View className="gap-4">
      {origin ? (
        <Text className="text-[13px] text-muted-foreground">{origin}</Text>
      ) : null}
      {drafts.map((draft) => (
        <View
          key={draft.eventKey}
          className="gap-3 rounded-[20px] bg-card px-3.5 py-3 shadow-sm"
        >
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{
              checked: draft.selected,
              disabled: saving || draft.result?.ok === true,
            }}
            className="min-h-11 flex-row items-center gap-3 active:opacity-80"
            disabled={saving || draft.result?.ok === true}
            haptic="selection"
            onPress={() =>
              update(draft.eventKey, { selected: !draft.selected })
            }
          >
            <Icon
              className="size-[20px] text-foreground"
              name={draft.selected ? "CheckSquare" : "Square"}
            />
            <Text className="flex-1 text-[15px] font-bold text-foreground">
              {getCustomerMessageEvent(draft.eventKey).label}
            </Text>
            <Text
              className={cn(
                "text-[12px]",
                draft.result?.ok
                  ? "text-tint-mint-foreground"
                  : "text-muted-foreground",
              )}
            >
              {draft.result?.ok
                ? "Saved"
                : draft.source === "STARTER"
                  ? "Starter wording"
                  : "AI draft"}
            </Text>
          </Pressable>
          {draft.result?.ok ? null : (
            <MessageComposer
              editable={!saving}
              eventKey={draft.eventKey}
              exampleLabel={SAMPLE_LABEL}
              label="Wording"
              onChange={(body) =>
                update(draft.eventKey, { body, result: null })
              }
              value={draft.body}
              variables={variables}
            />
          )}
          {draft.result && !draft.result.ok ? (
            <View className="gap-2">
              <StatusBanner tone="destructive" message={draft.result.message} />
              {(() => {
                // Show what's saved now; keeping the draft is a choice.
                const now = scopeTemplate(list, draft.eventKey, scope)
                const shown = now?.body
                  ? tryRenderMessage(draft.eventKey, now.body, variables)
                  : null
                return (
                  <>
                    {shown?.text ? (
                      <>
                        <Text className="text-[12px] text-muted-foreground">
                          Saved now · {SAMPLE_LABEL.toLowerCase()}
                        </Text>
                        <MessageBubble text={shown.text} />
                      </>
                    ) : null}
                    <ActionButton
                      variant="outline"
                      onPress={() =>
                        update(draft.eventKey, {
                          result: null,
                          expected: expectedFor(now),
                        })
                      }
                    >
                      Keep my draft instead
                    </ActionButton>
                  </>
                )
              })()}
            </View>
          ) : null}
        </View>
      ))}
      {allSaved ? (
        <ActionButton onPress={onBack}>Done</ActionButton>
      ) : (
        <ActionButton
          disabled={!selectedCount || blocked}
          isLoading={saving}
          loadingLabel="Saving…"
          onPress={() => void saveSelected()}
        >
          {`Save ${selectedCount} selected for ${scopeName}`}
        </ActionButton>
      )}
      <ActionButton
        disabled={saving}
        variant="ghost"
        onPress={() => setDrafts(null)}
      >
        Start over
      </ActionButton>
    </View>
  )
}
