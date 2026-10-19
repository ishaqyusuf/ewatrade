import {
  SearchFooterField,
  SearchFooterSpacer,
} from "@/components/mobile/search-footer-scope"
import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { ServiceIntakeAction } from "@ewatrade/assistant/general/service-intake"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { minorToStatedAmount } from "@ewatrade/assistant/general/stated-money"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useRef, useState } from "react"
import { ActionButton } from "../action-button"
import { FormField } from "../form-field"
import {
  type NativeIntakeContinuation,
  type NativeIntakeOffering,
  initialIntakePayment,
  intakeChoicePage,
  intakeOfferingName,
  intakePaymentMethods,
  intakeUtcInput,
  nativeServiceIntakeCandidate,
} from "./native-service-intake-values"

type Props = {
  initial: ServiceIntakeAction
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}
type Options = RouterOutputs["serviceAssistantIntake"]["options"]
type Customer = RouterOutputs["customers"]["getById"]
const readOptions = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
  trpc: { abortOnUnmount: true },
}

/** Edits an intention; only the parent's new canonical review can approve it. */
export function GeneralServiceIntakeEditor(props: Props) {
  const { profile } = useAuthContext()
  if (
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    (profile.status !== undefined && profile.status !== "ACTIVE") ||
    !["OWNER", "ADMIN", "MANAGER"].includes(profile.role ?? "")
  )
    return (
      <Text accessibilityRole="alert" className="p-5 text-sm text-foreground">
        Current Owner, Admin or Manager access at the selected Store is required
        to edit service intake.
      </Text>
    )
  return (
    <IntakeEditor
      key={JSON.stringify([
        profile.id,
        profile.businessId,
        profile.storeId,
        profile.role,
        profile.staffAccessMode,
        profile.catalogEditor,
        profile.status,
        props.initial,
      ])}
      {...props}
      storeId={profile.storeId}
    />
  )
}

function FreshChoices({
  request,
  customerId,
  storeId,
  children,
}: {
  request: NativeIntakeContinuation
  customerId?: string
  storeId: string
  children: (options: Options, customer: Customer | null) => ReactNode
}) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const choices = useQuery(
    mountOwnedRead(
      trpc.serviceAssistantIntake.options.queryOptions(request, readOptions),
      mount,
    ),
  )
  const customer = useQuery(
    mountOwnedRead(
      trpc.customers.getById.queryOptions(
        { customerId: customerId ?? "" },
        { ...readOptions, enabled: Boolean(customerId) },
      ),
      mount,
    ),
  )
  const read = freshShownRead(choices)
  const person = customerId ? freshShownRead(customer) : null
  const refused =
    read.state === "refused" ||
    person?.state === "refused" ||
    (read.state === "ready" && read.data.storeId !== storeId) ||
    (person?.state === "ready" && person.data?.id !== customerId)
  if (refused)
    return (
      <View className="gap-3">
        <Text accessibilityRole="alert">
          Current services, saved customer or assignees are unavailable at this
          Store. The selected lines stay in the draft.
        </Text>
        <ActionButton
          variant="outline"
          onPress={() => {
            void choices.refetch()
            if (customerId) void customer.refetch()
          }}
        >
          Retry intake choices
        </ActionButton>
      </View>
    )
  if (read.state !== "ready" || (customerId && person?.state !== "ready"))
    return (
      <Text className="text-sm text-muted-foreground">
        Checking current services, customer and eligible assignees…
      </Text>
    )
  return children(read.data, person?.state === "ready" ? person.data : null)
}

