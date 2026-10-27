"use client"

import { Button, Textarea, cn } from "@ewatrade/ui"
import { Copy01Icon, WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useId, useState } from "react"
import {
  rebuildWhatsAppUrl,
  whatsAppPhoneLabel,
} from "./business-banking-model"

/**
 * A prepared message the merchant edits and sends by hand. With a saved
 * phone, Open WhatsApp opens wa.me with the edited text (they press Send
 * there); without one, Copy message is the only action. Nothing is sent here.
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
              : "No number"}
          </span>
          <span className="text-xs text-muted-foreground">
            {phone
              ? "Opens WhatsApp. You press Send there."
              : "Copy it and send it your way."}
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
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
              onClick={() =>
                window.open(openUrl, "_blank", "noopener,noreferrer")
              }
            >
              <HugeiconsIcon icon={WhatsappIcon} data-icon="inline-start" />
              Open WhatsApp
            </Button>
          ) : null}
          <Button
            type="button"
            variant={openUrl ? "outline" : "default"}
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
      </div>
    </div>
  )
}
