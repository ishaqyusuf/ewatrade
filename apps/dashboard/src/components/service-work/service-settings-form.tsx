"use client"

import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

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
    <div className="grid gap-6">
      {message ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">{message}</p>
      ) : null}
      <section className="grid gap-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={expressEnabled}
            onChange={(event) => setExpressEnabled(event.target.checked)}
          />
          Offer express service
        </label>
        {expressEnabled ? (
          <>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Customer label</span>
              <input
                className={fieldClass}
                value={expressLabel}
                onChange={(event) => setExpressLabel(event.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Surcharge type</span>
                <select
                  className={fieldClass}
                  value={surchargeType}
                  onChange={(event) =>
                    setSurchargeType(event.target.value as typeof surchargeType)
                  }
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">
                  {surchargeType === "percentage"
                    ? "Percentage"
                    : `Amount (${currencyCode})`}
                </span>
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  value={surchargeValue}
                  onChange={(event) => setSurchargeValue(event.target.value)}
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Express turnaround (hours)</span>
              <input
                className={fieldClass}
                inputMode="decimal"
                value={turnaroundHours}
                onChange={(event) => setTurnaroundHours(event.target.value)}
              />
            </label>
          </>
        ) : null}
      </section>
      <section className="grid gap-4 border-t border-border pt-5">
        <h3 className="font-medium">Customer notifications</h3>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Default channel</span>
          <select
            className={fieldClass}
            value={channel}
            onChange={(event) =>
              setChannel(event.target.value as typeof channel)
            }
          >
            <option value="">No automatic channel</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        {!channelConfigured ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            This provider is not configured. Add its webhook URL and, when
            required, its token before enabling automatic delivery.
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoReady}
            onChange={(event) => setAutoReady(event.target.checked)}
          />
          Automatically notify when all work is ready
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoReminder}
            onChange={(event) => setAutoReminder(event.target.checked)}
          />
          Schedule a reminder before the promised pickup time
        </label>
        {autoReminder ? (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Reminder lead time (hours)</span>
            <input
              className={fieldClass}
              inputMode="decimal"
              value={reminderHours}
              onChange={(event) => setReminderHours(event.target.value)}
            />
          </label>
        ) : null}
      </section>
      <Button
        disabled={mutation.isPending || !channelConfigured}
        onClick={submit}
      >
        {mutation.isPending ? "Saving…" : "Save settings"}
      </Button>
    </div>
  )
}
