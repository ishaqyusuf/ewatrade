import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import {
  type GeneralStaffStatusAction,
  staffStatusReviewInput,
} from "@ewatrade/assistant/general/staff-status"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { ActionButton } from "../action-button"
import { FormField } from "../form-field"
import { createNativeStaffStatusSave } from "./native-staff-status-values"

type Props = {
  initial: GeneralStaffStatusAction
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

export function GeneralStaffStatusEditor(props: Props) {
  const { profile } = useAuthContext()
  const scope = JSON.stringify([
    profile?.id,
    profile?.businessId,
    profile?.storeId,
    profile?.role,
    profile?.staffAccessMode,
    profile?.catalogEditor,
    profile?.status,
    props.initial,
  ])
  // Synchronous scope fence also rejects results arriving before effect cleanup.
  const current = useRef<string | null>(scope)
  const mounted = useRef(true)
  current.current = scope
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  if (!profile?.businessId || !["OWNER", "ADMIN"].includes(profile.role ?? ""))
    return (
      <Text accessibilityRole="alert">
        An owner or administrator can review business membership status.
      </Text>
    )
  return (
    <StatusEditor
      key={scope}
      {...props}
      isCurrent={() => mounted.current && current.current === scope}
    />
  )
}

function StatusEditor({
  initial,
  disabled,
  onSave,
  isCurrent,
}: Props & {
  isCurrent: () => boolean
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const [mount] = useState(nextReadMount)
  const initialInput = staffStatusReviewInput.parse({
    membershipId: initial.membershipId,
    status: initial.status,
    reason: initial.reason,
  })
  const query = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffStatusReview.queryOptions(initialInput, readOptions),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const [reviewInvalidated, setReviewInvalidated] = useState(false)
  const review =
    !reviewInvalidated &&
    read.state === "ready" &&
    read.data.membershipId === initial.membershipId
      ? read.data
      : null
  const [status, setStatus] = useState(initial.status)
  const [reason, setReason] = useState(initial.reason)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const mounted = useRef(true)
  const [error, setError] = useState<string | null>(null)
  const currentProps = useRef({ disabled, onSave, isCurrent })
  currentProps.current = { disabled, onSave, isCurrent }
  const [saveOwner] = useState(() =>
    createNativeStaffStatusSave({
      initial,
      isCurrent: () =>
        currentProps.current.isCurrent() && !currentProps.current.disabled,
      fetchReview: (input) =>
        client.fetchQuery(
          mountOwnedRead(
            trpc.retailOps.staffStatusReview.queryOptions(input, {
              ...readOptions,
              networkMode: "always",
            }),
            // Each Save gets a separate request, even if an earlier read is in flight.
            nextReadMount(),
          ),
        ),
      onSave: (payload) => currentProps.current.onSave(payload),
    }),
  )
  useEffect(() => {
    mounted.current = true
    saveOwner.activate()
    return () => {
      mounted.current = false
      saveOwner.invalidate()
    }
  }, [saveOwner])
  const busy = disabled || pending || !review
  async function save() {
    if (busy || submitting.current) return
    submitting.current = true
    setPending(true)
    setError(null)
    const outcome = await saveOwner.save({ status, reason })
    if (!mounted.current || !isCurrent()) return
    submitting.current = false
    if (outcome.state === "error") {
      setError(outcome.error)
      if (outcome.stage === "review") setReviewInvalidated(true)
    }
    setPending(false)
  }
  async function retry() {
    const result = await query.refetch()
    if (mounted.current && isCurrent() && result.isSuccess) {
      setReviewInvalidated(false)
      setError(null)
    }
  }
  const matches =
    review?.nextStatus.toLowerCase() === status &&
    review?.reason === reason.trim()
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
          Save loads a fresh review and updates this draft. Review the refreshed
          proposal before confirming separately.
        </Text>
        {!review ? (
          <View className="gap-3">
            <Text
              accessibilityRole={read.state === "refused" ? "alert" : undefined}
            >
              {read.state === "checking"
                ? "Checking the current staff review and your access…"
                : "This membership cannot be reviewed with your current business or access."}
            </Text>
            {read.state !== "checking" ? (
              <ActionButton
                variant="outline"
                disabled={disabled || pending}
                onPress={() => void retry()}
              >
                Retry staff review
              </ActionButton>
            ) : null}
          </View>
        ) : (
          <>
            <View className="gap-2 rounded-lg border border-border p-3">
              <Text className="font-medium text-foreground">
                {review.name} · {review.email}
              </Text>
              <Text className="text-sm text-foreground">
                Current status: {review.previousStatus.toLowerCase()} ·{" "}
                {review.role.toLowerCase()}.
              </Text>
              <Text className="text-sm text-muted-foreground">
                {matches
                  ? review.impact
                  : "Save to load a fresh review of this choice. The change applies to the whole business; current Store grants are preserved."}
              </Text>
              <Text className="text-sm text-muted-foreground">
                Current access: {review.accessMode.toLowerCase()}; catalog
                editing {review.catalogEditor ? "allowed" : "not allowed"}.
              </Text>
              {review.assignments.map((row) => (
                <Text
                  key={row.storeId}
                  className="text-sm text-muted-foreground"
                >
                  {row.storeName} · {row.role.toLowerCase()}
                  {row.storeId === review.defaultStoreId
                    ? " · starting Store"
                    : ""}
                </Text>
              ))}
            </View>
            <View
              className="gap-2"
              accessibilityRole="radiogroup"
              accessibilityLabel="Business membership status"
            >
              {(
                [
                  ["suspended", "Suspend business access"],
                  ["active", "Reactivate current access"],
                ] as const
              ).map(([value, label]) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{
                    selected: status === value,
                    disabled: busy,
                  }}
                  disabled={busy}
                  onPress={() => {
                    setStatus(value)
                    setError(null)
                  }}
                  className={`rounded-lg border px-3 py-3 ${status === value ? "border-primary bg-secondary" : "border-border bg-background"}`}
                >
                  <Text className="text-sm text-foreground">{label}</Text>
                </Pressable>
              ))}
            </View>
            <FormField
              label="Reason"
              value={reason}
              editable={!busy}
              multiline
              maxLength={500}
              onChangeText={(value) => {
                setReason(value)
                setError(null)
              }}
            />
          </>
        )}
        <Text className="text-sm text-muted-foreground">
          The selected person stays fixed. Ask in chat to choose someone else.
          Store grants, roles and historical ownership are preserved. This
          changes business membership, not one Store assignment.
        </Text>
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <ActionButton disabled={busy} onPress={() => void save()}>
          {pending ? "Checking fresh review…" : "Save and review"}
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}
