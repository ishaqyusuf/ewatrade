"use client"

import { useZodForm } from "@/hooks/use-zod-form"
import {
  type PayloadBoundOperation,
  resolvePayloadBoundOperation,
} from "@/lib/payload-bound-operation"
import { useTRPC } from "@/trpc/client"
import {
  type StoreConversationModerationFormValues,
  storeConversationModerationFormSchema,
} from "@ewatrade/service-commerce"
import { Button, Input, Select } from "@ewatrade/ui"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef } from "react"

function defaults(
  state: "open" | "restricted",
): StoreConversationModerationFormValues {
  return state === "restricted"
    ? { action: "reinstate", operatorNote: "", reason: "review_complete" }
    : { action: "restrict", operatorNote: "", reason: "operator_review" }
}

export function ConversationModerationForm({
  conversationId,
  moderation,
  onChanged,
  onMessage,
  storeId,
}: {
  conversationId: string
  moderation: {
    revision: number
    state: "open" | "restricted"
  }
  onChanged: () => Promise<void>
  onMessage: (message: string) => void
  storeId: string
}) {
  const trpc = useTRPC()
  const operation = useRef<PayloadBoundOperation | null>(null)
  const form = useZodForm<StoreConversationModerationFormValues>(
    storeConversationModerationFormSchema,
    {
      defaultValues: defaults(moderation.state),
    },
  )
  const mutation = useMutation(
    trpc.serviceCommerce.moderateStoreConversation.mutationOptions({
      onError: async (error) => {
        onMessage(error.message)
        await onChanged()
      },
      onSuccess: async (result) => {
        operation.current = null
        if (!result?.state) {
          await onChanged()
          onMessage("The moderation result could not be confirmed.")
          return
        }
        form.reset(defaults(result.state))
        await onChanged()
        onMessage(
          result.state === "restricted"
            ? "New customer submissions are restricted. Existing history remains available."
            : "Customer submissions are reinstated.",
        )
      },
    }),
  )

  useEffect(() => {
    operation.current = null
    form.reset(defaults(moderation.state))
  }, [form, moderation.state])

  const action = form.watch("action") ?? defaults(moderation.state).action
  useEffect(() => {
    const currentReason = form.getValues("reason")
    const allowed =
      action === "restrict"
        ? [
            "spam_or_abuse",
            "security_review",
            "policy_review",
            "operator_review",
          ]
        : ["appeal_approved", "review_complete"]
    if (!allowed.includes(currentReason)) {
      form.setValue(
        "reason",
        action === "restrict" ? "operator_review" : "review_complete",
        { shouldValidate: true },
      )
    }
  }, [action, form])

  return (
    <form
      className="grid gap-3 border-t border-border pt-5"
      onSubmit={form.handleSubmit((values) => {
        const operatorNote = values.operatorNote?.trim()
        const input = {
          action: values.action,
          conversationId,
          expectedRevision: moderation.revision,
          ...(operatorNote ? { operatorNote } : {}),
          reason: values.reason,
          storeId,
        }
        operation.current = resolvePayloadBoundOperation(
          operation.current,
          JSON.stringify(input),
        )
        mutation.mutate({
          ...input,
          clientOperationId: operation.current.id,
        })
      })}
    >
      <div>
        <h3 className="font-medium">Customer submission</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Restriction pauses new text, media, voice, and actions without
          deleting the conversation or its Requests.
        </p>
      </div>
      <label
        className="grid gap-1 text-sm font-medium"
        htmlFor="moderation-action"
      >
        Action
        <Select id="moderation-action" {...form.register("action")}>
          <option value="restrict">Restrict new submissions</option>
          <option value="reinstate">Reinstate submissions</option>
        </Select>
      </label>
      <label
        className="grid gap-1 text-sm font-medium"
        htmlFor="moderation-reason"
      >
        Reason
        <Select id="moderation-reason" {...form.register("reason")}>
          {action === "restrict" ? (
            <>
              <option value="operator_review">Operator review</option>
              <option value="spam_or_abuse">Spam or abuse</option>
              <option value="security_review">Security review</option>
              <option value="policy_review">Policy review</option>
            </>
          ) : (
            <>
              <option value="review_complete">Review complete</option>
              <option value="appeal_approved">Appeal approved</option>
            </>
          )}
        </Select>
        {form.formState.errors.reason ? (
          <span className="text-xs text-destructive">
            {form.formState.errors.reason.message}
          </span>
        ) : null}
      </label>
      <label
        className="grid gap-1 text-sm font-medium"
        htmlFor="moderation-note"
      >
        Internal note (optional)
        <Input
          id="moderation-note"
          maxLength={240}
          placeholder="Visible only to authorized operators"
          {...form.register("operatorNote")}
        />
      </label>
      <Button disabled={mutation.isPending} type="submit" variant="outline">
        {mutation.isPending
          ? "Applying…"
          : action === "restrict"
            ? "Restrict submissions"
            : "Reinstate submissions"}
      </Button>
    </form>
  )
}
