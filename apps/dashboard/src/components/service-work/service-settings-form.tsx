"use client"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  FieldGroup,
  FieldLabel,
  FormActions,
  Input,
  MoneyInput,
  SubmitButton,
  Field as UiField,
  toast,
} from "@ewatrade/ui"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  ChoiceButtons,
  SheetSection,
} from "@/components/service-work/choice-buttons"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
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
  const [errors, setErrors] = useState<{
    amount?: string
    channel?: string
    hours?: string
    label?: string
    reminder?: string
  }>({})
  const { setParams } = useServiceWorkParams()

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
        await queryClient.invalidateQueries({
          queryKey: trpc.services.getSettings.queryKey({ storeId }),
        })
        toast("Service settings saved.")
        void setParams(null)
      },
    }),
  )

  if (settingsQuery.isLoading) {
    return <div className="h-56 animate-pulse bg-muted" />
  }

  const channelConfigured =
    channel === "sms"
      ? providerQuery.data?.sms.configured
      : channel === "whatsapp"
        ? providerQuery.data?.whatsapp.configured
        : true
  const channelName = channel === "sms" ? "SMS" : "WhatsApp"

  function submit() {
    setMessage(null)
    const numericSurcharge = Number(surchargeValue)
    const numericTurnaround = Number(turnaroundHours)
    const numericReminder = Number(reminderHours)
    const next: typeof errors = {}
    if (expressEnabled) {
      if (!expressLabel.trim()) next.label = "Give express a name."
      if (!Number.isFinite(numericTurnaround) || numericTurnaround <= 0)
        next.hours = "Enter hours, like 24."
      if (!Number.isFinite(numericSurcharge) || numericSurcharge < 0)
        next.amount =
          surchargeType === "fixed"
            ? "Enter the extra charge, like 2000."
            : "Enter a percent, like 20."
    }
    if (
      autoReminder &&
      (!Number.isFinite(numericReminder) || numericReminder <= 0)
    )
      next.reminder = "Enter hours, like 24."
    if (!channelConfigured)
      next.channel = `${channelName} isn’t set up yet. Pick another way, or set it up first.`
    setErrors(next)
    if (Object.keys(next).length) return
    mutation.mutate({
      autoNotifyReady: autoReady,
      autoNotifyReminder: autoReminder,
      defaultNotificationChannel: channel || undefined,
      expressEnabled,
      expressLabel: expressLabel.trim() || "Express",
      expressSurchargeType: surchargeType,
      expressSurchargeValue: Math.round(numericSurcharge * 100),
      expressTurnaroundMinutes: Math.round(numericTurnaround * 60),
      reminderLeadMinutes: Math.round(numericReminder * 60),
      storeId,
    })
  }

  return (
    <FieldGroup className="gap-5">
      {message ? (
        <FormFeedback appearance="dashboard">{message}</FormFeedback>
      ) : null}
      <SheetSection title="Express service">
        <CheckboxField
          label={
            <span>
              <span className="block font-medium">Offer express service</span>
              <span className="text-muted-foreground">
                Customers pay more to get it sooner
              </span>
            </span>
          }
        >
          <Checkbox
            checked={expressEnabled}
            onCheckedChange={(checked) => setExpressEnabled(checked)}
          />
        </CheckboxField>
        {expressEnabled ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <ControlField label="Name customers see" error={errors.label}>
                <Input
                  value={expressLabel}
                  placeholder="Express"
                  onChange={(event) => setExpressLabel(event.target.value)}
                />
              </ControlField>
              <ControlField label="Ready within (hours)" error={errors.hours}>
                <Input
                  inputMode="decimal"
                  value={turnaroundHours}
                  onChange={(event) => setTurnaroundHours(event.target.value)}
                />
              </ControlField>
            </div>
            <ControlField label="Extra charge">
              <ChoiceButtons
                label="Extra charge"
                value={surchargeType}
                onChange={setSurchargeType}
                options={[
                  { value: "fixed", label: "Fixed amount" },
                  { value: "percentage", label: "Percent of the price" },
                ]}
              />
            </ControlField>
            <UiField className="grid gap-1.5 text-sm">
              <FieldLabel htmlFor="service-express-surcharge">
                {surchargeType === "percentage" ? "Percent" : "Amount"}
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
              {errors.amount ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.amount}
                </p>
              ) : null}
            </UiField>
          </>
        ) : null}
      </SheetSection>
      <SheetSection title="Messages to customers">
        <ControlField label="Send messages by" error={errors.channel}>
          <ChoiceButtons
            label="Send messages by"
            value={channel || "none"}
            onChange={(value) => setChannel(value === "none" ? "" : value)}
            options={[
              { value: "whatsapp", label: "WhatsApp" },
              { value: "sms", label: "SMS" },
              { value: "none", label: "Don’t send" },
            ]}
          />
        </ControlField>
        {!channelConfigured && !errors.channel ? (
          <p className="bg-warning px-3 py-2 text-sm text-warning-foreground">
            {channelName} isn’t set up yet, so messages can’t go out. Pick
            another way, or set it up first.
          </p>
        ) : null}
        {channel ? (
          <>
            <CheckboxField label="Tell the customer when the work is ready">
              <Checkbox
                checked={autoReady}
                onCheckedChange={(checked) => setAutoReady(checked)}
              />
            </CheckboxField>
            <CheckboxField label="Remind the customer before the due time">
              <Checkbox
                checked={autoReminder}
                onCheckedChange={(checked) => setAutoReminder(checked)}
              />
            </CheckboxField>
            {autoReminder ? (
              <ControlField
                label="How long before (hours)"
                error={errors.reminder}
              >
                <Input
                  inputMode="decimal"
                  value={reminderHours}
                  onChange={(event) => setReminderHours(event.target.value)}
                />
              </ControlField>
            ) : null}
          </>
        ) : null}
      </SheetSection>
      <FormActions className="border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => void setParams(null)}
        >
          Cancel
        </Button>
        <SubmitButton
          type="button"
          isSubmitting={mutation.isPending}
          disabled={mutation.isPending}
          onClick={submit}
        >
          {mutation.isPending ? "Saving…" : "Save settings"}
        </SubmitButton>
      </FormActions>
    </FieldGroup>
  )
}