function IntakeEditor({
  initial,
  disabled,
  onSave,
  storeId,
}: Props & { storeId: string }) {
  const fields = useRef({
    draft: initial,
    payment: initialIntakePayment(initial),
    requested: intakeUtcInput(initial.requestedAt),
    due: intakeUtcInput(initial.dueCommitmentAt),
    rowKeys: initial.lines.map((_, index) => `saved-${index}`),
    nextKey: 0,
  })
  const [draft, setDraft] = useState(initial)
  const [rowKeys, setRowKeys] = useState(fields.current.rowKeys)
  const [editing, setEditing] = useState<string | null>(null)
  const [assigneeChoices, setAssigneeChoices] = useState(false)
  const [payment, setPayment] = useState(() => initialIntakePayment(initial))
  const [requested, setRequested] = useState(() =>
    intakeUtcInput(initial.requestedAt),
  )
  const [due, setDue] = useState(() => intakeUtcInput(initial.dueCommitmentAt))
  const [search, setSearch] = useState("")
  const [request, setRequest] = useState<NativeIntakeContinuation>({})
  const [retained, setRetained] = useState<NativeIntakeOffering[]>([])
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState<string | null>(null)
  function patch<K extends keyof ServiceIntakeAction>(
    key: K,
    value:
      | ServiceIntakeAction[K]
      | ((current: ServiceIntakeAction[K]) => ServiceIntakeAction[K]),
  ) {
    const current = fields.current.draft
    const next = {
      ...current,
      [key]: typeof value === "function" ? value(current[key]) : value,
    }
    fields.current.draft = next
    setDraft(next)
  }
  function changePayment(value: string) {
    fields.current.payment = value
    setPayment(value)
  }
  function changeRequested(value: string) {
    fields.current.requested = value
    setRequested(value)
  }
  function changeDue(value: string) {
    fields.current.due = value
    setDue(value)
  }
  function text(
    key:
      | "customerName"
      | "customerPhone"
      | "customerEmail"
      | "instructions"
      | "conditionNote"
      | "initialPaymentReference",
    value: string,
  ) {
    patch(key, value.trim() ? value : undefined)
  }
  return (
    <BottomSheetInputProvider>
      <BottomSheetKeyboardAwareScrollView
        contentContainerStyle={{ gap: 16, padding: 18, paddingBottom: 32 }}
      >
        <Text className="text-sm text-muted-foreground">
          Save details to rebuild the server review before explicit
          confirmation. Confirmation creates an Intake and Order; tracked
          services also create queued work. No payment is charged or message
          sent here.
        </Text>
        <FreshChoices
          key={JSON.stringify([request, refresh])}
          request={request}
          customerId={initial.customerId}
          storeId={storeId}
        >
          {(options, customer) => {
            const offerings = intakeChoicePage(
              retained,
              options.offerings,
              draft.lines.map((line) => line.offeringId),
            )
            const unresolved =
              draft.lines.some(
                (line) =>
                  !offerings.some(
                    (offering) => offering.offeringId === line.offeringId,
                  ),
              ) ||
              Boolean(
                draft.requestedAssigneeId &&
                  !options.assignees.some(
                    (person) => person.id === draft.requestedAssigneeId,
                  ),
              )
            const navigate = (next: NativeIntakeContinuation) => {
              if (disabled) return
              const selected = new Set(
                fields.current.draft.lines.map((line) => line.offeringId),
              )
              setRetained(
                offerings.filter((row) => selected.has(row.offeringId)),
              )
              setRequest(next)
              setRefresh((value) => value + 1)
            }
            return (
              <>
                <SearchFooterField
                  placeholder="Find fixed-price services"
                  accessibilityLabel="Find fixed-price services"
                  value={search}
                  maxLength={160}
                  editable={!disabled}
                  onChangeText={setSearch}
                />
                <ActionButton
                  variant="outline"
                  disabled={disabled}
                  onPress={() =>
                    navigate({ query: search.trim() || undefined })
                  }
                >
                  Search services
                </ActionButton>
                <ActionButton
                  variant="outline"
                  disabled={disabled}
                  onPress={() => navigate({ query: request.query })}
                >
                  First choices
                </ActionButton>
                <ActionButton
                  variant="outline"
                  disabled={disabled || !options.continuation}
                  onPress={() => {
                    if (options.continuation) navigate(options.continuation)
                  }}
                >
                  Next choices
                </ActionButton>
                <Text className="text-xs text-muted-foreground">
                  Choices are one bounded catalog page, not all services. Search
                  or continue. Selected earlier-page facts are labelled
                  previously read; confirmation rechecks their current
                  availability, prices and work rules.
                </Text>
                {initial.customerId ? (
                  <View className="gap-1">
                    <Text className="text-sm text-foreground">
                      Saved customer: {customer?.name || "Name not recorded"}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {customer?.phone || "Phone not recorded"} ·{" "}
                      {customer?.email || "Email not recorded"}. Saved identity
                      and contacts stay selected without overrides. Ask in chat
                      to select another customer.
                    </Text>
                  </View>
                ) : (
                  <>
                    <FormField
                      label="Customer name (optional)"
                      value={draft.customerName ?? ""}
                      maxLength={160}
                      editable={!disabled}
                      onChangeText={(value) => text("customerName", value)}
                    />
                    <FormField
                      label="Customer phone (optional)"
                      value={draft.customerPhone ?? ""}
                      maxLength={40}
                      keyboardType="phone-pad"
                      editable={!disabled}
                      onChangeText={(value) => text("customerPhone", value)}
                    />
                    <FormField
                      label="Customer email (optional)"
                      value={draft.customerEmail ?? ""}
                      maxLength={320}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!disabled}
                      onChangeText={(value) => text("customerEmail", value)}
                    />
                    <Text className="text-xs text-muted-foreground">
                      New contact details are an Order snapshot; this does not
                      create a saved customer directory record.
                    </Text>
                  </>
                )}
                <Text className="font-medium text-foreground">
                  Selected services ({draft.lines.length}/100)
                </Text>
                {draft.lines.map((line, index) => {
                  const key = rowKeys[index] ?? `missing-${index}`
                  const offering = offerings.find(
                    (row) => row.offeringId === line.offeringId,
                  )
                  return (
                    <View
                      key={key}
                      className="gap-3 rounded-lg border border-border p-3"
                    >
                      <Text className="font-medium text-foreground">
                        Service {index + 1}:{" "}
                        {offering
                          ? intakeOfferingName(offering)
                          : "Selected service unresolved — search or continue"}
                      </Text>
                      {offering ? (
                        <NativeIntakeOfferingFacts
                          offering={offering}
                          currencyCode={options.currencyCode}
                        />
                      ) : (
                        <Text className="text-xs text-muted-foreground">
                          The exact saved selection is retained. Nothing has
                          been replaced or removed.
                        </Text>
                      )}
                      <FormField
                        label={`Exact quantity for service ${index + 1}`}
                        value={line.quantity}
                        maxLength={40}
                        keyboardType="decimal-pad"
                        editable={!disabled}
                        onChangeText={(quantity) =>
                          patch("lines", (current) =>
                            current.map((row, position) =>
                              position === fields.current.rowKeys.indexOf(key)
                                ? { ...row, quantity }
                                : row,
                            ),
                          )
                        }
                      />
                      <ActionButton
                        variant="outline"
                        disabled={disabled}
                        onPress={() => setEditing(editing === key ? null : key)}
                      >
                        Choose service {index + 1}
                      </ActionButton>
                      {editing === key ? (
                        <View
                          accessibilityRole="radiogroup"
                          accessibilityLabel={`Offering for service ${index + 1}`}
                          className="gap-2"
                        >
                          {options.offerings.map((choice) => (
                            <Choice
                              key={choice.offeringId}
                              label={`${intakeOfferingName(choice)} · ${choice.service?.workPolicy === "TRACKED" ? "Tracked work" : "Charge only"}`}
                              selected={choice.offeringId === line.offeringId}
                              disabled={disabled}
                              onPress={() => {
                                patch("lines", (current) =>
                                  current.map((row, position) =>
                                    position ===
                                    fields.current.rowKeys.indexOf(key)
                                      ? {
                                          ...row,
                                          offeringId: choice.offeringId,
                                        }
                                      : row,
                                  ),
                                )
                                setEditing(null)
                              }}
                            />
                          ))}
                        </View>
                      ) : null}
                      {draft.lines.length > 1 ? (
                        <ActionButton
                          variant="ghost"
                          disabled={disabled}
                          accessibilityLabel={`Remove service ${index + 1}`}
                          onPress={() => {
                            const position = fields.current.rowKeys.indexOf(key)
                            if (
                              position < 0 ||
                              fields.current.draft.lines.length <= 1
                            )
                              return
                            patch("lines", (current) =>
                              current.filter((_, index) => index !== position),
                            )
                            fields.current.rowKeys =
                              fields.current.rowKeys.filter(
                                (rowKey) => rowKey !== key,
                              )
                            setRowKeys(fields.current.rowKeys)
                          }}
                        >
                          Remove service
                        </ActionButton>
                      ) : null}
                    </View>
                  )
                })}
                <ActionButton
                  variant="outline"
                  disabled={
                    disabled ||
                    draft.lines.length >= 100 ||
                    !options.offerings.length
                  }
                  onPress={() => {
                    if (disabled || fields.current.draft.lines.length >= 100)
                      return
                    const offering = options.offerings[0]
                    if (!offering) return
                    const key = `added-${fields.current.nextKey++}`
                    fields.current.rowKeys = [...fields.current.rowKeys, key]
                    setRowKeys(fields.current.rowKeys)
                    patch("lines", (current) => [
                      ...current,
                      { offeringId: offering.offeringId, quantity: "1" },
                    ])
                    setEditing(key)
                  }}
                >
                  Add service
                </ActionButton>
                <FormField
                  label="Instructions (optional)"
                  value={draft.instructions ?? ""}
                  maxLength={4000}
                  multiline
                  editable={!disabled}
                  onChangeText={(value) => text("instructions", value)}
                />
                <FormField
                  label="Condition note (optional)"
                  value={draft.conditionNote ?? ""}
                  maxLength={2000}
                  multiline
                  editable={!disabled}
                  onChangeText={(value) => text("conditionNote", value)}
                />
                <Text className="text-sm text-foreground">
                  Assignee:{" "}
                  {draft.requestedAssigneeId
                    ? (options.assignees.find(
                        (person) => person.id === draft.requestedAssigneeId,
                      )?.name ?? "Selected assignee unavailable")
                    : "Unassigned"}
                </Text>
                <ActionButton
                  variant="outline"
                  disabled={disabled}
                  onPress={() => setAssigneeChoices((value) => !value)}
                >
                  Choose assignee
                </ActionButton>
                {assigneeChoices ? (
                  <View
                    accessibilityRole="radiogroup"
                    accessibilityLabel="Eligible assignee"
                    className="gap-2"
                  >
                    <Choice
                      label="Unassigned"
                      selected={!draft.requestedAssigneeId}
                      disabled={disabled}
                      onPress={() => patch("requestedAssigneeId", undefined)}
                    />
                    {options.assignees.map((person) => (
                      <Choice
                        key={person.id}
                        label={person.name}
                        selected={draft.requestedAssigneeId === person.id}
                        disabled={disabled}
                        onPress={() => patch("requestedAssigneeId", person.id)}
                      />
                    ))}
                  </View>
                ) : null}
                <FormField
                  label="Requested date and time (UTC, optional)"
                  value={requested}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="2026-10-15T14:00:00.000Z"
                  editable={!disabled}
                  onChangeText={changeRequested}
                />
                <FormField
                  label="Promised date and time (UTC, optional)"
                  value={due}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="2026-10-16T14:00:00.000Z"
                  editable={!disabled}
                  onChangeText={changeDue}
                />
                <Text className="text-xs text-muted-foreground">
                  Enter explicit UTC, including seconds and Z. Original exact
                  times and fractional seconds are preserved unless changed.
                  Assignment and promised work require a tracked service.
                </Text>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Priority"
                  className="gap-2"
                >
                  {(
                    [
                      ["normal", "Normal"],
                      ["urgent", "Urgent"],
                    ] as const
                  ).map(([value, label]) => (
                    <Choice
                      key={value}
                      label={label}
                      selected={(draft.priority ?? "normal") === value}
                      disabled={disabled}
                      onPress={() => patch("priority", value)}
                    />
                  ))}
                </View>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Service level"
                  className="gap-2"
                >
                  {(
                    [
                      ["standard", "Standard"],
                      ["express", "Express — Store surcharge settings apply"],
                    ] as const
                  ).map(([value, label]) => (
                    <Choice
                      key={value}
                      label={label}
                      selected={(draft.serviceLevel ?? "standard") === value}
                      disabled={disabled}
                      onPress={() => patch("serviceLevel", value)}
                    />
                  ))}
                </View>
                <FormField
                  label={`Initial payment already received (${options.currencyCode ?? "business currency"}, optional)`}
                  value={payment}
                  maxLength={16}
                  keyboardType="decimal-pad"
                  editable={!disabled}
                  onChangeText={changePayment}
                />
                {payment.trim() ? (
                  <>
                    <View
                      accessibilityRole="radiogroup"
                      accessibilityLabel="Recorded payment method"
                      className="gap-2"
                    >
                      {intakePaymentMethods.map(([value, label]) => (
                        <Choice
                          key={value}
                          label={label}
                          selected={
                            (draft.initialPaymentMethod ?? "cash") === value
                          }
                          disabled={disabled}
                          onPress={() => patch("initialPaymentMethod", value)}
                        />
                      ))}
                    </View>
                    <FormField
                      label="Payment reference (optional)"
                      value={draft.initialPaymentReference ?? ""}
                      maxLength={160}
                      editable={!disabled}
                      onChangeText={(value) =>
                        text("initialPaymentReference", value)
                      }
                    />
                  </>
                ) : null}
                <Text className="text-xs text-muted-foreground">
                  Record only money already received. No provider charge or bank
                  settlement verification occurs. If the business has a Finance
                  Book, create intake without payment and record payment with a
                  receiving account in the Order. Automatic customer reminders
                  require the owning Service form; this editor cannot approve or
                  send them.
                </Text>
                {unresolved ? (
                  <Text
                    accessibilityRole="alert"
                    className="text-sm text-destructive"
                  >
                    A selected service or assignee is unresolved. Search or
                    continue, choose a current option or explicitly remove the
                    selection before reviewing.
                  </Text>
                ) : null}
                {error ? (
                  <Text
                    accessibilityRole="alert"
                    className="text-sm text-destructive"
                  >
                    {error}
                  </Text>
                ) : null}
                <ActionButton
                  variant="outline"
                  disabled={disabled}
                  onPress={() => navigate(request)}
                >
                  Refresh choices
                </ActionButton>
                <ActionButton
                  disabled={disabled || unresolved}
                  onPress={() => {
                    if (disabled) return
                    const latest = fields.current
                    const result = nativeServiceIntakeCandidate(
                      initial,
                      latest.draft,
                      {
                        payment: latest.payment,
                        requested: latest.requested,
                        due: latest.due,
                      },
                      { offerings, assignees: options.assignees },
                    )
                    if (!result.ok) return setError(result.error)
                    setError(null)
                    onSave(result.payload)
                  }}
                >
                  Save and review
                </ActionButton>
              </>
            )
          }}
        </FreshChoices>
        <SearchFooterSpacer />
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}

