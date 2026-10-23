"use client"

import type { StorefrontComposition } from "@ewatrade/storefront-contracts/manifest"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import {
  canvasDefaults,
  isCanvasManifest,
  listSelectableTemplates,
} from "@ewatrade/storefront-templates"
import { StorefrontTemplate } from "@ewatrade/storefront-templates/render"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ewatrade/ui"
import { useState } from "react"
import { StorefrontThumbnail } from "./storefront-section-dialog"

export function StorefrontTemplateDialog({
  composition,
  snapshot,
  initialFit,
  onClose,
  onReplace,
}: {
  composition: StorefrontComposition
  snapshot: StorefrontClientSnapshot | null
  initialFit: string
  onClose: () => void
  onReplace: (pin: { key: string; version: string }) => void
}) {
  const [fit, setFit] = useState(initialFit)
  const [filter, setFilter] = useState("all")
  const [selected, setSelected] = useState<{
    key: string
    version: string
    name: string
  } | null>(null)
  const entries = listSelectableTemplates().filter((entry) =>
    isCanvasManifest(entry.manifest),
  )
  const rank = (types: string[]) =>
    fit === "mixed"
      ? types.length > 1
        ? 0
        : 1
      : types.includes(fit)
        ? types.length === 1
          ? 0
          : 1
        : 2
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sf-template-dialog">
        <div className="sf-picker-heading">
          <DialogTitle>
            {selected
              ? `Replace draft layout with ${selected.name}?`
              : "Choose a template"}
          </DialogTitle>
          <DialogDescription>
            {selected
              ? "This replaces layout and copy on all pages. Your brand settings are kept, and nothing is published."
              : "Choose a fit for your business. Your catalog and service facts stay the same."}
          </DialogDescription>
        </div>
        {selected ? (
          <div className="sf-template-confirm">
            <p>Undo restores your current layout before saving.</p>
            <div className="sf-studio-actions">
              <Button variant="outline" onClick={() => setSelected(null)}>
                Back to templates
              </Button>
              <Button variant="outline" onClick={onClose}>
                Keep editing
              </Button>
              <Button onClick={() => onReplace(selected)}>
                Replace draft layout
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="sf-section-filters">
              <span>Business fit</span>
              <fieldset className="sf-filter-row" aria-label="Business fit">
                {["retail", "services", "mixed"].map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={value === fit}
                    onClick={() => setFit(value)}
                  >
                    {value === "retail"
                      ? "Retail"
                      : value === "services"
                        ? "Services"
                        : "Mixed"}
                  </button>
                ))}
              </fieldset>
              <fieldset className="sf-filter-row" aria-label="Filter templates">
                {["all", "retail", "services"].map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={value === filter}
                    onClick={() => setFilter(value)}
                  >
                    {value === "all"
                      ? "All templates"
                      : value === "retail"
                        ? "Retail"
                        : "Services"}
                  </button>
                ))}
              </fieldset>
            </div>
            <div className="sf-template-grid">
              {entries
                .filter(
                  ({ manifest }) =>
                    filter === "all" || manifest.businessTypes.includes(filter),
                )
                .sort(
                  (a, b) =>
                    rank(a.manifest.businessTypes) -
                    rank(b.manifest.businessTypes),
                )
                .map(({ manifest }) => (
                  <article key={manifest.key}>
                    {snapshot ? (
                      <StorefrontThumbnail>
                        <StorefrontTemplate
                          snapshot={{
                            ...snapshot,
                            mode: "preview",
                            composition: {
                              ...canvasDefaults(manifest),
                              theme: composition.theme,
                            },
                          }}
                          domain={`${snapshot.resources.business.slug}.ewatrade.com`}
                          customerChatOrigin=""
                        />
                      </StorefrontThumbnail>
                    ) : null}
                    <div>
                      <h3>{manifest.name}</h3>
                      <span className="sf-fit-badge">
                        {
                          ["Best fit", "Good fit", "Partial fit"][
                            rank(manifest.businessTypes)
                          ]
                        }
                      </span>
                      <p>{manifest.description}</p>
                      <Button
                        variant="outline"
                        disabled={manifest.key === composition.template.key}
                        onClick={() => setSelected(manifest)}
                      >
                        {manifest.key === composition.template.key
                          ? "Current"
                          : "Use template"}
                      </Button>
                    </div>
                  </article>
                ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
