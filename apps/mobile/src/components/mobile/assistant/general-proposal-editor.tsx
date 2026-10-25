import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  type GeneralAction,
  type GeneralProposal,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import { isSimpleProductCreate } from "@ewatrade/assistant/general/product-create"
import {
  CATALOG_FREE_LINE_LABELS,
  catalogFreeLineDescriptionError,
} from "@ewatrade/utils/catalog-free-lines"
import {
  getCountry,
  toInternationalPhone,
  toLocalPhone,
} from "@ewatrade/utils/countries"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import { useState } from "react"
import { ActionButton } from "../action-button"
import { CountrySelect } from "../country-select"
import { FormField } from "../form-field"
import { QaQuickFillButton } from "../qa-quick-fill-button"
import { SearchFooterSpacer } from "../search-footer-scope"
import { GeneralCashCountEditor } from "./general-cash-count-editor"
import { GeneralChangeEditor } from "./general-change-editor"
import { GeneralMoneyOperationEditor } from "./general-money-operation-editor"
import { GeneralOrderOperationEditor } from "./general-order-operation-editor"
import { GeneralProductCreateRows } from "./general-product-create-rows"
import {
  GeneralProductPictureField,
  useProductPicture,
} from "./general-product-picture"
import { GeneralQuoteDecisionEditor } from "./general-quote-decision-editor"
import { GeneralServiceIntakeEditor } from "./general-service-intake-editor"
import { GeneralServiceMessageEditor } from "./general-service-message-editor"
import { GeneralServiceWorkEditor } from "./general-service-work-editor"
import { GeneralSimpleSaleEditor } from "./general-simple-sale-editor"
import { GeneralStaffAccessEditor } from "./general-staff-access-editor"
import { GeneralStaffInvitationEditor } from "./general-staff-invitation-editor"
import { GeneralStaffStatusEditor } from "./general-staff-status-editor"
import { GeneralStockEditor } from "./general-stock-editor"
import { isNativeChange } from "./native-change-values"
import { isNativeMoneyAction } from "./native-money-values"
import { isNativeOrderAction } from "./native-order-values"
import { nativeEditorActions } from "./native-parity"
import { isNativeStockAction } from "./native-stock-values"
export function GeneralProposalEditor(props: {
  proposal: GeneralProposal
  currencyCode: string
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}) {
  const initial = props.proposal.payload
  if (initial.action === "service_message_share")
    return (
      <GeneralServiceMessageEditor
        key={`${props.proposal.id}:${props.proposal.revision}`}
        initial={initial}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  if (initial.action === "cash_count_record")
    return (
      <GeneralCashCountEditor
        initial={initial}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  if (initial.action === "service_intake")
    return (
      <GeneralServiceIntakeEditor
        initial={initial}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  if (
    initial.action === "commerce_quote_approve" ||
    initial.action === "commerce_quote_reject"
  )
    return (
      <GeneralQuoteDecisionEditor
        initial={initial}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  if (
    initial.action === "service_job_assign" ||
    initial.action === "service_job_reschedule" ||
    initial.action === "service_job_line_transition" ||
    initial.action === "service_work_note" ||
    initial.action === "service_work_exception" ||
    initial.action === "service_work_rework" ||
    initial.action === "service_work_handoff"
  )
    return (
      <GeneralServiceWorkEditor
        initial={initial}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  if (initial.action === "staff_status")
    return (
      <GeneralStaffStatusEditor
        initial={initial}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  if (initial.action === "staff_invitation")
    return (
      <GeneralStaffInvitationEditor
        initial={initial}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  if (initial.action === "staff_access")
    return (
      <GeneralStaffAccessEditor
        initial={initial}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  if (isNativeMoneyAction(initial))
    return (
      <GeneralMoneyOperationEditor
        initial={initial}
        currencyCode={props.currencyCode}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  if (isNativeOrderAction(initial))
    return (
      <GeneralOrderOperationEditor
        initial={initial}
        review={props.proposal.review}
        currencyCode={props.currencyCode}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  if (initial.action === "sale_record")
    return (
      <GeneralSimpleSaleEditor
        key={`${props.proposal.id}:${props.proposal.revision}`}
        initial={initial}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  if (isNativeStockAction(initial))
    return (
      <GeneralStockEditor
        key={`${props.proposal.id}:${props.proposal.revision}`}
        initial={initial}
        currencyCode={props.currencyCode}
        disabled={props.disabled}
        onSave={props.onSave}
      />
    )
  return isNativeChange(initial) ? (
    <GeneralChangeEditor
      initial={initial}
      review={props.proposal.review}
      currencyCode={props.currencyCode}
      disabled={props.disabled}
      onSave={props.onSave}
    />
  ) : (
    <GeneralRecordEditor {...props} />
  )
}
function GeneralRecordEditor({
  proposal,
  disabled,
  onSave,
}: {
  proposal: GeneralProposal
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}) {
  const initial = proposal.payload
  const [payload, setPayload] = useState(initial)
  const [price, setPrice] = useState(
    initial.action === "product_create" && "priceMinor" in initial
      ? minorToMajorInput(initial.priceMinor)
      : initial.action === "payment_record"
        ? minorToMajorInput(initial.amountMinor)
        : "",
  )
  const [country, setCountry] = useState("NG")
  const [phone, setPhone] = useState(
    initial.action === "customer_create"
      ? toLocalPhone(getCountry("NG").dialCode, initial.phone)
      : "",
  )
  const [undo, setUndo] = useState<{
    payload: GeneralAction
    price: string
    phone: string
    country: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Per custom line: a Quick sale must say what was sold; Additional cost
  // descriptions stay optional. Older drafts still open for repair.
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({})
  const patch = (value: Record<string, unknown>) =>
    setPayload((current) => ({ ...current, ...value }) as GeneralAction)
  const picture = useProductPicture(initial, disabled)
  const native = nativeEditorActions.has(initial.action)
  const save = async () => {
    if (disabled || picture.uploading || !native) return
    const amount = majorToMinor(price)
    if (
      ((payload.action === "product_create" &&
        isSimpleProductCreate(payload)) ||
        payload.action === "payment_record") &&
      amount === null
    ) {
      setError("Enter a valid amount.")
      return
    }
    if (payload.action === "order_create") {
      const problems: Record<number, string> = {}
      payload.lines.forEach((line, index) => {
        if (!("custom" in line)) return
        const problem = catalogFreeLineDescriptionError({
          kind: line.custom,
          description: line.description?.trim() ?? "",
        })
        if (problem) problems[index] = problem
      })
      setLineErrors(problems)
      if (Object.keys(problems).length) {
        setError(null)
        return
      }
    }
    // A new product photo uploads first; a failed upload shows its message.
    const media =
      payload.action === "product_create" ? await picture.resolve() : {}
    if (!media) return
    const candidate = {
      ...payload,
      ...media,
      ...(payload.action === "product_create"
        ? isSimpleProductCreate(payload)
          ? { priceMinor: amount }
          : {}
        : payload.action === "payment_record"
          ? { amountMinor: amount }
          : payload.action === "customer_create"
            ? {
                phone: phone.trim()
                  ? toInternationalPhone(getCountry(country).dialCode, phone)
                  : undefined,
              }
            : payload.action === "order_create"
              ? {
                  lines: payload.lines.map((line) =>
                    "custom" in line
                      ? {
                          ...line,
                          description: line.description?.trim() || undefined,
                        }
                      : line,
                  ),
                }
              : {}),
    }
    const parsed = generalActionSchema.safeParse(candidate)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the draft fields.")
      return
    }
    setError(null)
    onSave(parsed.data)
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
        {native ? null : (
          <Text className="text-sm text-foreground">
            Edit this draft on the dashboard. Nothing changes until it is
            reviewed and confirmed there.
          </Text>
        )}
        <Text className="text-sm text-muted-foreground">
          Save changes, then review the updated card before confirming.
        </Text>
        <QaQuickFillButton
          formId="general-assistant-proposal"
          isDirty={
            JSON.stringify(payload) !== JSON.stringify(initial) ||
            phone !== ("phone" in initial ? initial.phone : "")
          }
          canUndo={!!undo}
          onFill={(_context, sequence) => {
            if (disabled) return
            setUndo({ payload, price, phone, country })
            if (payload.action === "customer_create") {
              patch({ name: `QA customer ${sequence}`, email: undefined })
              setPhone(`0801234${String(sequence).padStart(4, "0")}`)
            } else if (payload.action === "product_create") {
              patch({
                name: `QA product ${sequence}`,
                canonicalUnitName: "Piece",
              })
              setPrice("1500")
            } else if (payload.action === "payment_record") setPrice("100")
            else patch({ notes: `QA order note ${sequence}` })
          }}
          onUndo={() => {
            if (disabled || !undo) return
            setPayload(undo.payload)
            setPrice(undo.price)
            setPhone(undo.phone)
            setCountry(undo.country)
            setUndo(null)
          }}
        />
        {"name" in payload ? (
          <FormField
            label="Name"
            value={payload.name}
            editable={!disabled}
            onChangeText={(name) => patch({ name })}
          />
        ) : null}
        {payload.action === "customer_create" ? (
          <>
            <CountrySelect
              value={country}
              disabled={disabled}
              onChange={setCountry}
            />
            <FormField
              label="Phone"
              value={phone}
              editable={!disabled}
              keyboardType="phone-pad"
              onChangeText={setPhone}
            />
            <FormField
              label="Email"
              value={payload.email ?? ""}
              editable={!disabled}
              keyboardType="email-address"
              autoCapitalize="none"
              onChangeText={(email) =>
                patch({ email: email.trim() || undefined })
              }
            />
          </>
        ) : null}
        {payload.action === "customer_update" ? (
          <>
            <Text className="text-sm text-muted-foreground">
              Leave a field as it is to keep it. Clear phone or email to remove
              it.
            </Text>
            <FormField
              label="Phone"
              value={payload.phone ?? ""}
              editable={!disabled}
              keyboardType="phone-pad"
              onChangeText={(phone) => patch({ phone: phone.trim() || null })}
            />
            <FormField
              label="Email"
              value={payload.email ?? ""}
              editable={!disabled}
              keyboardType="email-address"
              autoCapitalize="none"
              onChangeText={(email) => patch({ email: email.trim() || null })}
            />
          </>
        ) : null}
        {payload.action === "product_create" &&
        !isSimpleProductCreate(payload) ? (
          <GeneralProductCreateRows
            payload={payload}
            disabled={disabled}
            onChange={(variants) => patch({ variants })}
          />
        ) : null}
        {payload.action === "product_create" &&
        isSimpleProductCreate(payload) ? (
          <FormField
            label="Unit"
            value={payload.canonicalUnitName}
            editable={!disabled}
            onChangeText={(canonicalUnitName) => patch({ canonicalUnitName })}
          />
        ) : null}
        {(payload.action === "product_create" &&
          isSimpleProductCreate(payload)) ||
        payload.action === "payment_record" ? (
          <FormField
            label={
              payload.action === "product_create"
                ? "Unit price"
                : "Payment amount"
            }
            value={price}
            editable={!disabled}
            keyboardType="decimal-pad"
            onChangeText={setPrice}
          />
        ) : null}
        {payload.action === "product_create" ? (
          <GeneralProductPictureField picture={picture} disabled={disabled} />
        ) : null}
        {payload.action === "payment_record" ? (
          <>
            <Text className="text-sm font-bold text-foreground">
              Payment method
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {(["cash", "bank_transfer", "card", "pos", "other"] as const).map(
                (method) => (
                  <ActionButton
                    key={method}
                    disabled={disabled}
                    variant={payload.method === method ? "default" : "outline"}
                    onPress={() => patch({ method })}
                  >
                    {method.replaceAll("_", " ")}
                  </ActionButton>
                ),
              )}
            </View>
            <FormField
              label="Note"
              value={payload.note ?? ""}
              editable={!disabled}
              onChangeText={(note) => patch({ note: note.trim() || undefined })}
            />
          </>
        ) : null}
        {payload.action === "order_create" ? (
          <>
            <Text className="text-sm text-muted-foreground">
              Use the sale form to change items or the customer. Here you can
              adjust quantities, notes and what each typed-price line was for.
            </Text>
            {payload.lines.map((line, index) =>
              "custom" in line ? (
                <FormField
                  key={`custom:${index}`}
                  label={
                    line.custom === "quick_sale"
                      ? `What was sold? · line ${index + 1}`
                      : `${CATALOG_FREE_LINE_LABELS[line.custom]} description · line ${index + 1}`
                  }
                  helper={`${line.custom === "quick_sale" ? "Required" : "Optional"} · ${CATALOG_FREE_LINE_LABELS[line.custom]} ${minorToMajorInput(line.amountMinor)}`}
                  error={lineErrors[index]}
                  value={line.description ?? ""}
                  editable={!disabled}
                  maxLength={240}
                  onChangeText={(description) => {
                    patch({
                      lines: payload.lines.map((current, i) =>
                        i === index
                          ? {
                              ...current,
                              description: description || undefined,
                            }
                          : current,
                      ),
                    })
                    if (lineErrors[index])
                      setLineErrors((current) => {
                        const next = { ...current }
                        const problem = catalogFreeLineDescriptionError({
                          kind: line.custom,
                          description: description.trim(),
                        })
                        if (problem) next[index] = problem
                        else delete next[index]
                        return next
                      })
                  }}
                />
              ) : (
                <FormField
                  key={`${line.offeringId}:${index}`}
                  label={`Quantity · line ${index + 1}`}
                  value={line.quantity}
                  editable={!disabled}
                  keyboardType="decimal-pad"
                  onChangeText={(quantity) =>
                    patch({
                      lines: payload.lines.map((current, i) =>
                        i === index ? { ...current, quantity } : current,
                      ),
                    })
                  }
                />
              ),
            )}
            <FormField
              label="Notes"
              value={payload.notes ?? ""}
              editable={!disabled}
              multiline
              onChangeText={(notes) =>
                patch({ notes: notes.trim() || undefined })
              }
            />
          </>
        ) : null}
        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-destructive"
          >
            {error}
          </Text>
        ) : null}
        <ActionButton
          disabled={disabled || picture.uploading || !native}
          onPress={() => void save()}
        >
          Save draft
        </ActionButton>
        <SearchFooterSpacer />
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}
