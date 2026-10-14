"use client"
import {
  type StoreSettingsUpdateAction,
  storeSettingsUpdateAction,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  FieldGroup,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { useState } from "react"

type Props = {
  initial: StoreSettingsUpdateAction
  disabled: boolean
  onSave: (value: StoreSettingsUpdateAction) => void
  onCancel: () => void
}
const defaultReceipt = {
  showCustomerName: true,
  showPaymentBreakdown: true,
  thankYouNote: "",
}

/** Edits the drafted values of one Store setting; the server re-reviews. */
export function GeneralStoreSettingsEditor(props: Props) {
  const [payload, setPayload] = useState(props.initial)
  const [error, setError] = useState<string | null>(null)
  const { change } = payload
  const setChange = (next: StoreSettingsUpdateAction["change"]) =>
    setPayload({ ...payload, change: next })
  const toggle = (
    label: string,
    checked: boolean,
    on: (v: boolean) => void,
  ) => (
    <CheckboxField label={label}>
      <Checkbox
        checked={checked}
        disabled={props.disabled}
        onCheckedChange={(value) => on(Boolean(value))}
      />
    </CheckboxField>
  )
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (props.disabled) return
        const parsed = storeSettingsUpdateAction.safeParse(payload)
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the setting.")
          return
        }
        setError(null)
        props.onSave(parsed.data)
      }}
    >
      <p className="text-sm text-muted-foreground">
        Save these edits, then review the refreshed change before confirming.
      </p>
      <FieldGroup>
        {change.section === "receipts" ? (
          <>
            <ControlField label="Applies to">
              <SelectControl
                value={change.scope}
                disabled={props.disabled}
                options={[
                  { value: "store", label: "This Store only" },
                  { value: "business", label: "Business defaults" },
                ]}
                onValueChange={(scope) =>
                  setChange({
                    ...change,
                    scope: scope as "store" | "business",
                    settings: change.settings ?? defaultReceipt,
                  })
                }
              />
            </ControlField>
            {change.scope === "store"
              ? toggle(
                  "Use the business defaults instead (remove this Store's own settings)",
                  change.settings === null,
                  (remove) =>
                    setChange({
                      ...change,
                      settings: remove ? null : defaultReceipt,
                    }),
                )
              : null}
            {change.settings ? (
              <>
                {toggle(
                  "Show the customer's name",
                  change.settings.showCustomerName,
                  (showCustomerName) =>
                    change.settings &&
                    setChange({
                      ...change,
                      settings: { ...change.settings, showCustomerName },
                    }),
                )}
                {toggle(
                  "Show the payment breakdown",
                  change.settings.showPaymentBreakdown,
                  (showPaymentBreakdown) =>
                    change.settings &&
                    setChange({
                      ...change,
                      settings: { ...change.settings, showPaymentBreakdown },
                    }),
                )}
                <ControlField label="Thank-you note">
                  <Textarea
                    value={change.settings.thankYouNote}
                    maxLength={300}
                    disabled={props.disabled}
                    onChange={(event) =>
                      change.settings &&
                      setChange({
                        ...change,
                        settings: {
                          ...change.settings,
                          thankYouNote: event.target.value,
                        },
                      })
                    }
                  />
                </ControlField>
              </>
            ) : null}
          </>
        ) : null}
        {change.section === "reminders" ? (
          <>
            {toggle("Send order reminder emails", change.enabled, (enabled) =>
              setChange({ ...change, enabled }),
            )}
            {toggle(
              "The day before delivery",
              change.dayBeforeEnabled,
              (dayBeforeEnabled) => setChange({ ...change, dayBeforeEnabled }),
            )}
            {toggle(
              "On the delivery day",
              change.sameDayEnabled,
              (sameDayEnabled) => setChange({ ...change, sameDayEnabled }),
            )}
          </>
        ) : null}
        {change.section === "order_visibility" ? (
          <ControlField
            label="Sales reps see"
            description="Applies to Cashiers and Operators in this Store."
          >
            <SelectControl
              value={change.visibility}
              disabled={props.disabled}
              options={[
                { value: "OWN_SALES", label: "Only orders they created" },
                {
                  value: "ALL_STORE_ORDERS",
                  label: "All orders in this Store",
                },
              ]}
              onValueChange={(visibility) =>
                setChange({
                  ...change,
                  visibility: visibility as "OWN_SALES" | "ALL_STORE_ORDERS",
                })
              }
            />
          </ControlField>
        ) : null}
        <ControlField label="Reason (optional)">
          <Textarea
            value={payload.reason ?? ""}
            maxLength={500}
            disabled={props.disabled}
            onChange={(event) =>
              setPayload({
                ...payload,
                reason: event.target.value.trim()
                  ? event.target.value
                  : undefined,
              })
            }
          />
        </ControlField>
      </FieldGroup>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={props.disabled}
          onClick={props.onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={props.disabled}>
          Save changes
        </Button>
      </div>
    </form>
  )
}
