"use client"
import {
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"

import { FormSelectControl } from "@/components/forms/form-controls"

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
      className="border-t border-border pt-5"
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
      <FieldGroup className="min-w-0 grid gap-3">
        <div>
          <h3 className="font-medium">Customer submission</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Restriction pauses new text, media, voice, and actions without
            deleting the conversation or its Requests.
          </p>
        </div>
        <ControlField label={<>Action</>}>
          <FormSelectControl
            id="moderation-action"
            control={form.control}
            name={"action"}
            options={[
              { value: "restrict", label: <>Restrict new submissions</> },
              { value: "reinstate", label: <>Reinstate submissions</> },
            ]}
          />
        </ControlField>
        <ControlField
          label={<>Reason</>}
          error={form.formState.errors.reason?.message}
        >
          <FormSelectControl
            id="moderation-reason"
            control={form.control}
            name={"reason"}
            options={[
              ...(action === "restrict"
                ? [
                    { value: "operator_review", label: <>Operator review</> },
                    { value: "spam_or_abuse", label: <>Spam or abuse</> },
                    { value: "security_review", label: <>Security review</> },
                    { value: "policy_review", label: <>Policy review</> },
                  ]
                : [
                    { value: "review_complete", label: <>Review complete</> },
                    { value: "appeal_approved", label: <>Appeal approved</> },
                  ]),
            ]}
          />
        </ControlField>
        <ControlField label={<>Internal note (optional)</>}>
          <Input
            id="moderation-note"
            maxLength={240}
            placeholder="Visible only to authorized operators"
            {...form.register("operatorNote")}
          />
        </ControlField>
        <FormActions>
          <SubmitButton
            isSubmitting={mutation.isPending}
            disabled={mutation.isPending}
            type="submit"
            variant="outline"
          >
            {mutation.isPending
              ? "Applying…"
              : action === "restrict"
                ? "Restrict submissions"
                : "Reinstate submissions"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
