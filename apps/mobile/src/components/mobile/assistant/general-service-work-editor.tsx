import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  type ServiceWorkEditorAction,
  type ServiceWorkEditorContext,
  serviceWorkEditorActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { ActionButton } from "../action-button"
import { FormField } from "../form-field"
import {
  type NativeServiceWorkScope,
  createNativeServiceWorkSave,
  nativeServiceWorkAssignees,
  nativeServiceWorkCandidate,
  nativeServiceWorkContext,
  nativeServiceWorkReview,
  nativeServiceWorkScope,
  nativeServiceWorkTarget,
} from "./native-service-work-values"

type Props = {
  initial: ServiceWorkEditorAction
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}
const readOptions = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}
const human = (value: string) => value.toLowerCase().replaceAll("_", " ")

export function GeneralServiceWorkEditor(props: Props) {
  const { profile } = useAuthContext()
  const parsed = serviceWorkEditorActionSchema.safeParse(props.initial)
  const key = JSON.stringify([
    profile?.id,
    profile?.businessId,
    profile?.storeId,
    profile?.role,
    profile?.staffAccessMode,
    profile?.catalogEditor,
    profile?.status,
    props.initial,
  ])
  const currentKey = useRef(key)
  const mounted = useRef(true)
  currentKey.current = key
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  if (!parsed.success)
    return (
      <Text accessibilityRole="alert">
        This saved service draft is invalid. Open a fresh draft in chat.
      </Text>
    )
  if (
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    (profile.status !== undefined && profile.status !== "ACTIVE") ||
    !["OWNER", "ADMIN", "MANAGER"].includes(profile.role ?? "") ||
    (profile.role === "MANAGER" && profile.staffAccessMode !== "LEGACY")
  )
    return (
      <Text accessibilityRole="alert">
        Current Owner, Admin or legacy Manager service access and a selected
        Store are required.
      </Text>
    )
  const scope: NativeServiceWorkScope = {
    tenantId: profile.businessId,
    storeId: profile.storeId,
    actorUserId: profile.id,
    role: profile.role ?? "",
    accessMode: profile.staffAccessMode,
  }
  return (
    <WorkEditor
      key={key}
      {...props}
      initial={parsed.data}
      scope={scope}
      isCurrentScope={() => mounted.current && currentKey.current === key}
    />
  )
}

