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
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { ActionButton } from "../action-button"
import { FormField } from "../form-field"
import {
  type NativeInvitationValues,
  type NativeStaffInvitationAction,
  invitationRoles,
  nativeStaffInvitationCandidate,
} from "./native-staff-invitation-values"

type Props = {
  initial: NativeStaffInvitationAction
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}

/** Editing changes the proposal only; the parent retains re-review/confirmation. */
export function GeneralStaffInvitationEditor(props: Props) {
  const { profile } = useAuthContext()
  if (
    !profile?.businessId ||
    profile.status !== "ACTIVE" ||
    !["OWNER", "ADMIN"].includes(profile.role ?? "")
  )
    return (
      <Text accessibilityRole="alert" className="p-4 text-sm text-foreground">
        Active Owner or Admin access is required to edit staff invitations.
      </Text>
    )
  const scope = JSON.stringify([
    profile.id,
    profile.businessId,
    profile.storeId,
    profile.role,
    profile.status,
    profile.staffAccessMode,
    props.initial,
  ])
  return props.initial.intent.kind === "INVITE" ? (
    <InviteEditor
      key={scope}
      {...props}
      initialInvite={props.initial.intent.invite}
    />
  ) : (
    <ReasonEditor key={scope} {...props} intent={props.initial.intent} />
  )
}

function Frame({
  children,
  error,
  disabled,
  onSave,
}: {
  children: ReactNode
  error: string | null
  disabled: boolean
  onSave: () => void
}) {
  return (
    <BottomSheetInputProvider>
      <BottomSheetKeyboardAwareScrollView
        contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 32 }}
      >
        <Text className="text-sm text-muted-foreground">
          Save changes, then review the refreshed proposal before confirming.
        </Text>
        {children}
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <ActionButton disabled={disabled} onPress={onSave}>
          Save and review
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}

