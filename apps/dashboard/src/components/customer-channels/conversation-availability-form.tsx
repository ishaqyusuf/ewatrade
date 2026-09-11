"use client"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  type PayloadBoundOperation,
  resolvePayloadBoundOperation,
} from "@/lib/payload-bound-operation"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type StoreConversationServiceInterval,
  storeConversationTimezoneSchema,
  storeConversationWeeklyHoursSchema,
} from "@ewatrade/service-commerce"
import { Button, Input, Select } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef } from "react"
import { z } from "zod"

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

const availabilityFormSchema = z
  .object({
    reason: z.string().trim().min(3).max(240),
    timezone: storeConversationTimezoneSchema,
    weeklyHours: storeConversationWeeklyHoursSchema,
  })
  .strict()

type AvailabilityFormValues = z.infer<typeof availabilityFormSchema>
type AvailabilitySettings =
  RouterOutputs["serviceCommerce"]["storeConversationAvailabilitySettings"]

function minuteLabel(minute: number) {
  if (minute === 1_440) return "End of day"
  const hours = Math.floor(minute / 60)
  const minutes = minute % 60
  const period = hours >= 12 ? "pm" : "am"
  const displayHour = hours % 12 || 12
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`
}

function timeOptions(current: number, includeEndOfDay: boolean) {
  const last = includeEndOfDay ? 1_440 : 1_410
  return [
    ...new Set([
      current,
      ...Array.from({ length: last / 30 + 1 }, (_, index) => index * 30),
    ]),
  ]
    .filter((minute) => minute <= last)
    .sort((left, right) => left - right)
}

function defaultInterval(dayOfWeek: number) {
  return { dayOfWeek, endMinute: 17 * 60, startMinute: 9 * 60 }
}

export function ConversationAvailabilityForm({
  onMessage,
  registerReset,
  settings,
  storeId,
}: {
  onMessage: (message: string) => void
  registerReset: RegisterServiceCommerceFormReset
  settings: AvailabilitySettings
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const scheduleOperation = useRef<PayloadBoundOperation | null>(null)
  const pauseOperation = useRef<PayloadBoundOperation | null>(null)
  const form = useZodForm<AvailabilityFormValues>(availabilityFormSchema, {
    defaultValues: {
      reason: "Configure Chat availability",
      timezone: settings.timezone,
      weeklyHours: settings.weeklyHours,
    },
  })
  const settingsKey =
    trpc.serviceCommerce.storeConversationAvailabilitySettings.queryKey({
      storeId,
    })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ exact: true, queryKey: settingsKey }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: trpc.serviceCommerce.channelWorkspace.queryKey({ storeId }),
      }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: trpc.serviceCommerce.workspaceAccess.queryKey({ storeId }),
      }),
    ])
  }

  const updateSchedule = useMutation(
    trpc.serviceCommerce.updateStoreConversationAvailabilitySchedule.mutationOptions(
      {
        onError: async (error) => {
          onMessage(error.message)
          await invalidate()
        },
        onSuccess: async ({ replayed: _replayed, ...nextSettings }) => {
          queryClient.setQueryData(settingsKey, nextSettings)
          scheduleOperation.current = null
          await invalidate()
          onMessage("Chat service hours saved.")
        },
      },
    ),
  )
  const setManualPause = useMutation(
    trpc.serviceCommerce.setStoreConversationManualPause.mutationOptions({
      onError: async (error) => {
        onMessage(error.message)
        await invalidate()
      },
      onSuccess: async (
        { replayed: _replayed, ...nextSettings },
        variables,
      ) => {
        queryClient.setQueryData(settingsKey, nextSettings)
        pauseOperation.current = null
        await invalidate()
        onMessage(
          variables.paused
            ? "New customer Chat messages paused."
            : "New customer Chat messages resumed.",
        )
      },
    }),
  )
  const pending = updateSchedule.isPending || setManualPause.isPending

  useEffect(() => {
    const values = {
      reason: "Configure Chat availability",
      timezone: settings.timezone,
      weeklyHours: settings.weeklyHours,
    }
    form.reset(values)
    return registerReset(() => form.reset(values))
  }, [form, registerReset, settings])

  const weeklyHours = form.watch("weeklyHours") ?? []
  const hoursByDay = useMemo(
    () =>
      DAYS.map((_, dayOfWeek) =>
        weeklyHours
          .filter((interval) => interval.dayOfWeek === dayOfWeek)
          .sort((left, right) => left.startMinute - right.startMinute),
      ),
    [weeklyHours],
  )

  function setWeeklyHours(next: StoreConversationServiceInterval[]) {
    form.setValue("weeklyHours", next, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  function replaceInterval(
    current: StoreConversationServiceInterval,
    next: StoreConversationServiceInterval,
  ) {
    setWeeklyHours(
      weeklyHours.map((interval) => (interval === current ? next : interval)),
    )
  }

  const saveSchedule = form.handleSubmit((values) => {
    const input = {
      ...values,
      expectedRevision: settings.revision,
      storeId,
      unreadNotificationGraceSeconds:
        settings.unreadNotificationGraceSeconds,
    }
    scheduleOperation.current = resolvePayloadBoundOperation(
      scheduleOperation.current,
      JSON.stringify(input),
    )
    updateSchedule.mutate({
      ...input,
      clientOperationId: scheduleOperation.current.id,
    })
  })

  async function togglePause() {
    const valid = await form.trigger("reason")
    if (!valid) return
    const input = {
      customerWording: "temporarily_unavailable" as const,
      expectedRevision: settings.revision,
      paused: !settings.manualPaused,
      reason: form.getValues("reason").trim(),
      storeId,
    }
    pauseOperation.current = resolvePayloadBoundOperation(
      pauseOperation.current,
      JSON.stringify(input),
    )
    setManualPause.mutate({
      ...input,
      clientOperationId: pauseOperation.current.id,
    })
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-2 rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Current intake state
        </p>
        <h2 className="font-semibold">
          {settings.manualPaused
            ? "New customer messages are paused"
            : "Chat follows Store service hours"}
        </h2>
        <p className="text-sm text-muted-foreground">
          This setting controls new customer submissions. Existing conversation
          history stays readable, and authorized staff can continue replying.
        </p>
      </section>

      <form className="grid gap-5" onSubmit={saveSchedule}>
        <label className="grid gap-1.5 text-sm" htmlFor="chat-timezone">
          <span className="font-medium">Store timezone</span>
          <Input
            autoComplete="off"
            disabled={pending}
            id="chat-timezone"
            placeholder="Africa/Lagos"
            {...form.register("timezone")}
          />
          <span className="text-xs text-muted-foreground">
            Use an IANA timezone. Service-hour boundaries follow this timezone,
            including daylight-saving changes.
          </span>
          {form.formState.errors.timezone?.message ? (
            <span className="text-xs text-destructive" role="alert">
              {form.formState.errors.timezone.message}
            </span>
          ) : null}
        </label>

        <fieldset className="grid gap-3">
          <legend className="font-medium">Weekly service hours</legend>
          {DAYS.map((day, dayOfWeek) => {
            const intervals = hoursByDay[dayOfWeek] ?? []
            return (
              <div
                className="grid gap-3 rounded-xl border border-border p-4"
                key={day}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{day}</span>
                  <Button
                    disabled={pending || weeklyHours.length >= 28}
                    onClick={() =>
                      setWeeklyHours([
                        ...weeklyHours,
                        defaultInterval(dayOfWeek),
                      ])
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Add hours
                  </Button>
                </div>
                {intervals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Closed</p>
                ) : (
                  intervals.map((interval, index) => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-end gap-2"
                      key={`${day}-${interval.startMinute}-${interval.endMinute}-${index}`}
                    >
                      <label
                        className="grid min-w-0 gap-1 text-xs text-muted-foreground"
                        htmlFor={`chat-${dayOfWeek}-${index}-opens`}
                      >
                        Opens
                        <Select
                          className="min-w-0 px-2"
                          disabled={pending}
                          id={`chat-${dayOfWeek}-${index}-opens`}
                          onChange={(event) =>
                            replaceInterval(interval, {
                              ...interval,
                              startMinute: Number(event.target.value),
                            })
                          }
                          value={interval.startMinute}
                        >
                          {timeOptions(interval.startMinute, false).map(
                            (minute) => (
                              <option key={minute} value={minute}>
                                {minuteLabel(minute)}
                              </option>
                            ),
                          )}
                        </Select>
                      </label>
                      <span className="pb-3 text-xs text-muted-foreground">
                        to
                      </span>
                      <label
                        className="grid min-w-0 gap-1 text-xs text-muted-foreground"
                        htmlFor={`chat-${dayOfWeek}-${index}-closes`}
                      >
                        Closes
                        <Select
                          className="min-w-0 px-2"
                          disabled={pending}
                          id={`chat-${dayOfWeek}-${index}-closes`}
                          onChange={(event) =>
                            replaceInterval(interval, {
                              ...interval,
                              endMinute: Number(event.target.value),
                            })
                          }
                          value={interval.endMinute}
                        >
                          {timeOptions(interval.endMinute, true).map(
                            (minute) => (
                              <option key={minute} value={minute}>
                                {minuteLabel(minute)}
                              </option>
                            ),
                          )}
                        </Select>
                      </label>
                      <Button
                        aria-label={`Remove ${day} service interval ${index + 1}`}
                        disabled={pending}
                        onClick={() =>
                          setWeeklyHours(
                            weeklyHours.filter(
                              (candidate) => candidate !== interval,
                            ),
                          )
                        }
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        ×
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )
          })}
          {form.formState.errors.weeklyHours?.message ? (
            <p className="text-sm text-destructive" role="alert">
              {form.formState.errors.weeklyHours.message}
            </p>
          ) : null}
        </fieldset>

        <label className="grid gap-1.5 text-sm" htmlFor="chat-change-reason">
          <span className="font-medium">Internal change reason</span>
          <Input
            disabled={pending}
            id="chat-change-reason"
            maxLength={240}
            {...form.register("reason")}
          />
          {form.formState.errors.reason?.message ? (
            <span className="text-xs text-destructive" role="alert">
              {form.formState.errors.reason.message}
            </span>
          ) : null}
        </label>

        <Button className="w-fit" disabled={pending} type="submit">
          {updateSchedule.isPending ? "Saving…" : "Save service hours"}
        </Button>
      </form>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold">Manual pause</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pause only when the Store cannot accept new messages. Customers see
            that Chat is temporarily unavailable; scheduled outside-hours
            wording is used only when the Store is actually closed.
          </p>
        </div>
        <Button
          className="w-fit"
          disabled={pending}
          onClick={() => void togglePause()}
          type="button"
          variant={settings.manualPaused ? "outline" : "destructive"}
        >
          {setManualPause.isPending
            ? "Updating…"
            : settings.manualPaused
              ? "Resume new messages"
              : "Pause new messages"}
        </Button>
      </section>
    </div>
  )
}
