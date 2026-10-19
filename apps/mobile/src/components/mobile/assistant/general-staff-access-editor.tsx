import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralStaffAccessAction } from "@ewatrade/assistant/general/staff-access"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { ActionButton } from "../action-button"
import {
  type NativeStaffAccessEdits,
  createNativeStaffAccessSaveSession,
  createNativeStaffAccessScopeFence,
  nativeStaffAccessEdits,
  nativeStaffAccessWorkloadReady,
} from "./native-staff-access-values"

type Props = {
  initial: GeneralStaffAccessAction
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}
type Review = RouterOutputs["retailOps"]["staffStoreAccessReview"]
const readOptions = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}

export function GeneralStaffAccessEditor(props: Props) {
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
  const [scopeFence] = useState(createNativeStaffAccessScopeFence)
  scopeFence.update(scope)
  useEffect(() => {
    scopeFence.activate()
    return () => scopeFence.dispose()
  }, [scopeFence])
  if (!profile?.businessId || !["OWNER", "ADMIN"].includes(profile.role ?? ""))
    return (
      <Text accessibilityRole="alert">
        An owner or administrator can edit Store access.
      </Text>
    )
  return (
    <StaffAccessEditor
      key={scope}
      {...props}
      isCurrent={() => scopeFence.isCurrent(scope)}
    />
  )
}