function InviteEditor({
  initial,
  initialInvite,
  disabled,
  onSave,
}: Props & { initialInvite: NativeInvitationValues }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.tenant.stores.queryOptions(undefined, {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always",
        trpc: { abortOnUnmount: true },
      }),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const stores = read.state === "ready" ? read.data : []
  const [email, setEmail] = useState(initialInvite.email)
  const [name, setName] = useState(initialInvite.name ?? "")
  const [rows, setRows] = useState(() =>
    initialInvite.assignments.map((row, index) => ({
      ...row,
      key: `saved-${index}`,
    })),
  )
  const [sequence, setSequence] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [defaultStoreId, setDefaultStoreId] = useState(
    initialInvite.defaultStoreId,
  )
  const [catalogEditor, setCatalogEditor] = useState(
    initialInvite.catalogEditor,
  )
  const [error, setError] = useState<string | null>(null)
  const controlsDisabled = disabled || read.state !== "ready"
  const unresolved = rows.some(
    (row) => stores.filter((store) => store.id === row.storeId).length !== 1,
  )
  const hasManager = rows.some((row) => row.role === "MANAGER")
  const hasDefault = rows.some((row) => row.storeId === defaultStoreId)
  const saveDisabled =
    controlsDisabled ||
    unresolved ||
    !hasDefault ||
    (catalogEditor && !hasManager)
  function save() {
    if (saveDisabled) return
    const result = nativeStaffInvitationCandidate(
      initial,
      {
        kind: "INVITE",
        invite: {
          email,
          name,
          assignments: rows.map(({ storeId, role }) => ({ storeId, role })),
          defaultStoreId,
          catalogEditor,
        },
      },
      stores,
    )
    if (!result.ok) return setError(result.error)
    setError(null)
    onSave(result.payload)
  }
  return (
    <Frame error={error} disabled={saveDisabled} onSave={save}>
      <Text className="text-sm text-muted-foreground">
        Invite this person to onboard. Confirmation saves an invitation and
        queues an email request. Saved or queued does not mean sent, delivered
        or accepted. An invitation does not activate staff or create
        credentials.
      </Text>
      <FormField
        label="Recipient email"
        value={email}
        editable={!controlsDisabled}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={254}
        onChangeText={setEmail}
      />
      <FormField
        label="Name (optional)"
        value={name}
        editable={!controlsDisabled}
        maxLength={120}
        onChangeText={setName}
      />
      {read.state === "refused" ? (
        <View className="gap-2">
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            Accessible Stores are unavailable. Refresh before editing grants.
          </Text>
          <ActionButton
            variant="outline"
            disabled={disabled}
            onPress={() => void query.refetch()}
          >
            Retry Stores
          </ActionButton>
        </View>
      ) : read.state !== "ready" ? (
        <Text className="text-sm text-muted-foreground">
          Checking accessible Stores and your current access…
        </Text>
      ) : (
        <>
          <Text className="font-medium text-foreground">
            Store assignments ({rows.length}/100)
          </Text>
          {rows.map((row, index) => {
            const matches = stores.filter((store) => store.id === row.storeId)
            const store = matches.length === 1 ? matches[0] : undefined
            const label =
              store?.name ?? "Store unavailable — choose a replacement"
            const roleLabel = invitationRoles.find(
              ([value]) => value === row.role,
            )?.[1]
            return (
              <View
                key={row.key}
                className="gap-3 rounded-lg border border-border p-3"
              >
                <Text className="font-medium text-foreground">
                  Assignment {index + 1}: {label}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {roleLabel}
                  {row.storeId === defaultStoreId ? " · Starting Store" : ""}
                </Text>
                <ActionButton
                  variant="outline"
                  disabled={controlsDisabled}
                  accessibilityLabel={`Edit assignment ${index + 1}`}
                  onPress={() =>
                    setEditing(editing === row.key ? null : row.key)
                  }
                >
                  {editing === row.key
                    ? "Close assignment choices"
                    : "Edit Store and role"}
                </ActionButton>
                {editing === row.key ? (
                  <>
                    <View
                      accessibilityRole="radiogroup"
                      accessibilityLabel={`Store for assignment ${index + 1}`}
                      className="gap-2"
                    >
                      {stores
                        .filter(
                          (choice) =>
                            choice.id === row.storeId ||
                            !rows.some(
                              (assigned) => assigned.storeId === choice.id,
                            ),
                        )
                        .map((choice) => (
                          <Choice
                            key={choice.id}
                            label={choice.name}
                            selected={choice.id === row.storeId}
                            disabled={controlsDisabled}
                            onPress={() =>
                              setRows((current) =>
                                current.map((item) =>
                                  item.key === row.key
                                    ? { ...item, storeId: choice.id }
                                    : item,
                                ),
                              )
                            }
                          />
                        ))}
                    </View>
                    <View
                      accessibilityRole="radiogroup"
                      accessibilityLabel={`Role for assignment ${index + 1}`}
                      className="gap-2"
                    >
                      {invitationRoles.map(([value, roleName]) => (
                        <Choice
                          key={value}
                          label={roleName}
                          selected={row.role === value}
                          disabled={controlsDisabled}
                          onPress={() =>
                            setRows((current) =>
                              current.map((item) =>
                                item.key === row.key
                                  ? { ...item, role: value }
                                  : item,
                              ),
                            )
                          }
                        />
                      ))}
                    </View>
                  </>
                ) : null}
                {rows.length > 1 ? (
                  <ActionButton
                    variant="ghost"
                    disabled={controlsDisabled}
                    accessibilityLabel={`Remove assignment ${index + 1}`}
                    onPress={() =>
                      setRows((current) =>
                        current.filter((item) => item.key !== row.key),
                      )
                    }
                  >
                    Remove Store
                  </ActionButton>
                ) : null}
              </View>
            )
          })}
          <ActionButton
            variant="outline"
            disabled={
              controlsDisabled ||
              rows.length >= 100 ||
              !stores.some(
                (store) => !rows.some((row) => row.storeId === store.id),
              )
            }
            onPress={() => {
              if (controlsDisabled || rows.length >= 100) return
              const store = stores.find(
                (choice) => !rows.some((row) => row.storeId === choice.id),
              )
              if (!store) return
              const key = `added-${sequence}`
              setSequence((value) => value + 1)
              setRows((current) => [
                ...current,
                { key, storeId: store.id, role: "CASHIER" },
              ])
              setEditing(key)
            }}
          >
            Add Store
          </ActionButton>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Starting Store"
            className="gap-2"
          >
            <Text className="font-medium text-foreground">Starting Store</Text>
            {rows.map((row) => {
              const store = stores.find((choice) => choice.id === row.storeId)
              return store ? (
                <Choice
                  key={row.key}
                  label={store.name}
                  selected={defaultStoreId === store.id}
                  disabled={controlsDisabled}
                  onPress={() => setDefaultStoreId(store.id)}
                />
              ) : null
            })}
          </View>
          <Choice
            label="Allow catalog editing (requires a Manager assignment)"
            selected={catalogEditor}
            disabled={controlsDisabled || (!hasManager && !catalogEditor)}
            checkbox
            onPress={() => setCatalogEditor((value) => !value)}
          />
          {unresolved ? (
            <Text
              accessibilityRole="alert"
              className="text-sm text-destructive"
            >
              Every saved assignment stays listed. Replace or remove unavailable
              Stores before saving.
            </Text>
          ) : null}
          {!hasDefault ? (
            <Text
              accessibilityRole="alert"
              className="text-sm text-destructive"
            >
              Choose an assigned starting Store.
            </Text>
          ) : null}
          {catalogEditor && !hasManager ? (
            <Text
              accessibilityRole="alert"
              className="text-sm text-destructive"
            >
              Catalog editing requires a Manager assignment. Restore that role
              or explicitly turn catalog editing off.
            </Text>
          ) : null}
        </>
      )}
    </Frame>
  )
}

