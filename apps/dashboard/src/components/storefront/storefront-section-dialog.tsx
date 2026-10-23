"use client"

import type { StorefrontComposition } from "@ewatrade/storefront-contracts/manifest"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import {
  type SectionExcerpt,
  buildSectionLibrary,
  canvasManifest,
  isCanvasManifest,
  listSelectableTemplates,
} from "@ewatrade/storefront-templates"
import { CanvasSectionPreview } from "@ewatrade/storefront-templates/canvas"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
} from "@ewatrade/ui"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"

export function StorefrontThumbnail({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(260)
  useEffect(() => {
    const target = root.current
    if (!target) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])
  return (
    <div className="sf-section-thumbnail" ref={root} aria-hidden="true" inert>
      <div
        style={{
          width: 1040,
          transform: `scale(${width / 1040})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  )
}
const categories = [
  ["all", "All sections"],
  ["intro", "Introduction"],
  ["collection", "Collection"],
  ["services", "Services"],
  ["quotes", "Testimonials"],
  ["faq", "FAQ"],
  ["rotate", "Text rotation"],
  ["story", "Story"],
  ["contact", "Store details"],
]
const category = (entry: SectionExcerpt) =>
  entry.kind === "counter" ||
  (entry.kind === "collection" && ["desk", "concierge"].includes(entry.family))
    ? "services"
    : entry.kind === "floor"
      ? "collection"
      : entry.kind
const content = (entry: SectionExcerpt) =>
  entry.kind === "collection" || entry.kind === "floor"
    ? ["desk", "concierge"].includes(entry.family)
      ? "services"
      : "catalog"
    : entry.kind === "counter"
      ? "services"
      : entry.kind === "contact"
        ? "business"
        : "copy"

export function StorefrontSectionDialog({
  composition,
  snapshot,
  pageLabel,
  onClose,
  onInsert,
}: {
  composition: StorefrontComposition
  snapshot: StorefrontClientSnapshot
  pageLabel: string
  onClose: () => void
  onInsert: (entry: SectionExcerpt) => void
}) {
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("all")
  const [template, setTemplate] = useState("all")
  const [source, setSource] = useState("all")
  const [selected, setSelected] = useState<string | null>(null)
  const templates = useMemo(
    () =>
      listSelectableTemplates().filter((entry) =>
        isCanvasManifest(entry.manifest),
      ),
    [],
  )
  const catalog = useMemo(
    () => buildSectionLibrary(templates.map((entry) => entry.manifest)),
    [templates],
  )
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const filtered = catalog.filter(
    (entry) =>
      canvasManifest(composition.template.key).pages.some((page) =>
        page.allowedSections.includes(entry.definition.key),
      ) &&
      (template === "all" || entry.template.key === template) &&
      (source === "all" || content(entry) === source) &&
      words.every((word) =>
        `${entry.title} ${category(entry)}`.toLowerCase().includes(word),
      ),
  )
  const visible = filtered.filter(
    (entry) => kind === "all" || category(entry) === kind,
  )
  const picked = visible.find((entry) => entry.id === selected)
  const reset = () => {
    setQuery("")
    setKind("all")
    setTemplate("all")
    setSource("all")
    setSelected(null)
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="sf-section-dialog"
        aria-describedby="sf-section-description"
      >
        <div className="sf-picker-heading">
          <DialogTitle>Add section</DialogTitle>
          <DialogDescription id="sf-section-description">
            Inserts into {pageLabel}, before the Footer.
          </DialogDescription>
        </div>
        <div className="sf-section-browser">
          <nav aria-label="Section categories">
            {categories.map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={kind === key}
                onClick={() => setKind(key ?? "all")}
              >
                <span>{label}</span>
                <span>
                  {
                    filtered.filter(
                      (entry) => key === "all" || category(entry) === key,
                    ).length
                  }
                </span>
              </button>
            ))}
          </nav>
          <div className="sf-section-results">
            <div className="sf-section-filters">
              <Input
                type="search"
                aria-label="Search sections"
                placeholder="Search sections and templates"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <fieldset className="sf-filter-row" aria-label="Source template">
                {[
                  ["all", "All templates"],
                  ...templates.map(({ manifest }) => [
                    manifest.key,
                    manifest.name,
                  ]),
                ].map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    aria-pressed={template === key}
                    onClick={() => setTemplate(key ?? "all")}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
              <fieldset className="sf-filter-row" aria-label="Content source">
                {[
                  ["all", "Any content"],
                  ["catalog", "Catalog items"],
                  ["services", "Services"],
                  ["copy", "Your copy"],
                  ["business", "Business profile"],
                ].map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    aria-pressed={source === key}
                    onClick={() => setSource(key ?? "all")}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
              <div className="sf-results-count">
                <span aria-live="polite">
                  {visible.length}{" "}
                  {visible.length === 1 ? "section" : "sections"}
                </span>
                <button type="button" onClick={reset}>
                  Reset filters
                </button>
              </div>
            </div>
            <div className="sf-section-grid">
              {visible.length ? (
                visible.map((entry) => (
                  <article
                    className="sf-section-card"
                    key={entry.id}
                    data-selected={entry.id === selected}
                  >
                    <button
                      className="sf-section-card-select"
                      type="button"
                      aria-pressed={entry.id === selected}
                      aria-label={entry.title}
                      onClick={() => setSelected(entry.id)}
                    />
                    <StorefrontThumbnail>
                      <CanvasSectionPreview
                        section={{
                          id: `thumb-${entry.definition.key}`,
                          type: entry.definition.key,
                          version: entry.definition.version,
                          visible: true,
                          settings: Object.fromEntries(
                            entry.definition.fields.map((field) => [
                              field.key,
                              field.default,
                            ]),
                          ),
                          blocks: [],
                          source: entry.definition.source,
                        }}
                        snapshot={{ ...snapshot, composition }}
                      />
                    </StorefrontThumbnail>
                    <span className="sf-section-card-name">{entry.title}</span>
                    <span className="sf-section-card-detail">
                      {content(entry) === "copy"
                        ? "Your copy"
                        : content(entry) === "business"
                          ? "Business profile"
                          : "Live catalog data"}
                    </span>
                  </article>
                ))
              ) : (
                <div className="sf-section-empty">
                  <p>No sections match these filters.</p>
                  <Button variant="outline" onClick={reset}>
                    Clear search and filters
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="sf-picker-footer">
          <p>{picked?.title ?? "Header and Footer are fixed on every page."}</p>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!picked}
            onClick={() => {
              if (picked) onInsert(picked)
            }}
          >
            Add section
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
