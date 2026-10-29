"use client"

import {
  Button,
  Checkbox,
  FieldLabel as Label,
  SelectControl,
  Textarea,
} from "@ewatrade/ui"
import { useId } from "react"
import { contentFieldHasEdits } from "./storefront-content-model"
import type { StorefrontContentController } from "./use-storefront-content"

export function StorefrontContentWrite({
  controller,
  pageLabel,
  templateName,
  onContext,
}: {
  controller: StorefrontContentController
  pageLabel: string
  templateName: string
  onContext: () => void
}) {
  const instructionsId = useId()
  const scopeOptions = [
    { value: "page", label: `Whole ${pageLabel} page` },
    ...controller.fields
      .filter(
        (field, index, all) =>
          all.findIndex((entry) => entry.sectionId === field.sectionId) ===
          index,
      )
      .map((field) => ({
        value: field.sectionId,
        label: `Section: ${field.sectionLabel}`,
      })),
  ]
  return (
    <div className="sf-content-stack">
      <div className="sf-content-between">
        <h3>What would you like to write?</h3>
        <span className="sf-content-badge">{templateName}</span>
      </div>
      {controller.rows.length ? (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => controller.setReviewing(true)}
        >
          Back to draft review
        </Button>
      ) : null}
      <div className="sf-content-field">
        <Label htmlFor={`${instructionsId}-scope`}>Content scope</Label>
        <SelectControl
          id={`${instructionsId}-scope`}
          aria-label="Content scope"
          value={controller.scope}
          onValueChange={controller.setScope}
          options={scopeOptions}
        />
      </div>
      {controller.fields.length ? (
        <div className="sf-content-areas">
          {controller.scopedFields.map((field) => {
            const edited = contentFieldHasEdits(field)
            const id = `${instructionsId}-${field.id}`
            return (
              <div
                className={`sf-content-area${edited ? " sf-content-area-edited" : ""}`}
                key={field.id}
              >
                <Checkbox
                  id={id}
                  checked={controller.isChosen(field)}
                  onCheckedChange={(checked) =>
                    controller.choose(field, checked === true)
                  }
                  aria-label={`Draft ${field.sectionLabel} ${field.label}`}
                />
                <div>
                  <Label htmlFor={id}>
                    {field.sectionLabel} / {field.label}
                  </Label>
                  <p>{field.purpose}</p>
                  <small>
                    {field.minWords}–{field.maxWords} words
                    {edited ? " · Existing edit, kept by default" : ""}
                  </small>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p>
          This page has no AI-editable text areas. Choose another page or edit
          its text directly.
        </p>
      )}
      <p className="sf-content-hint">
        Choose individual areas above. Existing edits start unchecked. Prices,
        stock, contact details, customer quotes and existing action labels stay
        with their source.
      </p>
      <div className="sf-content-field">
        <Label htmlFor={instructionsId}>
          Anything to guide the draft?{" "}
          <span className="sf-content-hint">Optional</span>
        </Label>
        <Textarea
          id={instructionsId}
          aria-label="Anything to guide the draft?"
          placeholder="e.g. Keep it warm and focus on handmade pieces."
          rows={3}
          maxLength={500}
          value={controller.instructions}
          onChange={(event) => controller.setInstructions(event.target.value)}
        />
      </div>
      <div className="sf-content-notice">
        <strong>Grounded in your business</strong>
        <p>
          {controller.context.data?.context.name ?? "Your business"}. Template
          guidance and business context are included for each selected area.
        </p>
      </div>
      <Button variant="outline" className="self-start" onClick={onContext}>
        Review business context
      </Button>
    </div>
  )
}