function WorkEditor({
  initial,
  disabled,
  onSave,
  scope,
  isCurrentScope,
}: Props & { scope: NativeServiceWorkScope; isCurrentScope: () => boolean }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const [mount] = useState(nextReadMount)
  const [draft, setDraft] = useState(initial)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [pending, setPending] = useState(false)
  const [invalidated, setInvalidated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const ticket = useRef<object | null>(null)
  const latest = useRef({ disabled, onSave, isCurrentScope })
  latest.current = { disabled, onSave, isCurrentScope }
  const tenantQuery = useQuery(
    mountOwnedRead(
      trpc.tenant.current.queryOptions(undefined, readOptions),
      mount,
    ),
  )
  const tenantRead = freshShownRead(tenantQuery)
  let tenantReady = false
  if (tenantRead.state === "ready") {
    try {
      nativeServiceWorkScope(tenantRead.data, scope)
      tenantReady = true
    } catch {}
  }
  const input = nativeServiceWorkTarget(initial)
  const contextQuery = useQuery(
    mountOwnedRead(
      trpc.serviceAssistantWork.editorContext.queryOptions(input, {
        ...readOptions,
        enabled: tenantReady,
      }),
      mount,
    ),
  )
  const contextRead = freshShownRead(contextQuery)
  let context: ServiceWorkEditorContext | null = null
  if (tenantReady && contextRead.state === "ready") {
    try {
      context = nativeServiceWorkContext(contextRead.data, scope, initial)
    } catch {}
  }
  const assigning = initial.action === "service_job_assign"
  const namesQuery = useQuery(
    mountOwnedRead(
      trpc.services.assignees.queryOptions(undefined, {
        ...readOptions,
        enabled: assigning && Boolean(context?.assigneesComplete),
      }),
      mount,
    ),
  )
  const namesRead = freshShownRead(namesQuery)
  let assignees: ReturnType<typeof nativeServiceWorkAssignees> | null = null
  if (assigning && context && namesRead.state === "ready") {
    try {
      assignees = nativeServiceWorkAssignees(context, namesRead.data)
    } catch {}
  }
  let initialCanReview = false
  if (context) {
    try {
      nativeServiceWorkCandidate(initial, initial, context, scope)
      initialCanReview = true
    } catch {}
  }
  const reviewEnabled =
    Boolean(context) && initialCanReview && (!assigning || Boolean(assignees))
  const reviewQuery = useQuery(
    mountOwnedRead(
      trpc.serviceAssistantWork.review.queryOptions(initial, {
        ...readOptions,
        enabled: reviewEnabled,
      }),
      mount,
    ),
  )
  const reviewRead = freshShownRead(reviewQuery)
  let review: ReturnType<typeof nativeServiceWorkReview> | null = null
  if (reviewEnabled && reviewRead.state === "ready") {
    try {
      review = nativeServiceWorkReview(reviewRead.data, scope, initial)
    } catch {}
  }
  const checking =
    tenantRead.state === "checking" ||
    (tenantReady && contextRead.state === "checking") ||
    (assigning &&
      context?.assigneesComplete &&
      namesRead.state === "checking") ||
    (reviewEnabled && reviewRead.state === "checking")
  const ready =
    !invalidated &&
    tenantReady &&
    context &&
    (!assigning || assignees) &&
    (!reviewEnabled || review)
  const busy = disabled || pending || !ready
  const current = () =>
    mounted.current &&
    latest.current.isCurrentScope() &&
    !latest.current.disabled
  const [saveOwner] = useState(() =>
    createNativeServiceWorkSave({
      initial,
      scope,
      isCurrent: () =>
        mounted.current &&
        latest.current.isCurrentScope() &&
        !latest.current.disabled,
      fetchTenant: () =>
        client.fetchQuery(
          mountOwnedRead(
            trpc.tenant.current.queryOptions(undefined, {
              ...readOptions,
              networkMode: "always",
            }),
            nextReadMount(),
          ),
        ),
      fetchContext: (target) =>
        client.fetchQuery(
          mountOwnedRead(
            trpc.serviceAssistantWork.editorContext.queryOptions(target, {
              ...readOptions,
              networkMode: "always",
            }),
            nextReadMount(),
          ),
        ),
      fetchAssignees: () =>
        client.fetchQuery(
          mountOwnedRead(
            trpc.services.assignees.queryOptions(undefined, {
              ...readOptions,
              networkMode: "always",
            }),
            nextReadMount(),
          ),
        ),
      fetchReview: (value) =>
        client.fetchQuery(
          mountOwnedRead(
            trpc.serviceAssistantWork.review.queryOptions(value, {
              ...readOptions,
              networkMode: "always",
            }),
            nextReadMount(),
          ),
        ),
      onSave: (value) => latest.current.onSave(value),
    }),
  )
  useEffect(() => {
    mounted.current = true
    saveOwner.activate()
    return () => {
      mounted.current = false
      ticket.current = null
      saveOwner.invalidate()
    }
  }, [saveOwner])
  function change(value: ServiceWorkEditorAction) {
    if (!current()) return
    // A queued native field event may arrive before disabled props render.
    // Retire the old logical request synchronously and let this new intent own
    // its own Save; old responses/finally cannot clear the newer ticket.
    saveOwner.invalidate()
    saveOwner.activate()
    ticket.current = null
    draftRef.current = value
    setDraft(value)
    setPending(false)
    setError(null)
  }
  function edit(
    field:
      | "assigneeUserId"
      | "promisedAt"
      | "toStatus"
      | "quantity"
      | "reason"
      | "body"
      | "type"
      | "description"
      | "note",
    value: string | undefined,
  ) {
    // Native events can be delivered before the next render. Merge against
    // the synchronous draft so one field never restores another's old value.
    change({ ...draftRef.current, [field]: value })
  }
  async function save() {
    if (busy || ticket.current || !current()) return
    const owner = {}
    ticket.current = owner
    const value = draftRef.current
    const intent = JSON.stringify(value)
    setPending(true)
    setError(null)
    const outcome = await saveOwner.save(
      value,
      () => JSON.stringify(draftRef.current) === intent,
    )
    if (!mounted.current || !isCurrentScope() || ticket.current !== owner)
      return
    ticket.current = null
    if (outcome.state === "error") {
      setError(outcome.error)
      if (outcome.stage === "review") setInvalidated(true)
    }
    setPending(false)
  }
  async function retry() {
    if (ticket.current || !current()) return
    const owner = {}
    ticket.current = owner
    setPending(true)
    try {
      const freshTenant = await tenantQuery.refetch()
      if (!current() || ticket.current !== owner) return
      if (!freshTenant.isSuccess)
        throw Error("Current service access is unavailable.")
      nativeServiceWorkScope(freshTenant.data, scope)
      const freshContext = await contextQuery.refetch()
      if (!current() || ticket.current !== owner) return
      if (!freshContext.isSuccess)
        throw Error("The saved service work is unavailable.")
      const checked = nativeServiceWorkContext(
        freshContext.data,
        scope,
        initial,
      )
      if (assigning) {
        const freshNames = await namesQuery.refetch()
        if (!current() || ticket.current !== owner) return
        if (!freshNames.isSuccess)
          throw Error("Current staff identities are unavailable.")
        nativeServiceWorkAssignees(checked, freshNames.data)
      }
      let canReview = false
      try {
        nativeServiceWorkCandidate(initial, initial, checked, scope)
        canReview = true
      } catch {}
      if (canReview) {
        const freshReview = await reviewQuery.refetch()
        if (!current() || ticket.current !== owner) return
        if (!freshReview.isSuccess)
          throw Error("The current service review is unavailable.")
        nativeServiceWorkReview(freshReview.data, scope, initial)
      }
      setInvalidated(false)
      setError(null)
    } catch (cause) {
      if (current() && ticket.current === owner) {
        setInvalidated(true)
        setError(
          cause instanceof Error
            ? cause.message
            : "The current service review is unavailable.",
        )
      }
    } finally {
      if (mounted.current && isCurrentScope() && ticket.current === owner) {
        ticket.current = null
        setPending(false)
      }
    }
  }
  const parsedDraft = serviceWorkEditorActionSchema.safeParse(draft)
  const sameIntent =
    parsedDraft.success &&
    JSON.stringify(parsedDraft.data) === JSON.stringify(initial)
  const canAssign =
    draft.action !== "service_job_assign" ||
    Boolean(assignees?.some((row) => row.id === draft.assigneeUserId))
  return (
    <BottomSheetInputProvider>
      <BottomSheetKeyboardAwareScrollView
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: 18,
          paddingBottom: 32,
        }}
      >
        <Text className="text-sm text-muted-foreground">
          Save obtains a fresh work review and updates this draft. Review the
          refreshed proposal before confirming separately.
        </Text>
        {!ready || !context ? (
          <View className="gap-3">
            <Text
              accessibilityRole={checking && !invalidated ? undefined : "alert"}
            >
              {checking && !invalidated
                ? "Checking the exact saved work and your current Store access…"
                : "Current Service work is unavailable with this business, Store or access. No saved details are shown."}
            </Text>
            {!checking || invalidated ? (
              <ActionButton
                variant="outline"
                disabled={disabled || pending}
                onPress={() => void retry()}
              >
                Retry current work
              </ActionButton>
            ) : null}
          </View>
        ) : (
          <>
            <View className="gap-2 rounded-lg border border-border p-3">
              <Text className="font-medium text-foreground">
                {context.job.orderNumber} ·{" "}
                {context.job.customerName ?? "Service customer"}
              </Text>
              {context.line ? (
                <>
                  <Text>
                    {context.line.offeringName} · {context.line.variantName} ·{" "}
                    {context.line.quantity}
                  </Text>
                  <Text>
                    Current work: {human(context.line.status)}. Authorization:{" "}
                    {human(context.line.authorizationStatus)}.
                  </Text>
                </>
              ) : (
                <Text>Whole saved Service Job.</Text>
              )}
              {initial.action === "service_job_reschedule" ? (
                <Text>
                  Current promise: {context.job.promisedAt ?? "None recorded"}.
                </Text>
              ) : null}
            </View>
            {sameIntent && review ? (
              <View className="gap-2 border-l border-border pl-3">
                {review.lines.map((line, index) => (
                  <Text
                    key={`${index}:${line}`}
                    className="text-sm text-muted-foreground"
                  >
                    {line}
                  </Text>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-muted-foreground">
                This choice needs a fresh review. Earlier effects and reminder
                details are withheld until the updated proposal is reviewed.
              </Text>
            )}
            {draft.action === "service_job_assign" ? (
              <View
                className="gap-2"
                accessibilityRole="radiogroup"
                accessibilityLabel="Assign to eligible Store staff"
              >
                {!canAssign ? (
                  <Text accessibilityRole="alert">
                    The selected assignee is unavailable. Choose a current
                    eligible person below.
                  </Text>
                ) : null}
                {assignees?.length ? (
                  assignees.map((row) => (
                    <Choice
                      key={row.id}
                      label={`${row.name} · ${row.email}`}
                      selected={draft.assigneeUserId === row.id}
                      disabled={busy}
                      onPress={() => edit("assigneeUserId", row.id)}
                    />
                  ))
                ) : (
                  <Text>
                    No eligible staff choices are available in this Store.
                  </Text>
                )}
              </View>
            ) : null}
            {draft.action === "service_job_reschedule" ? (
              <FormField
                label="Promised time (ISO 8601 with UTC Z or explicit offset)"
                value={draft.promisedAt}
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(promisedAt) => edit("promisedAt", promisedAt)}
              />
            ) : null}
            {draft.action === "service_job_line_transition" ? (
              <View
                className="gap-2"
                accessibilityRole="radiogroup"
                accessibilityLabel="Next work state"
              >
                {(
                  [
                    ["queued", "Queued"],
                    ["in_progress", "In progress"],
                    ["blocked", "Blocked"],
                    ["ready_for_handoff", "Ready for handoff"],
                    ["cancelled", "Cancelled"],
                  ] as const
                ).map(([toStatus, label]) => (
                  <Choice
                    key={toStatus}
                    label={label}
                    selected={draft.toStatus === toStatus}
                    disabled={busy}
                    onPress={() => edit("toStatus", toStatus)}
                  />
                ))}
              </View>
            ) : null}
            {draft.action === "service_work_rework" ? (
              <FormField
                label="Rework quantity in the saved unit"
                value={draft.quantity}
                editable={!busy}
                keyboardType="decimal-pad"
                onChangeText={(quantity) => edit("quantity", quantity)}
              />
            ) : null}
            {draft.action === "service_job_assign" ||
            draft.action === "service_job_reschedule" ||
            draft.action === "service_job_line_transition" ||
            draft.action === "service_work_rework" ? (
              <FormField
                label={
                  draft.action === "service_job_reschedule" ||
                  draft.action === "service_work_rework" ||
                  (draft.action === "service_job_line_transition" &&
                    ["blocked", "cancelled"].includes(draft.toStatus))
                    ? "Reason"
                    : "Reason (optional)"
                }
                value={draft.reason ?? ""}
                editable={!busy}
                multiline
                maxLength={500}
                onChangeText={(reason) => {
                  if (
                    draft.action === "service_job_reschedule" ||
                    draft.action === "service_work_rework"
                  )
                    edit("reason", reason)
                  else edit("reason", reason.trim() ? reason : undefined)
                }}
              />
            ) : null}
            {draft.action === "service_work_note" ? (
              <FormField
                label="Internal work note"
                value={draft.body}
                editable={!busy}
                multiline
                maxLength={4000}
                onChangeText={(body) => edit("body", body)}
              />
            ) : null}
            {draft.action === "service_work_exception" ? (
              <>
                <View
                  className="gap-2"
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Exception category"
                >
                  {(
                    [
                      ["delay", "Delay"],
                      ["quality", "Quality issue"],
                      ["failed_attempt", "Failed attempt"],
                      ["customer_rejection", "Customer rejection"],
                      ["other", "Other issue"],
                    ] as const
                  ).map(([type, label]) => (
                    <Choice
                      key={type}
                      label={label}
                      selected={draft.type === type}
                      disabled={busy}
                      onPress={() => edit("type", type)}
                    />
                  ))}
                </View>
                <FormField
                  label="What happened?"
                  value={draft.description}
                  editable={!busy}
                  multiline
                  maxLength={2000}
                  onChangeText={(description) =>
                    edit("description", description)
                  }
                />
              </>
            ) : null}
            {draft.action === "service_work_handoff" ? (
              <FormField
                label="Collection note (optional)"
                value={draft.note ?? ""}
                editable={!busy}
                multiline
                maxLength={500}
                onChangeText={(note) =>
                  edit("note", note.trim() ? note : undefined)
                }
              />
            ) : null}
            <Text className="text-sm text-muted-foreground">
              The saved Job, Line and action stay fixed. Ask in chat to select
              different work.
            </Text>
            <Text className="text-sm text-muted-foreground">
              {draft.action === "service_work_note" ||
              draft.action === "service_work_exception"
                ? "Private work records preserve work, payment and handoff state. Notes are not notifications; exceptions start open. No customer or provider message is sent."
                : draft.action === "service_work_rework"
                  ? "Creates new queued authorized linked work. Completed original work and any prior handoff stay recorded; no new sale or payment."
                  : draft.action === "service_work_handoff"
                    ? "Requires authorized ready work and an already settled balance. Outstanding due reminders are cancelled. No payment or customer update is created."
                    : draft.action === "service_job_reschedule"
                      ? "Keep the exact stated instant, including its offset and fractional seconds. Enter an explicit UTC Z or offset; no device timezone is inferred. Review discloses due-reminder replacement or cancellation; provider delivery remains separate."
                      : "Ready is a work milestone; authorization, payment and customer handoff remain separate actions."}
            </Text>
          </>
        )}
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <ActionButton disabled={busy || !canAssign} onPress={() => void save()}>
          {pending ? "Checking fresh review…" : "Save and review"}
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}

function Choice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string
  selected: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`rounded-lg border px-3 py-3 ${selected ? "border-primary bg-secondary" : "border-border bg-background"}`}
    >
      <Text className="text-sm text-foreground">{label}</Text>
    </Pressable>
  )
}
