"use client"

import {
  type CustomerMessageEventKey,
  getCustomerMessageEvent,
} from "@ewatrade/customer-messages/client"
import { Button, Textarea, cn } from "@ewatrade/ui"
import { useRef } from "react"
import { MessageBubble } from "./message-bubble"
import {
  MESSAGE_MAX_CHARACTERS,
  insertVariable,
  messageLength,
  messageVariableLabel,
  tryRenderMessage,
} from "./message-variables"

/**
 * Wording with `{variable}` chips and a live example. `variables` are the
 * current Order's resolved values, or clearly labelled sample values.
 */
export function MessageComposer({
  id,
  eventKey,
  value,
  onChange,
  variables,
  exampleLabel,
  disabled = false,
  label = "Message",
}: {
  id: string
  eventKey: CustomerMessageEventKey
  value: string
  onChange: (value: string) => void
  variables: Record<string, string | undefined>
  exampleLabel: string
  disabled?: boolean
  label?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const event = getCustomerMessageEvent(eventKey)
  const length = messageLength(value)
  const over = length > MESSAGE_MAX_CHARACTERS
  const rendered = value.trim()
    ? tryRenderMessage(eventKey, value, variables)
    : null
  const problem = over
    ? `Keep it under ${MESSAGE_MAX_CHARACTERS} characters.`
    : rendered?.problem
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
          <span
            className={cn(
              "text-xs tabular-nums text-muted-foreground",
              over && "text-destructive",
            )}
          >
            {length}/{MESSAGE_MAX_CHARACTERS}
          </span>
        </div>
        <Textarea
          ref={ref}
          id={id}
          value={value}
          disabled={disabled}
          rows={6}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          className="min-h-36 resize-y"
          onChange={(change) => onChange(change.target.value)}
        />
        {problem ? (
          <p id={`${id}-problem`} className="text-xs text-destructive">
            {problem}
          </p>
        ) : null}
      </div>
      <fieldset className="grid gap-2" disabled={disabled}>
        <legend className="mb-2 text-xs text-muted-foreground">
          Add details. They fill in for each customer.
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {event.variables.map((name) => (
            <Button
              key={name}
              type="button"
              variant="outline"
              size="xs"
              aria-label={`Insert ${messageVariableLabel(name)}`}
              onClick={() => {
                const field = ref.current
                const next = insertVariable(
                  value,
                  name,
                  field
                    ? { start: field.selectionStart, end: field.selectionEnd }
                    : null,
                )
                onChange(next.value)
                requestAnimationFrame(() => {
                  field?.focus()
                  field?.setSelectionRange(next.caret, next.caret)
                })
              }}
            >
              + {messageVariableLabel(name)}
            </Button>
          ))}
        </div>
      </fieldset>
      {rendered?.text ? (
        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">{exampleLabel}</p>
          <MessageBubble text={rendered.text} />
        </div>
      ) : null}
    </div>
  )
}