/** Historical selected facts stay visibly distinct from this page's fresh facts. */
export function NativeIntakeOfferingFacts({
  offering,
  currencyCode,
}: {
  offering: NativeIntakeOffering
  currencyCode: string | null | undefined
}) {
  const authorization = offering.service?.authorizationPolicy
  const price = offering.fixedPriceMinor
  const priceAvailable =
    typeof price === "number" && Number.isSafeInteger(price) && price >= 0
  return (
    <Text className="text-xs text-muted-foreground">
      {offering.service?.workPolicy === "TRACKED"
        ? "Tracked: creates queued Job Lines"
        : offering.service?.workPolicy === "CHARGE_ONLY"
          ? "Charge only: no queued Job Line"
          : "Work policy unavailable"}
      .{" "}
      {offering.previouslyRead
        ? "Previously read on an earlier choices page; price and availability must be reviewed again."
        : "Fixed-price service on this choices page."}{" "}
      {offering.previouslyRead ? "Previously read price" : "Page price"}:{" "}
      {priceAvailable
        ? `${minorToStatedAmount(price)} ${currencyCode ?? "(currency unavailable)"}`
        : "Unavailable"}
      . Work authorization:{" "}
      {authorization === "ON_ORDER_CONFIRMATION"
        ? "on Order confirmation"
        : authorization === "AFTER_REQUIRED_PAYMENT"
          ? "after required payment"
          : authorization === "MANUAL_RELEASE"
            ? "separate management release"
            : "review required"}
      . This editor does not start or release work.
    </Text>
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
      className={`min-h-11 rounded-lg border px-3 py-3 ${selected ? "border-primary bg-secondary" : "border-border bg-background"}`}
    >
      <Text className="text-sm text-foreground">{label}</Text>
    </Pressable>
  )
}
