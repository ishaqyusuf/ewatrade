import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  generalActionSchema,
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
import { ListCard } from "../green-till/kit"
import {
  type NativeServiceMessageContext,
  type NativeServiceMessageEdits,
  nativeServiceMessageCandidate,
  nativeServiceMessageContextKey,
  nativeServiceMessageContextMatches,
  nativeServiceMessageContextSchema,
  nativeServiceMessageProfileKey,
} from "./native-service-message-values"

type Share = Extract<GeneralAction, { action: "service_message_share" }>
type Profile = NonNullable<ReturnType<typeof useAuthContext>["profile"]>
type Props = {
  initial: Share
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
export const serviceMessageChannels = [
  ["manual", "In person / other"],
  ["sms", "SMS from my phone"],
  ["whatsapp", "WhatsApp from my phone"],
] as const
const ACK = "I already shared this message myself"

/** Only a strict, exact-scope context may show facts or reach Save. */
function freshContext(
  raw: unknown,
  profile: Profile,
  jobId: string,
): NativeServiceMessageContext | null {
  const parsed = nativeServiceMessageContextSchema.safeParse(raw)
  return parsed.success &&
    nativeServiceMessageContextMatches(parsed.data, profile, jobId)
    ? (parsed.data as NativeServiceMessageContext)
    : null
}

/**
 * Edits a drafted record of a message the staff member already shared
 * themselves. The Job stays fixed and the recipient is only ever the Job's
 * current Order contact from a fresh protected read. Nothing is sent: Save
 * prepares the edited proposal for a separate review and confirmation.
 */
export function GeneralServiceMessageEditor(props: Props) {
  const { profile } = useAuthContext()
  const parsed = generalActionSchema.safeParse(props.initial)
  const key = JSON.stringify([
    nativeServiceMessageProfileKey(profile),
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
  if (!parsed.success || parsed.data.action !== "service_message_share")
    return (
      <Text accessibilityRole="alert">
        This saved message draft is invalid. Open a fresh draft in chat.
      </Text>
    )
  const role = profile?.role?.trim().toUpperCase()
  if (
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    (profile.status !== undefined && profile.status !== "ACTIVE") ||
    !(
      role === "OWNER" ||
      role === "ADMIN" ||
      (role === "MANAGER" && profile.staffAccessMode === "LEGACY")
    )
  )
    return (
      <Text accessibilityRole="alert">
        Current Owner, Admin or legacy Manager service access and a selected
        Store are required.
      </Text>
    )
  return (
    <MessageEditor
      key={key}
      {...props}
      initial={parsed.data}
      profile={profile}
      isCurrentScope={() => mounted.current && currentKey.current === key}
    />
  )
}

function MessageEditor({
  initial,
  disabled,
  onSave,
  profile,
  isCurrentScope,
}: Props & { profile: Profile; isCurrentScope: () => boolean }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const [mount] = useState(nextReadMount)
  // The acknowledgement is never inherited from the draft: it starts false on
  // every open, is bound to the exact Job/recipient context it was given for
  // (an in-memory fingerprint, never logged or used as a query key), and any
  // later edit or context change clears it again.
  const [values, setValues] = useState<NativeServiceMessageEdits>({
    channel: initial.channel,
    message: initial.message,
    reason: initial.reason ?? "",
    alreadyShared: false,
    acknowledgedContext: null,
  })
  const fields = useRef(values)
  const [pending, setPending] = useState(false)
  const [invalidated, setInvalidated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  const ticket = useRef<object | null>(null)
  const latest = useRef({ disabled, onSave, isCurrentScope })
  latest.current = { disabled, onSave, isCurrentScope }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      ticket.current = null
    }
  }, [])
  const target = { jobId: initial.jobId }
  const contextQuery = useQuery(
    mountOwnedRead(
      trpc.serviceCommunications.manualMessageEditorContext.queryOptions(
        target,
        readOptions,
      ),
      mount,
    ),
  )
  const contextRead = freshShownRead(contextQuery)
  const context =
    contextRead.state === "ready"
      ? freshContext(contextRead.data, profile, initial.jobId)
      : null
  const contextKey = context ? nativeServiceMessageContextKey(context) : null
  const shownKey = useRef(contextKey)
  shownKey.current = contextKey
  if (
    fields.current.alreadyShared &&
    fields.current.acknowledgedContext !== contextKey
  ) {
    // The shown Job or recipient changed (or is no longer shown): the earlier
    // self-report no longer describes what is on screen.
    const cleared = {
      ...fields.current,
      alreadyShared: false,
      acknowledgedContext: null,
    }
    fields.current = cleared
    setValues(cleared)
  }
  const checking = contextRead.state === "checking"
  const ready = !invalidated && Boolean(context)
  const current = () =>
    mounted.current &&
    latest.current.isCurrentScope() &&
    !latest.current.disabled
  const busy = disabled || pending || !ready

  function change<K extends keyof NativeServiceMessageEdits>(
    field: K,
    value: NativeServiceMessageEdits[K],
  ) {
    if (!current()) return
    // Native events can arrive before the next render: merge into the
    // synchronous copy, retire any in-flight Save and renew the self-report.
    ticket.current = null
    const acknowledged = field === "alreadyShared" && value === true
    const next = {
      ...fields.current,
      [field]: value,
      alreadyShared: acknowledged && shownKey.current !== null,
      acknowledgedContext: acknowledged ? shownKey.current : null,
    }
    fields.current = next
    setValues(next)
    setPending(false)
    setError(null)
  }

  async function save() {
    if (busy || ticket.current || !current()) return
    const owner = {}
    ticket.current = owner
    const intent = JSON.stringify(fields.current)
    setPending(true)
    setError(null)
    // Only a still-current, unchanged Save may act on its response. Whatever
    // happens, the Save that owns the ticket releases it (finally), so a
    // response that arrives while disabled or after a context change can
    // never leave the editor stuck pending.
    const owns = () =>
      mounted.current && isCurrentScope() && ticket.current === owner
    let failure: string | null = null
    let stale = false
    try {
      const raw = await client.fetchQuery(
        mountOwnedRead(
          trpc.serviceCommunications.manualMessageEditorContext.queryOptions(
            target,
            { ...readOptions, networkMode: "always" },
          ),
          nextReadMount(),
        ),
      )
      if (!current() || !owns() || JSON.stringify(fields.current) !== intent)
        return
      const fresh = freshContext(raw, profile, initial.jobId)
      if (!fresh) {
        stale = true
        failure =
          "The current Job, customer or your access changed. No saved details are shown."
        return
      }
      const candidate = nativeServiceMessageCandidate(
        initial,
        fields.current,
        fresh,
      )
      if (candidate.ok) {
        latest.current.onSave(candidate.payload)
        return
      }
      failure = candidate.error
      if (
        fields.current.acknowledgedContext !==
        nativeServiceMessageContextKey(fresh)
      ) {
        // Show the fresh Job/recipient and require a new self-report for it.
        const cleared = {
          ...fields.current,
          alreadyShared: false,
          acknowledgedContext: null,
        }
        fields.current = cleared
        setValues(cleared)
        void contextQuery.refetch()
      }
    } catch {
      if (current() && owns()) {
        stale = true
        failure = "The current Job and recipient could not be checked."
      }
    } finally {
      if (owns()) {
        ticket.current = null
        if (stale) setInvalidated(true)
        setError(failure)
        setPending(false)
      }
    }
  }

  async function retry() {
    if (ticket.current || !current()) return
    const owner = {}
    ticket.current = owner
    setPending(true)
    try {
      const fresh = await contextQuery.refetch()
      if (!current() || ticket.current !== owner) return
      if (!fresh.isSuccess || !freshContext(fresh.data, profile, initial.jobId))
        throw Error("The current Job is unavailable.")
      setInvalidated(false)
      setError(null)
    } catch (cause) {
      if (current() && ticket.current === owner) {
        setInvalidated(true)
        setError(
          cause instanceof Error
            ? cause.message
            : "The current Job is unavailable.",
        )
      }
    } finally {
      if (mounted.current && isCurrentScope() && ticket.current === owner) {
        ticket.current = null
        setPending(false)
      }
    }
  }

  const noPhone = Boolean(context) && !context?.recipient.phone?.trim()
  const phoneBlocked = noPhone && values.channel !== "manual"
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
          Records a message you already shared yourself. ẸwáTrade sends nothing
          and delivery is not verified. The record appears in the customer’s
          tracking history.
        </Text>
        {!ready || !context ? (
          <View className="gap-3">
            <Text
              accessibilityRole={checking && !invalidated ? undefined : "alert"}
            >
              {checking && !invalidated
                ? "Checking the exact saved Job and your current Store access…"
                : "The current Service Job is unavailable with this business, Store or access. No saved details are shown."}
            </Text>
            {!checking || invalidated ? (
              <ActionButton
                variant="outline"
                disabled={disabled || pending}
                onPress={() => void retry()}
              >
                Retry current Job
              </ActionButton>
            ) : null}
          </View>
        ) : (
          <>
            <ListCard>
              <View className="gap-2 py-3">
                <Text className="text-base font-bold text-foreground">
                  Order {context.order.number}
                </Text>
                <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Current Order customer
                </Text>
                <Text className="text-sm text-foreground">
                  {context.recipient.name ?? "No customer name on the Order"}
                </Text>
                <Text className="text-sm text-foreground">
                  {context.recipient.phone ?? "No phone on the Order"}
                </Text>
                {context.recipient.email ? (
                  <Text className="text-sm text-foreground">
                    {context.recipient.email}
                  </Text>
                ) : null}
                <Text className="text-xs text-muted-foreground">
                  Current contact as of {context.asOf} (UTC). The confirmed
                  record keeps the contact at that time.
                </Text>
              </View>
            </ListCard>
            <View
              className="gap-2"
              accessibilityRole="radiogroup"
              accessibilityLabel="How you shared it"
            >
              <Text className="text-sm font-bold text-foreground">
                How you shared it
              </Text>
              {serviceMessageChannels.map(([channel, label]) => (
                <Choice
                  key={channel}
                  label={label}
                  role="radio"
                  selected={values.channel === channel}
                  disabled={busy}
                  onPress={() => change("channel", channel)}
                />
              ))}
              {phoneBlocked ? (
                <Text accessibilityRole="alert" className="text-sm">
                  This Order has no phone number, so SMS or WhatsApp can’t be
                  recorded. Choose In person / other, or update the customer
                  first.
                </Text>
              ) : null}
            </View>
            <FormField
              label="Exact message you shared"
              value={values.message}
              editable={!busy}
              multiline
              maxLength={1000}
              onChangeText={(message) => change("message", message)}
            />
            <Text className="-mt-2 text-right text-xs tabular-nums text-muted-foreground">
              {values.message.length} / 1000
            </Text>
            <FormField
              label="Note (optional)"
              value={values.reason}
              editable={!busy}
              multiline
              maxLength={500}
              onChangeText={(reason) => change("reason", reason)}
            />
            <Choice
              label={ACK}
              role="checkbox"
              selected={values.alreadyShared}
              disabled={busy}
              onPress={() =>
                change("alreadyShared", !fields.current.alreadyShared)
              }
            />
            <Text className="text-sm text-muted-foreground">
              The saved Job stays fixed. Ask in chat to choose a different Job.
              Save checks the current Job and contact again, then returns the
              updated proposal for review; confirming it is a separate step.
            </Text>
          </>
        )}
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <ActionButton
          disabled={busy || phoneBlocked || !values.alreadyShared}
          onPress={() => void save()}
        >
          {pending ? "Checking current Job…" : "Save and review"}
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}

function Choice({
  label,
  role,
  selected,
  disabled,
  onPress,
}: {
  label: string
  role: "radio" | "checkbox"
  selected: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 rounded-xl border px-3 py-3 ${selected ? "border-primary bg-secondary" : "border-border bg-background"}`}
    >
      <Text className="text-sm text-foreground">{label}</Text>
    </Pressable>
  )
}
