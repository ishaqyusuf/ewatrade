"use client"

import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  Checkbox,
  CheckboxField,
  Field,
  FieldGroup,
  FieldLabel,
  Textarea,
} from "@ewatrade/ui"
import { useState } from "react"

type Action = Extract<GeneralAction, { action: "service_message_share" }>
type Channel = Action["channel"]

export const serviceMessageChannels: Array<{ value: Channel; label: string }> =
  [
    { value: "manual", label: "In person / other" },
    { value: "sms", label: "SMS from my phone" },
    { value: "whatsapp", label: "WhatsApp from my phone" },
  ]

/**
 * The drafted record with edited channel, message and note. The Job stays
 * exactly as drafted, and nothing is saved until the staff member states
 * again that they already shared it.
 */
export function editedServiceMessage(
  draft: Action,
  edits: {
    channel: Channel
    message: string
    reason: string
    alreadyShared: boolean
  },
) {
  if (!edits.alreadyShared)
    return {
      ok: false as const,
      error: "Record a message only after you have shared it yourself.",
    }
  const reason = edits.reason.trim()
  const parsed = generalActionSchema.safeParse({
    action: draft.action,
    jobId: draft.jobId,
    channel: edits.channel,
    message: edits.message,
    ...(reason ? { reason } : {}),
    alreadyShared: true,
  })
  return parsed.success
    ? { ok: true as const, payload: parsed.data }
    : {
        ok: false as const,
        error:
          parsed.error.issues[0]?.message ??
          "Enter the exact message you shared (up to 1000 characters).",
      }
}

/**
 * Edits a drafted manual-share record. The recipient is always the Job's
 * Order customer, shown in the review; it cannot be typed here. Nothing is
 * sent: the record says the staff member already shared this themselves.
 */
export function GeneralServiceMessageEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: Action
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const [channel, setChannel] = useState<Channel>(initial.channel)
  const [message, setMessage] = useState(initial.message)
  const [reason, setReason] = useState(initial.reason ?? "")
  const [alreadyShared, setAlreadyShared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (disabled) return
        const result = editedServiceMessage(initial, {
          channel,
          message,
          reason,
          alreadyShared,
        })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setError(null)
        onSave(result.payload)
      }}
    >
      <p className="text-sm text-muted-foreground">
        Record a message you already shared with this Job's customer. ewatrade
        sends nothing. The review shows the Order's customer contact, and the
        message will appear in the customer's tracking history.
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel>How you shared it</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {serviceMessageChannels.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={channel === option.value ? "default" : "outline"}
                aria-pressed={channel === option.value}
                disabled={disabled}
                onClick={() => setChannel(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="service-message-text">
            Exact message you shared
          </FieldLabel>
          <Textarea
            id="service-message-text"
            value={message}
            maxLength={1000}
            disabled={disabled}
            onChange={(event) => setMessage(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="service-message-reason">
            Note (optional)
          </FieldLabel>
          <Textarea
            id="service-message-reason"
            value={reason}
            maxLength={500}
            disabled={disabled}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <CheckboxField label="I already shared this message myself">
        <Checkbox
          checked={alreadyShared}
          onCheckedChange={(value) => setAlreadyShared(value === true)}
          disabled={disabled}
        />
      </CheckboxField>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={disabled}>
          Save draft
        </Button>
      </div>
    </form>
  )
}