function StaffAccessEditor({
  initial,
  disabled,
  onSave,
  isCurrent,
}: Props & { isCurrent: () => boolean }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const [mount] = useState(nextReadMount)
  const [fields, setFields] = useState(() => nativeStaffAccessEdits(initial))
  const [pending, setPending] = useState(false)
  const [reviewInvalidated, setReviewInvalidated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saver] = useState(createNativeStaffAccessSaveSession)
  useEffect(() => {
    saver.activate()
    setPending(false)
    return () => saver.dispose()
  }, [saver])
  const query = useQuery(
    mountOwnedRead(
      trpc.retailOps.staffStoreAccessReview.queryOptions(
        {
          ...nativeStaffAccessEdits(initial),
          membershipId: initial.membershipId,
        },
        readOptions,
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const review =
    !reviewInvalidated &&
    read.state === "ready" &&
    read.data.membershipId === initial.membershipId &&
    read.data.availableStoresCoverage === "complete"
      ? read.data
      : null
  const currentProps = useRef({ disabled, onSave, isCurrent })
  currentProps.current = { disabled, onSave, isCurrent }
  const allowed = useRef(false)
  const accessReady =
    !disabled &&
    Boolean(review) &&
    nativeStaffAccessWorkloadReady(
      review?.outstandingServiceWork,
      initial.membershipId,
    )
  allowed.current = accessReady
  useEffect(() => {
    if (!accessReady) saver.cancel()
  }, [accessReady, saver])
  const workloadReady =
    review &&
    nativeStaffAccessWorkloadReady(
      review.outstandingServiceWork,
      initial.membershipId,
    )
  const blocked = disabled || pending || !review || !workloadReady
  const hasManager = fields.assignments.some((row) => row.role === "MANAGER")
  const change = (edit: Partial<NativeStaffAccessEdits>) => {
    if (!blocked) {
      setFields((current) => ({ ...current, ...edit }))
      setError(null)
    }
  }
  function setRole(
    storeId: string,
    role: "CASHIER" | "OPERATOR" | "MANAGER" | null,
  ) {
    if (blocked) return
    const assignments = fields.assignments.filter(
      (row) => row.storeId !== storeId,
    )
    if (role) assignments.push({ storeId, role })
    change({
      assignments,
      defaultStoreId: assignments.some(
        (row) => row.storeId === fields.defaultStoreId,
      )
        ? fields.defaultStoreId
        : (assignments[0]?.storeId ?? null),
      catalogEditor:
        fields.catalogEditor &&
        assignments.some((row) => row.role === "MANAGER"),
    })
  }
  function save() {
    if (blocked || !review) return
    setError(null)
    void saver.save({
      initial,
      edits: fields,
      shownReview: review,
      read: (input) =>
        client.fetchQuery(
          mountOwnedRead(
            trpc.retailOps.staffStoreAccessReview.queryOptions(input, {
              ...readOptions,
              networkMode: "always",
            }),
            nextReadMount(),
          ),
        ),
      allowed: () =>
        allowed.current &&
        !currentProps.current.disabled &&
        currentProps.current.isCurrent(),
      onSave: (payload) => currentProps.current.onSave(payload),
      onBusy: setPending,
      onError: (message, stage) => {
        setError(message)
        if (stage === "review") setReviewInvalidated(true)
      },
    })
  }
  async function retry() {
    const result = await query.refetch()
    if (currentProps.current.isCurrent() && result.isSuccess) {
      setReviewInvalidated(false)
      setError(null)
    }
  }
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
          The selected person stays fixed. Save obtains a fresh protected
          review; review the updated proposal and confirm separately before any
          access changes.
        </Text>
        {!review ? (
          <View className="gap-2">
            <Text
              accessibilityRole={
                read.state === "refused" || reviewInvalidated
                  ? "alert"
                  : undefined
              }
            >
              {read.state === "refused" || reviewInvalidated
                ? "Store access cannot be reviewed with your current business or access."
                : "Checking the current person, Stores and your access…"}
            </Text>
            {read.state === "refused" || reviewInvalidated ? (
              <ActionButton
                variant="outline"
                disabled={disabled}
                onPress={() => void retry()}
              >
                Retry access review
              </ActionButton>
            ) : null}
          </View>
        ) : (
          <>
            <View className="gap-2 border border-border p-3">
              <Text className="font-medium text-foreground">
                {review.name} · {review.email}
              </Text>
              <Text>
                Current business role:{" "}
                {review.before.businessRole.toLowerCase()} ·{" "}
                {review.before.membershipStatus.toLowerCase()}.
              </Text>
              {review.before.accessMode === "LEGACY" ? (
                <Text>
                  Existing access applies across the business. Select the Stores
                  to keep before replacing that access.
                </Text>
              ) : review.before.assignments.length ? (
                review.before.assignments.map((row) => (
                  <Text key={row.storeId}>
                    {row.storeName ?? "Unavailable Store"} ·{" "}
                    {row.role.toLowerCase()}
                    {row.storeId === review.before.defaultStoreId
                      ? " · starting Store"
                      : ""}
                  </Text>
                ))
              ) : (
                <Text>No current Store assignments.</Text>
              )}
              <Text>
                Current catalog editing:{" "}
                {review.before.catalogEditor ? "allowed" : "not allowed"}.
              </Text>
            </View>
            <AssignedWork review={review} membershipId={initial.membershipId} />
            {!workloadReady ? (
              <ActionButton
                variant="outline"
                disabled={disabled || pending}
                onPress={() => void retry()}
              >
                Retry assigned work review
              </ActionButton>
            ) : null}
            <Text className="font-medium text-foreground">
              Store roles after confirmation
            </Text>
            {review.availableStores.map((store) => {
              const selected = fields.assignments.find(
                (row) => row.storeId === store.id,
              )
              return (
                <View key={store.id} className="gap-2 border border-border p-3">
                  <Text className="font-medium text-foreground">
                    {store.name}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {([null, "CASHIER", "OPERATOR", "MANAGER"] as const).map(
                      (role) => (
                        <Pressable
                          key={role ?? "none"}
                          disabled={blocked}
                          accessibilityRole="radio"
                          accessibilityLabel={`${store.name}: ${role ? role.toLowerCase() : "no access"}`}
                          accessibilityState={{
                            checked: (selected?.role ?? null) === role,
                            disabled: blocked,
                          }}
                          className="min-h-12 justify-center rounded-lg border border-border px-3"
                          onPress={() => setRole(store.id, role)}
                        >
                          <Text>
                            {role
                              ? role.charAt(0) + role.slice(1).toLowerCase()
                              : "No access"}
                            {(selected?.role ?? null) === role ? " ✓" : ""}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                </View>
              )
            })}
            {fields.assignments.length ? (
              <View className="gap-2">
                <Text className="font-medium text-foreground">
                  Starting Store
                </Text>
                {fields.assignments.map((row) => (
                  <Pressable
                    key={row.storeId}
                    disabled={blocked}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: fields.defaultStoreId === row.storeId,
                      disabled: blocked,
                    }}
                    className="min-h-12 justify-center rounded-lg border border-border px-3"
                    onPress={() => change({ defaultStoreId: row.storeId })}
                  >
                    <Text>
                      {review.availableStores.find(
                        (store) => store.id === row.storeId,
                      )?.name ?? "Unavailable Store"}
                      {fields.defaultStoreId === row.storeId ? " ✓" : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text>
                No assignments removes Store access. Business membership status
                stays unchanged; this does not suspend the person.
              </Text>
            )}
            <Pressable
              disabled={blocked || !hasManager}
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: fields.catalogEditor,
                disabled: blocked || !hasManager,
              }}
              className="min-h-12 justify-center rounded-lg border border-border p-3"
              onPress={() => change({ catalogEditor: !fields.catalogEditor })}
            >
              <Text>
                {fields.catalogEditor ? "✓ " : ""}Allow catalog editing across
                the business. A Manager Store assignment is required.
              </Text>
            </Pressable>
            {review.requiresLegacyCutoverConfirmation ? (
              <Pressable
                disabled={blocked}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: fields.confirmLegacyCutover,
                  disabled: blocked,
                }}
                className="min-h-12 justify-center rounded-lg border border-border p-3"
                onPress={() =>
                  change({ confirmLegacyCutover: !fields.confirmLegacyCutover })
                }
              >
                <Text>
                  {fields.confirmLegacyCutover ? "✓ " : ""}I reviewed the
                  existing business-wide access. Replace it with these Store
                  roles and remove access to unselected Stores.
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
        <Text className="text-sm text-muted-foreground">
          Business role, membership status and historical sales ownership stay
          unchanged. No reason or handover is recorded. Outstanding service work
          requires separately reviewed reassignment.
        </Text>
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <ActionButton
          disabled={
            blocked ||
            Boolean(
              review?.requiresLegacyCutoverConfirmation &&
                !fields.confirmLegacyCutover,
            )
          }
          isLoading={pending}
          loadingLabel="Checking current access…"
          onPress={save}
        >
          Save and review
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}
function AssignedWork({
  review,
  membershipId,
}: { review: Review; membershipId: string }) {
  const work = review.outstandingServiceWork
  const valid = nativeStaffAccessWorkloadReady(work, membershipId)
  return (
    <View className="gap-2 border border-border p-3">
      <Text className="font-medium text-foreground">Assigned service work</Text>
      {!valid ? (
        <Text accessibilityRole="alert">
          Current assigned work is unavailable. Obtain a new review before
          changing access.
        </Text>
      ) : (
        <>
          <Text>
            {work.count} outstanding jobs currently assigned. Showing{" "}
            {work.shown} of {work.count}, across all business Stores including
            archived Stores.
          </Text>
          <Text>Checked {work.asOf}.</Text>
          {work.jobs.map((job) => (
            <View key={job.jobId} className="gap-1 border-t border-border pt-2">
              <Text>
                {job.storeName} · {job.storeStatus.toLowerCase()} ·{" "}
                {job.priority.toLowerCase()}
              </Text>
              <Text>
                Created {job.createdAt}. Job revision at review: {job.revision}.
              </Text>
              <Text>At least one line is neither completed nor cancelled.</Text>
            </View>
          ))}
          {work.hasMore ? (
            <Text>
              Only the first {work.shown} jobs are listed;{" "}
              {work.count - work.shown} more are included in the complete total.
            </Text>
          ) : null}
        </>
      )}
      <Text>
        Current assignment does not prove performed work or historical sales.
        Changing access does not reassign these jobs. Full job inspection and
        reassignment require the separate service workflow.
      </Text>
    </View>
  )
}
