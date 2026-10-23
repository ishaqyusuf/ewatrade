"use client"

import {
  type SectionInstance,
  defaultSettings,
} from "@ewatrade/storefront-contracts/manifest"
import { canvasManifest } from "@ewatrade/storefront-templates"
import { phraseKeys } from "@ewatrade/storefront-templates/canvas"
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTitle,
} from "@ewatrade/ui"
import { useState } from "react"

export function StorefrontPhrasesPopover({
  section,
  anchor,
  onClose,
  onUpdate,
}: {
  section: SectionInstance
  anchor: HTMLElement
  onClose: () => void
  onUpdate: (settings: Record<string, string>) => void
}) {
  const [items, setItems] = useState(() =>
    phraseKeys
      .map((key) => String(section.settings[key] ?? ""))
      .filter(Boolean),
  )
  const [speed, setSpeed] = useState(
    String(section.settings["rotation-speed"] ?? "normal"),
  )
  const update = (next: string[], duration = speed) => {
    setItems(next)
    setSpeed(duration)
    onUpdate({
      ...Object.fromEntries(
        phraseKeys.map((key, index) => [key, next[index] ?? ""]),
      ),
      "rotation-speed": duration,
    })
  }
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          if (anchor.isConnected) anchor.focus()
        }
      }}
    >
      <PopoverContent
        anchor={anchor}
        appearance="dashboard"
        align="start"
        className="sf-phrases-popover"
      >
        <PopoverTitle>Rotating phrases</PopoverTitle>
        <p>Text changes appear in your draft immediately.</p>
        {items.map((text, index) => (
          <div className="sf-phrase-row" key={phraseKeys[index]}>
            <Input
              aria-label={`Phrase ${index + 1}`}
              maxLength={80}
              value={text}
              onChange={(event) =>
                update(
                  items.map((value, i) =>
                    i === index ? event.target.value : value,
                  ),
                )
              }
            />
            <button
              type="button"
              aria-label={`Move phrase ${index + 1} up`}
              disabled={index === 0}
              onClick={() => {
                const next = [...items]
                const previous = next[index - 1]
                const current = next[index]
                if (previous === undefined || current === undefined) return
                next[index - 1] = current
                next[index] = previous
                update(next)
              }}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move phrase ${index + 1} down`}
              disabled={index === items.length - 1}
              onClick={() => {
                const next = [...items]
                const following = next[index + 1]
                const current = next[index]
                if (following === undefined || current === undefined) return
                next[index + 1] = current
                next[index] = following
                update(next)
              }}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`Remove phrase ${index + 1}`}
              disabled={items.length <= 1}
              onClick={() => update(items.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </div>
        ))}
        <Button
          variant="outline"
          disabled={items.length >= 6}
          onClick={() => update([...items, "New phrase"])}
        >
          Add phrase
        </Button>
        <label>
          Show each phrase for
          <select
            value={speed}
            onChange={(event) => update(items, event.target.value)}
          >
            <option value="fast">1.5 seconds</option>
            <option value="normal">3 seconds</option>
            <option value="slow">5 seconds</option>
          </select>
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            const source = section.source
            if (!source) return
            const definition = canvasManifest(source.templateKey).sections.find(
              (entry) => entry.key === source.sectionKey,
            )
            if (!definition) return
            const defaults = defaultSettings(definition.fields)
            update(
              phraseKeys
                .map((key) => String(defaults[key] ?? ""))
                .filter(Boolean),
              String(defaults["rotation-speed"] ?? "normal"),
            )
          }}
        >
          Reset phrases
        </Button>
        <p>Playback pauses automatically when reduced motion is enabled.</p>
        <Button
          onClick={() => {
            onClose()
            if (anchor.isConnected) anchor.focus()
          }}
        >
          Done
        </Button>
      </PopoverContent>
    </Popover>
  )
}
