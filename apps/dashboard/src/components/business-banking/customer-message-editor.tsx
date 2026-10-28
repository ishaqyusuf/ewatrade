"use client"

import { Button, Input, Textarea, cn } from "@ewatrade/ui"
import { Copy01Icon, WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useId, useRef, useState } from "react"
import {
  oneTimeWhatsAppDraft,
  rebuildWhatsAppUrl,
  whatsAppPhoneLabel,
} from "./business-banking-model"

const WHATSAPP_BUTTON = "bg-emerald-600 text-white hover:bg-emerald-600/90"

/**
 * A prepared message the merchant edits and sends by hand. With a saved
 * phone, Open WhatsApp opens wa.me with the edited text. Without one,
 * WhatsApp asks for a number used for this draft only (never saved). Either
 * way they press Send in WhatsApp; Copy message always works. Nothing is
 * sent here.
 */
export function CustomerMessageEditor({
  initialText,
  whatsappUrl,
  recipient,
  noPhoneNote,
}: {
  initialText: string
  /** The server's wa.me link for the saved Order phone, or null. */
  whatsappUrl: string | null
  /** Customer name shown next to the phone. */
  recipient?: string | null
  /** Shown when there is no saved phone. */
  noPhoneNote?: string
}) {
  const id = useId()
  const [text, setText] = useState(initialText)
  const [status, setStatus] = useState<string | null>(null)
  const openUrl = rebuildWhatsAppUrl(whatsappUrl, text.trim())
  const phone = openUrl ? whatsAppPhoneLabel(whatsappUrl) : null
  const [entering, setEntering] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  return (
    <div className="grid gap-2">
      {!openUrl && noPhoneNote ? (
        <p className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm">
          {noPhoneNote}
        </p>
      ) : null}
      <div className="grid gap-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <HugeiconsIcon
            icon={WhatsappIcon}
            className="size-4 text-emerald-600"
            aria-hidden="true"
          />
          <span className="font-medium">
            {phone
              ? [recipient, phone].filter(Boolean).join(" · ")
              : "Message to the customer"}
          </span>
          <span className="text-xs text-muted-foreground">
            {phone
              ? "Opens WhatsApp. You press Send there."
              : "You press Send in WhatsApp."}
          </span>
        </div>
        <label htmlFor={id} className="sr-only">
          Message text
        </label>
        <Textarea
          id={id}
          rows={5}
          value={text}
          maxLength={1500}
          onChange={(event) => {
            setText(event.target.value)
            setStatus(null)
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {openUrl ? (
            <Button
              type="button"
              disabled={!text.trim()}
              className={WHATSAPP_BUTTON}
              onClick={() =>
                window.open(openUrl, "_blank", "noopener,noreferrer")
              }
            >
              <HugeiconsIcon icon={WhatsappIcon} data-icon="inline-start" />
              Open WhatsApp
            </Button>
          ) : (
            <Button
              ref={opener}
              type="button"
              className={WHATSAPP_BUTTON}
              aria-expanded={entering}
              aria-controls={`${id}-recipient`}
              onClick={() => setEntering(true)}
            >
              <HugeiconsIcon icon={WhatsappIcon} data-icon="inline-start" />
              WhatsApp
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!text.trim()}
            onClick={() =>
              void navigator.clipboard.writeText(text.trim()).then(
                () => setStatus("Message copied."),
                () => setStatus("Copy didn't work. Select the text instead."),
              )
            }
          >
            <HugeiconsIcon icon={Copy01Icon} data-icon="inline-start" />
            Copy message
          </Button>
          <output
            aria-live="polite"
            className={cn(
              "text-xs text-muted-foreground",
              !status && "sr-only",
            )}
          >
            {status ?? ""}
          </output>
        </div>
        {!openUrl && entering ? (
          <OneTimeRecipient
            id={`${id}-recipient`}
            text={text}
            onCancel={() => {
              setEntering(false)
              // The opener re-renders collapsed; return focus to it.
              requestAnimationFrame(() => opener.current?.focus())
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Number for this draft only. Leaving it (Cancel or closing) forgets it. */
function OneTimeRecipient({
  id,
  text,
  onCancel,
}: {
  id: string
  text: string
  onCancel: () => void
}) {
  const [number, setNumber] = useState("")
  const [checked, setChecked] = useState(false)
  const draft = oneTimeWhatsAppDraft(number, text)
  const error =
    draft.kind === "invalid" && checked
      ? "Enter a valid phone number. Use a Nigerian number or include a country code."
      : draft.kind === "too-long"
        ? "This message is too long for WhatsApp. Shorten it or copy it instead."
        : null
  return (
    <section
      id={id}
      aria-label="WhatsApp recipient"
      className="grid gap-2 border-t border-border pt-3"
    >
      <label htmlFor={`${id}-number`} className="text-sm font-medium">
        WhatsApp number
      </label>
      <Input
        id={`${id}-number`}
        autoFocus
        type="tel"
        inputMode="tel"
        autoComplete="off"
        maxLength={24}
        placeholder="0800 000 0142"
        value={number}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        onChange={(event) => setNumber(event.target.value)}
        onBlur={() => setChecked(true)}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {draft.kind === "ready" ? `Opens a draft to ${draft.display}. ` : ""}
        For this draft only. Your saved customer details stay the same.
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className={WHATSAPP_BUTTON}
          disabled={draft.kind !== "ready"}
          onClick={() => {
            if (draft.kind === "ready")
              window.open(draft.url, "_blank", "noopener,noreferrer")
          }}
        >
          <HugeiconsIcon icon={WhatsappIcon} data-icon="inline-start" />
          Open WhatsApp draft
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}