function ReasonEditor({
  initial,
  intent,
  disabled,
  onSave,
}: Props & {
  intent: Exclude<NativeStaffInvitationAction["intent"], { kind: "INVITE" }>
}) {
  const [reason, setReason] = useState(intent.reason)
  const [error, setError] = useState<string | null>(null)
  return (
    <Frame
      error={error}
      disabled={disabled}
      onSave={() => {
        if (disabled) return
        const result = nativeStaffInvitationCandidate(
          initial,
          { kind: intent.kind, reason },
          [],
        )
        if (!result.ok) return setError(result.error)
        setError(null)
        onSave(result.payload)
      }}
    >
      <Text className="text-sm text-muted-foreground">
        {intent.kind === "RESEND"
          ? "Confirmation replaces the pending link and queues another email request. The old link becomes invalid; Store roles and grants stay unchanged. Saved or queued does not mean sent, delivered or accepted."
          : "Confirmation invalidates the pending link and cancels unsent work. Membership stays invited and its seat stays counted. An email already sending may still arrive with an unusable link."}{" "}
        The reviewed invitation stays selected. Ask in chat to select another
        person.
      </Text>
      <FormField
        label="Reason"
        value={reason}
        editable={!disabled}
        multiline
        maxLength={500}
        onChangeText={setReason}
      />
    </Frame>
  )
}

function Choice({
  label,
  selected,
  disabled,
  checkbox = false,
  onPress,
}: {
  label: string
  selected: boolean
  disabled: boolean
  checkbox?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole={checkbox ? "checkbox" : "radio"}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-11 rounded-lg border px-3 py-3 ${selected ? "border-primary bg-secondary" : "border-border bg-background"}`}
    >
      <Text className="text-sm text-foreground">{label}</Text>
    </Pressable>
  )
}
