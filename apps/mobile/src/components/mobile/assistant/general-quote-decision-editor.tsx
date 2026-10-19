import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  type QuoteDecisionAction,
  quoteDecisionAction,
} from "@ewatrade/assistant/general/quote-decision"
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
  type NativeQuoteScope,
  createNativeQuoteDecisionSave,
  createNativeQuoteScopeFence,
  nativeQuoteReviewMatches,
  nativeQuoteScopeMatches,
} from "./native-quote-decision-values"

type Props = {
  initial: QuoteDecisionAction
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
export function GeneralQuoteDecisionEditor(props: Props) {
  const { profile } = useAuthContext()
  const scopeKey = JSON.stringify([
    profile?.id,
    profile?.businessId,
    profile?.storeId,
    profile?.role,
    profile?.staffAccessMode,
    profile?.status,
    profile?.catalogEditor,
    props.initial,
  ])
  const [fence] = useState(createNativeQuoteScopeFence)
  fence.update(scopeKey)
  useEffect(() => {
    fence.activate()
    return () => fence.dispose()
  }, [fence])
  const parsed = quoteDecisionAction.safeParse(props.initial)
  if (
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    (profile.status !== undefined && profile.status !== "ACTIVE") ||
    !parsed.success
  )
    return (
      <Text accessibilityRole="alert">
        Choose your current accessible business and Store before reviewing this
        original quotation decision.
      </Text>
    )
  const scope = {
    actorUserId: profile.id,
    tenantId: profile.businessId,
    storeId: profile.storeId,
  }
  return (
    <QuoteEditor
      key={scopeKey}
      {...props}
      initial={parsed.data}
      scope={scope}
      isCurrent={() => fence.isCurrent(scopeKey)}
    />
  )
}
function QuoteEditor({
  initial,
  disabled,
  onSave,
  scope,
  isCurrent,
}: Props & { scope: NativeQuoteScope; isCurrent: () => boolean }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const [mount] = useState(nextReadMount)
  const context = useQuery(
    mountOwnedRead(
      trpc.tenant.current.queryOptions(undefined, readOptions),
      mount,
    ),
  )
  const current = freshShownRead(context)
  const scopeReady =
    current.state === "ready" && nativeQuoteScopeMatches(current.data, scope)
  const query = useQuery(
    mountOwnedRead(
      trpc.serviceCommerce.assistantQuoteDecisionReview.queryOptions(initial, {
        ...readOptions,
        enabled: scopeReady,
      }),
      mount,
    ),
  )
  const fresh = freshShownRead(query)
  const [invalidated, setInvalidated] = useState(false)
  const reviewed =
    !invalidated &&
    scopeReady &&
    fresh.state === "ready" &&
    nativeQuoteReviewMatches(fresh.data, scope, initial)
      ? fresh.data
      : null
  const [reason, setReason] = useState(initial.reason)
  const currentReason = useRef(initial.reason)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saver] = useState(createNativeQuoteDecisionSave)
  const latest = useRef({
    disabled,
    onSave,
    isCurrent,
    ready: Boolean(reviewed),
  })
  latest.current = { disabled, onSave, isCurrent, ready: Boolean(reviewed) }
  useEffect(() => {
    saver.activate()
    setPending(false)
    return () => saver.dispose()
  }, [saver])
  const available = !disabled && Boolean(reviewed)
  useEffect(() => {
    if (!available) saver.cancel()
  }, [available, saver])
  const blocked = disabled || pending || !reviewed
  function changeReason(value: string) {
    if (
      latest.current.disabled ||
      !latest.current.ready ||
      !latest.current.isCurrent() ||
      value === currentReason.current
    )
      return
    // Native input may deliver an already queued edit while review is pending.
    // Invalidate synchronously before state renders or a late read can settle.
    currentReason.current = value
    saver.cancel()
    setReason(value)
    setError(null)
  }
  function save() {
    if (blocked) return
    const submittedReason = currentReason.current
    setError(null)
    void saver.save({
      initial,
      raw: { ...initial, reason: submittedReason },
      scope,
      isCurrent: () =>
        latest.current.isCurrent() &&
        !latest.current.disabled &&
        latest.current.ready &&
        currentReason.current === submittedReason,
      fetchScope: () =>
        client.fetchQuery(
          mountOwnedRead(
            trpc.tenant.current.queryOptions(undefined, {
              ...readOptions,
              networkMode: "always",
            }),
            nextReadMount(),
          ),
        ),
      fetchReview: (draft) =>
        client.fetchQuery(
          mountOwnedRead(
            trpc.serviceCommerce.assistantQuoteDecisionReview.queryOptions(
              draft,
              { ...readOptions, networkMode: "always" },
            ),
            nextReadMount(),
          ),
        ),
      onSave: (payload) => latest.current.onSave(payload),
      onBusy: setPending,
      onError: (message, stage) => {
        setError(message)
        if (stage !== "input") setInvalidated(true)
      },
    })
  }
  async function retry() {
    const value = await context.refetch()
    if (
      !latest.current.isCurrent() ||
      !value.isSuccess ||
      !nativeQuoteScopeMatches(value.data, scope)
    )
      return
    const result = await query.refetch()
    if (latest.current.isCurrent() && result.isSuccess) {
      setInvalidated(false)
      setError(null)
    }
  }
  const refused =
    invalidated ||
    current.state === "refused" ||
    (current.state === "ready" && !scopeReady) ||
    (scopeReady &&
      (fresh.state === "refused" || (fresh.state === "ready" && !reviewed)))
  return (
    <BottomSheetInputProvider>
      <BottomSheetKeyboardAwareScrollView
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: 18,
          paddingBottom: 32,
        }}
      >
        <Text className="font-bold text-foreground">
          {initial.action === "commerce_quote_approve"
            ? "Approve and commercially release the original version"
            : "Reject the original version; keep it private"}
        </Text>
        {reviewed ? (
          <>
            {reason.trim() === initial.reason ? (
              <View className="gap-2 border border-border p-3">
                {reviewed.lines.map((line, index) => (
                  <Text key={`${index}:${line}`}>{line}</Text>
                ))}
              </View>
            ) : (
              <Text>
                The reason has changed. Save obtains a new protected review for
                this exact decision before the refreshed proposal is confirmed.
              </Text>
            )}
            <FormField
              label="Reason"
              value={reason}
              editable={!blocked}
              maxLength={500}
              multiline
              onChangeText={changeReason}
            />
          </>
        ) : (
          <View className="gap-2">
            <Text accessibilityRole={refused ? "alert" : undefined}>
              {refused
                ? "This original quotation decision is unavailable for the current actor, business, Store or approval policy."
                : "Checking the exact original quotation and your current access…"}
            </Text>
            {refused ? (
              <ActionButton
                variant="outline"
                disabled={disabled || pending}
                onPress={() => void retry()}
              >
                Retry quotation review
              </ActionButton>
            ) : null}
          </View>
        )}
        <Text className="text-sm text-muted-foreground">
          The action, original approval, quotation and version stay fixed. Save
          loads a fresh protected review and updates this draft. Review the
          refreshed proposal and confirm separately before any decision or
          commercial release.
        </Text>
        <Text className="text-sm text-muted-foreground">
          Commercial approval is separate from customer acceptance, an Order,
          payment and prescription or clinical release. Canonical approver,
          maker-checker, Terms and screening requirements still apply.
        </Text>
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <ActionButton
          disabled={blocked}
          isLoading={pending}
          loadingLabel="Checking current quotation…"
          onPress={save}
        >
          Save and review
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}
