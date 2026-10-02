"use client"
import {
  Checkbox,
  CheckboxField,
  ControlField,
  FieldGroup,
  FieldLabel,
  FormActions,
  Input,
  MoneyInput,
  SelectControl,
  SubmitButton,
  Field as UiField,
} from "@ewatrade/ui"

import { useTRPC } from "@/trpc/client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

export function ServiceSettingsForm({
  currencyCode,
  storeId,
}: {
  currencyCode: string
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const settingsQuery = useQuery(
    trpc.services.getSettings.queryOptions({ storeId }, { retry: false }),
  )
  const providerQuery = useQuery(
    trpc.serviceCommunications.providerStatus.queryOptions(undefined, {
      retry: false,
    }),
  )
  const [expressEnabled, setExpressEnabled] = useState(false)
  const [expressLabel, setExpressLabel] = useState("Express")
  const [surchargeType, setSurchargeType] = useState<"fixed" | "percentage">(
    "percentage",
  )
  const [surchargeValue, setSurchargeValue] = useState("0")
  const [turnaroundHours, setTurnaroundHours] = useState("24")
  const [channel, setChannel] = useState<"" | "sms" | "whatsapp">("")
  const [autoReady, setAutoReady] = useState(false)
  const [autoReminder, setAutoReminder] = useState(false)
  const [reminderHours, setReminderHours] = useState("24")
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const settings = settingsQuery.data
    if (!settings) return
    setExpressEnabled(settings.expressEnabled)
    setExpressLabel(settings.expressLabel)
    setSurchargeType(settings.expressSurchargeType)
    setSurchargeValue(
      settings.expressSurchargeType === "percentage"
        ? String(settings.expressSurchargeValue / 100)
        : String(settings.expressSurchargeValue / 100),
    )
    setTurnaroundHours(
      String((settings.expressTurnaroundMinutes ?? 1_440) / 60),
    )
    setChannel(settings.defaultNotificationChannel ?? "")
    setAutoReady(settings.autoNotifyReady)
    setAutoReminder(settings.autoNotifyReminder)
    setReminderHours(String(settings.reminderLeadMinutes / 60))
  }, [settingsQuery.data])

  const mutation = useMutation(
    trpc.services.updateSettings.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        setMessage("Service settings saved.")
        await queryClient.invalidateQueries({
          queryKey: trpc.services.getSettings.queryKey({ storeId }),
        })
      },
    }),
  )

  if (settingsQuery.isLoading) {
    return <div className="h-56 animate-pulse rounded-lg bg-muted" />
  }

  function submit() {
    const numericSurcharge = Number(surchargeValue)
    const numericTurnaround = Number(turnaroundHours)
    const numericReminder = Number(reminderHours)
    if (
      !Number.isFinite(numericSurcharge) ||
      numericSurcharge < 0 ||
      !Number.isFinite(numericTurnaround) ||
      numericTurnaround <= 0 ||
      !Number.isFinite(numericReminder) ||
      numericReminder < 0
    ) {
      setMessage("Enter valid express and reminder values.")
      return
    }
    mutation.mutate({
      autoNotifyReady: autoReady,
      autoNotifyReminder: autoReminder,
      defaultNotificationChannel: channel || undefined,
      expressEnabled,
      expressLabel,
      expressSurchargeType: surchargeType,
      expressSurchargeValue: Math.round(numericSurcharge * 100),
      expressTurnaroundMinutes: Math.round(numericTurnaround * 60),
      reminderLeadMinutes: Math.round(numericReminder * 60),
      storeId,
    })
  }

  const channelConfigured =
    channel === "sms"
      ? providerQuery.data?.sms.configured
      : channel === "whatsapp"
        ? providerQuery.data?.whatsapp.configured
        : true

  return (
    <FieldGroup className="gap-6">
      {message ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">{message}</p>
      ) : null}
      <section className="grid gap-4">
        <CheckboxField label={<>Offer express service</>}>
          <Checkbox
            checked={expressEnabled}
            onCheckedChange={(checked) => setExpressEnabled(checked)}
          />
        </CheckboxField>
        {expressEnabled ? (
          <>
            <ControlField label={<>Customer label</>}>
              <Input
                value={expressLabel}
                onChange={(event) => setExpressLabel(event.target.value)}
              />
            </ControlField>
            <div className="grid grid-cols-2 gap-3">
              <ControlField label={<>Surcharge type</>}>
                <SelectControl
                  value={surchargeType}
                  onValueChange={(value) =>
                    setSurchargeType(value as typeof surchargeType)
                  }
                  options={[
                    { value: "percentage", label: <>Percentage</> },
                    { value: "fixed", label: <>Fixed amount</> },
                  ]}
                />
              </ControlField>
              <UiField className="grid gap-1.5 text-sm">
                <FieldLabel htmlFor="service-express-surcharge">
                  {surchargeType === "percentage"
                    ? "Percentage"
                    : `Amount (${currencyCode})`}
                </FieldLabel>
                {surchargeType === "fixed" ? (
                  <MoneyInput
                    id="service-express-surcharge"
                    currencyCode={currencyCode}
                    value={surchargeValue}
                    onChange={(event) => setSurchargeValue(event.target.value)}
                  />
                ) : (
                  <Input
                    inputMode="decimal"
                    id="service-express-surcharge"
                    value={surchargeValue}
                    onChange={(event) => setSurchargeValue(event.target.value)}
                  />
                )}
              </UiField>
            </div>
            <ControlField label={<>Express turnaround (hours)</>}>
              <Input
                inputMode="decimal"
                value={turnaroundHours}
                onChange={(event) => setTurnaroundHours(event.target.value)}
              />
            </ControlField>
          </>
        ) : null}
      </section>
      <section className="grid gap-4 border-t border-border pt-5">
        <h3 className="font-medium">Customer notifications</h3>
        <ControlField label={<>Default channel</>}>
          <SelectControl
            value={channel}
            onValueChange={(value) => setChannel(value as typeof channel)}
            options={[
              { value: "", label: <>No automatic channel</> },
              { value: "sms", label: <>SMS</> },
              { value: "whatsapp", label: <>WhatsApp</> },
            ]}
          />
        </ControlField>
        {!channelConfigured ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            This provider is not configured. Add its webhook URL and, when
            required, its token before enabling automatic delivery.
          </p>
        ) : null}
        <CheckboxField label={<>Automatically notify when all work is ready</>}>
          <Checkbox
            checked={autoReady}
            onCheckedChange={(checked) => setAutoReady(checked)}
          />
        </CheckboxField>
        <CheckboxField
          label={<>Schedule a reminder before the promised pickup time</>}
        >
          <Checkbox
            checked={autoReminder}
            onCheckedChange={(checked) => setAutoReminder(checked)}
          />
        </CheckboxField>
        {autoReminder ? (
          <ControlField label={<>Reminder lead time (hours)</>}>
            <Input
              inputMode="decimal"
              value={reminderHours}
              onChange={(event) => setReminderHours(event.target.value)}
            />
          </ControlField>
        ) : null}
      </section>
      <FormActions>
        <SubmitButton
          type="button"
          isSubmitting={mutation.isPending}
          disabled={mutation.isPending || !channelConfigured}
          onClick={submit}
        >
          {mutation.isPending ? "Saving…" : "Save settings"}
        </SubmitButton>
      </FormActions>
    </FieldGroup>
  )
}
