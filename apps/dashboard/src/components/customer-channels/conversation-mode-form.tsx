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
  serviceCommerceChangeReasonSchema,
  storeConversationDesiredModeSchema,
} from "@ewatrade/service-commerce"
import { Button, Input } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { z } from "zod"

const conversationModeFormSchema = z
  .object({
    desiredMode: storeConversationDesiredModeSchema,
    reason: serviceCommerceChangeReasonSchema,
  })
  .strict()

type ConversationModeFormValues = z.infer<typeof conversationModeFormSchema>
type ConversationModeSettings =
  RouterOutputs["serviceCommerce"]["storeConversationChannelModeSettings"]

const OPTIONS = [
  {
    description:
      "Keep the customer inside EwaTrade Chat. No WhatsApp action is shown.",
    label: "EwaTrade Chat",
    value: "ewatrade_chat" as const,
  },
  {
    description:
      "Keep history readable, disable the composer, and send customers to the Store's verified WhatsApp route.",
    label: "WhatsApp",
    value: "whatsapp" as const,
  },
  {
    description:
      "Keep EwaTrade Chat primary and offer WhatsApp as a faster secondary route when it is currently eligible.",
    label: "Both",
    value: "both" as const,
  },
] as const

const BLOCKER_LABELS = {
  chat_not_configured: "EwaTrade Chat is not fully configured.",
  chat_unavailable: "EwaTrade Chat is outside its current availability window.",
  whatsapp_not_configured: "WhatsApp is not enabled for this Store profile.",
  whatsapp_policy_unavailable:
    "Current policy does not permit this Store to use WhatsApp for the configured verticals.",
  whatsapp_provider_unavailable:
    "The exact WhatsApp connection has not passed every readiness check.",
  whatsapp_routing_unavailable:
    "WhatsApp routing is missing or resolves to more than one active sender.",
  whatsapp_unavailable:
    "No currently eligible Store attendant is available for WhatsApp requests.",
} as const

function modeLabel(value: ConversationModeSettings["effectiveMode"]) {
  if (value === "ewatrade_chat") return "EwaTrade Chat"
  if (value === "whatsapp") return "WhatsApp"
  if (value === "both") return "Both"
  return "Unavailable"
}

export function ConversationModeForm({
  onMessage,
  registerReset,
  settings,
  storeId,
}: {
  onMessage: (message: string) => void
  registerReset: RegisterServiceCommerceFormReset
  settings: ConversationModeSettings
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const operation = useRef<PayloadBoundOperation | null>(null)
  const form = useZodForm<ConversationModeFormValues>(
    conversationModeFormSchema,
    {
      defaultValues: {
        desiredMode: settings.desiredMode,
        reason: "Configure the Store customer conversation mode",
      },
      mode: "onChange",
    },
  )
  const settingsKey =
    trpc.serviceCommerce.storeConversationChannelModeSettings.queryKey({
      storeId,
    })
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ exact: true, queryKey: settingsKey }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey: trpc.serviceCommerce.channelWorkspace.queryKey({ storeId }),
      }),
    ])
  }
  const updateMode = useMutation(
    trpc.serviceCommerce.updateStoreConversationChannelMode.mutationOptions({
      onError: async (error) => {
        onMessage(error.message)
        await invalidate()
      },
      onSuccess: async () => {
        operation.current = null
        await invalidate()
        onMessage("Customer conversation mode saved.")
      },
    }),
  )

  useEffect(() => {
    const values = {
      desiredMode: settings.desiredMode,
      reason: "Configure the Store customer conversation mode",
    }
    form.reset(values)
    return registerReset(() => form.reset(values))
  }, [form, registerReset, settings.desiredMode])

  const submit = form.handleSubmit((values) => {
    const input = {
      ...values,
      expectedRevision: settings.revision,
      storeId,
    }
    operation.current = resolvePayloadBoundOperation(
      operation.current,
      JSON.stringify(input),
    )
    updateMode.mutate({
      ...input,
      clientOperationId: operation.current.id,
    })
  })
  const blockers = [
    ...new Set([...settings.chat.blockers, ...settings.whatsapp.blockers]),
  ]

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <section className="grid gap-2 rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Current customer experience
        </p>
        <h2 className="font-semibold">
          Effective mode: {modeLabel(settings.effectiveMode)}
        </h2>
        <p className="text-sm text-muted-foreground">
          The desired mode is a business preference. EwaTrade rechecks Store
          availability, policy, routing and provider readiness before exposing
          either channel to a customer.
        </p>
        {blockers.length > 0 ? (
          <ul className="grid gap-1 text-sm text-amber-700 dark:text-amber-300">
            {blockers.map((blocker) => (
              <li key={blocker}>{BLOCKER_LABELS[blocker]}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <fieldset className="grid gap-3">
        <legend className="font-medium">Desired customer channel mode</legend>
        {OPTIONS.map((option) => (
          <label
            className="flex items-start gap-3 rounded-xl border border-border p-4"
            key={option.value}
          >
            <input
              className="mt-1 size-4"
              disabled={updateMode.isPending}
              type="radio"
              value={option.value}
              {...form.register("desiredMode")}
            />
            <span>
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-sm text-muted-foreground">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <label
        className="grid gap-1.5 text-sm"
        htmlFor="conversation-mode-reason"
      >
        <span className="font-medium">Internal change reason</span>
        <Input
          disabled={updateMode.isPending}
          id="conversation-mode-reason"
          maxLength={240}
          {...form.register("reason")}
        />
        {form.formState.errors.reason?.message ? (
          <span className="text-xs text-destructive" role="alert">
            {form.formState.errors.reason.message}
          </span>
        ) : null}
      </label>

      <Button
        className="w-fit"
        disabled={updateMode.isPending || !form.formState.isValid}
        type="submit"
      >
        {updateMode.isPending ? "Saving…" : "Save conversation mode"}
      </Button>
    </form>
  )
}
