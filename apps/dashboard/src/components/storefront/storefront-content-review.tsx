"use client"

import { storefrontContentFieldState } from "@ewatrade/storefront-contracts/content"
import { Button, Checkbox, FieldLabel as Label, Textarea } from "@ewatrade/ui"
import { useId } from "react"
import type { ContentReviewRow } from "./storefront-content-model"
import type { StorefrontContentController } from "./use-storefront-content"

export function StorefrontContentReviewRow({
  row,
  onChange,
}: {
  row: ContentReviewRow
  onChange: (
    patch: Partial<Pick<ContentReviewRow, "text" | "selected">>,
  ) => void
}) {
  const id = useId()
  const status = storefrontContentFieldState(row.field, row.text)
  return (
    <section className="sf-content-result">
      <div className="sf-content-result-head">
        <div className="sf-content-check">
          <Checkbox
            id={`${id}-use`}
            aria-label={`Use ${row.field.sectionLabel} ${row.field.label}`}
            checked={row.selected}
            onCheckedChange={(selected) =>
              onChange({ selected: selected === true })
            }
          />
          <Label htmlFor={`${id}-use`}>
            {row.field.sectionLabel} / {row.field.label}
          </Label>
        </div>
        <small>{row.edited ? "Edited by you" : "AI draft"}</small>
      </div>
      <div className="sf-content-current">
        <span>Current</span>
        <p>{row.field.current || "Empty"}</p>
      </div>
      <Label htmlFor={`${id}-text`} className="sf-content-proposed-label">
        Proposed
      </Label>
      <Textarea
        id={`${id}-text`}
        aria-label={`Proposed ${row.field.sectionLabel} ${row.field.label}`}
        aria-invalid={!status.valid}
        aria-describedby={`${id}-hint`}
        value={row.text}
        rows={row.field.maxLength > 150 ? 4 : 2}
        maxLength={4000}
        onChange={(event) => onChange({ text: event.target.value })}
      />
      <div className="sf-content-between sf-content-counts">
        <span
          className={
            !status.valid
              ? "sf-content-invalid"
              : status.outsideRange
                ? "sf-content-warning"
                : "sf-content-valid"
          }
        >
          {status.words} words · aim for {row.field.minWords}–
          {row.field.maxWords}
        </span>
        <span>
          {row.text.length}/{row.field.maxLength} characters
        </span>
      </div>
      <p className="sf-content-hint" id={`${id}-hint`}>
        {!status.valid
          ? `Enter plain text within ${row.field.maxLength} characters.`
          : status.outsideRange
            ? "Outside the suggested range. You can still use this wording."
            : "Within the suggested range."}
      </p>
    </section>
  )
}
export function StorefrontContentReview({
  controller,
}: { controller: StorefrontContentController }) {
  const keepId = useId()
  const refinementId = useId()
  return (
    <div className="sf-content-stack">
      <div className="sf-content-between">
        <h3>Make it sound like your business</h3>
        <span className="sf-content-badge">Draft ready</span>
      </div>
      <p className="sf-content-hint">
        Compare each area, edit the wording and choose what to use. Nothing
        changes until you apply it.
      </p>
      {controller.lastInstructions ? (
        <div className="sf-content-notice">
          <strong>Your instructions</strong>
          <p>{controller.lastInstructions}</p>
        </div>
      ) : null}
      {controller.rows.map((row) => (
        <StorefrontContentReviewRow
          key={row.field.id}
          row={row}
          onChange={(patch) => controller.updateRow(row.field.id, patch)}
        />
      ))}
      <section className="sf-content-refinement">
        <h3>Tell AI what to change</h3>
        <div className="sf-content-chips">
          {["Make it shorter", "Use a warmer tone", "Focus on handmade"].map(
            (text) => (
              <Button
                key={text}
                size="sm"
                variant="outline"
                onClick={() => controller.setRefinement(text)}
              >
                {text}
              </Button>
            ),
          )}
        </div>
        <Label htmlFor={refinementId} className="sr-only">
          Refinement instructions
        </Label>
        <Textarea
          id={refinementId}
          aria-label="Refinement instructions"
          placeholder="e.g. Make the introduction shorter, but keep Ibadan."
          rows={3}
          maxLength={500}
          value={controller.refinement}
          onChange={(event) => controller.setRefinement(event.target.value)}
        />
        <div className="sf-content-between">
          <div className="sf-content-check">
            <Checkbox
              id={keepId}
              checked={controller.keepEdits}
              onCheckedChange={(value) =>
                controller.setKeepEdits(value === true)
              }
            />
            <Label htmlFor={keepId}>Keep my edits</Label>
          </div>
          <Button
            variant="outline"
            disabled={
              controller.pending ||
              controller.unavailable ||
              controller.stale ||
              controller.currentRun?.needsReconciliation ||
              !controller.refinement.trim()
            }
            onClick={() => void controller.generate(true)}
          >
            Refine selected areas
          </Button>
        </div>
        <p className="sf-content-hint">
          Only checked areas are refined. Text you edited stays as written while
          Keep my edits is on.
        </p>
      </section>
    </div>
  )
}
