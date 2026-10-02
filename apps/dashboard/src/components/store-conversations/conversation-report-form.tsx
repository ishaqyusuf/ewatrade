"use client"
import {
  ControlField,
  FieldGroup,
  FormActions,
  SelectControl,
  SubmitButton,
  Textarea,
} from "@ewatrade/ui"

import {
  type PayloadBoundOperation,
  resolvePayloadBoundOperation,
} from "@/lib/payload-bound-operation"
import { useTRPC } from "@/trpc/client"

import { useMutation } from "@tanstack/react-query"
import { useRef, useState } from "react"

const reasons = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "hateful_content", label: "Hateful content" },
  { value: "sexual_content", label: "Sexual content" },
  { value: "violence", label: "Violence" },
  { value: "other", label: "Other concern" },
] as const

type ReportReason = (typeof reasons)[number]["value"]

export function ConversationReportForm({
  conversationId,
  onMessage,
  storeId,
}: {
  conversationId: string
  onMessage: (message: string) => void
  storeId: string
}) {
  const trpc = useTRPC()
  const operation = useRef<PayloadBoundOperation | null>(null)
  const [reason, setReason] = useState<ReportReason>("spam")
  const [details, setDetails] = useState("")
  const report = useMutation(
    trpc.serviceCommerce.reportStoreConversation.mutationOptions({
      onError: (error) => onMessage(error.message),
      onSuccess: (result) => {
        operation.current = null
        setDetails("")
        onMessage(
          result?.reportId
            ? "Report submitted for safety review. You can also restrict new customer submissions here."
            : "The report result could not be confirmed. Try again or contact support.",
        )
      },
    }),
  )

  return (
    <form
      className="border-t border-border pt-5"
      onSubmit={(event) => {
        event.preventDefault()
        const input = {
          conversationId,
          details: details.trim() || undefined,
          reason,
          storeId,
        }
        operation.current = resolvePayloadBoundOperation(
          operation.current,
          JSON.stringify(input),
        )
        report.mutate({ ...input, clientOperationId: operation.current.id })
      }}
    >
      <FieldGroup className="min-w-0 grid gap-3">
        <div>
          <h3 className="font-medium">Report conversation</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a safety report for review. Reporting does not pause messages;
            use Restrict submissions below when immediate protection is needed.
          </p>
        </div>
        <ControlField label={<>Reason</>}>
          <SelectControl
            id="store-chat-report-reason"
            onValueChange={(value) => setReason(value as ReportReason)}
            value={reason}
            options={[
              ...(reasons.map((option) => ({
                value: option.value,
                label: option.label,
              })) ?? []),
            ]}
          />
        </ControlField>
        <ControlField label={<>Details (optional)</>}>
          <Textarea
            id="store-chat-report-details"
            maxLength={500}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Describe the concern without copying sensitive customer data"
            value={details}
          />
        </ControlField>
        <FormActions>
          <SubmitButton
            isSubmitting={report.isPending}
            disabled={report.isPending}
            type="submit"
            variant="outline"
          >
            {report.isPending ? "Submitting…" : "Submit safety report"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
