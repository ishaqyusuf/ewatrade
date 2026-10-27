"use client"

import { StorefrontAttribution } from "@ewatrade/storefront-runtime/primitives"

import { storefrontDesignAsset } from "@ewatrade/storefront-runtime/design-assets"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"
import type { SectionInstance } from "../../../storefront-contracts/src/manifest"
import { CommerceStudioSectionPreview } from "../commerce-studio/render"
import {
  MarketHallCounter,
  MarketHallDetail,
  MarketHallFloor,
  marketHallSplit,
} from "../market-hall/render"
import {
  ServiceConciergeCollection,
  ServiceConciergeFaq,
  ServiceConciergeHeader,
  ServiceConciergeStory,
} from "../service-concierge/render"
import {
  CommerceCollection,
  TemplateActions,
  TemplateHost,
} from "../shared/commerce"
import {
  portableFamily,
  portableSection,
  portableSectionKind,
  portableTemplateName,
} from "./catalog"

export type CanvasEditing = {
  selectedId?: string
  onSelect: (id: string) => void
  onFieldChange: (id: string, key: string, value: string) => boolean
  onPhrases: (id: string, anchor: HTMLElement) => void
}
type Props = {
  snapshot: StorefrontClientSnapshot
  domain: string
  after?: string
  customerChatOrigin: string
  pageKey?: string
  editing?: CanvasEditing
  onPageChange?: (key: string) => void
}

function Copy({
  section,
  field,
  fallback = "",
  editing,
  multiline = false,
}: {
  section: SectionInstance
  field: string
  fallback?: string
  editing?: CanvasEditing
  multiline?: boolean
}) {
  const definition = portableSection(section.type)?.fields.find(
    (entry) => entry.key === field,
  )
  const value = String(section.settings[field] || fallback)
  const original = useRef(value)
  const cancel = useRef(false)
  if (!editing) return <>{value}</>
  return (
    <span
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      // biome-ignore lint/a11y/useSemanticElements: In-place preview copy must preserve the rendered template typography.
      role="textbox"
      aria-label={definition?.label ?? field}
      aria-multiline={multiline}
      tabIndex={0}
      className="cv-editable"
      onClick={(event) => event.stopPropagation()}
      onFocus={() => {
        original.current = value
        cancel.current = false
        editing.onSelect(section.id)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          cancel.current = true
          event.currentTarget.textContent = original.current
          event.currentTarget.blur()
        }
        if (
          event.key === "Enter" &&
          (!multiline || event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onBlur={(event) => {
        const next = event.currentTarget.textContent ?? ""
        if (
          !cancel.current &&
          next !== original.current &&
          editing.onFieldChange(section.id, field, next) === false
        )
          event.currentTarget.textContent = original.current
      }}
    >
      {value}
    </span>
  )
}

export const phraseKeys = [
  "phrase-one",
  "phrase-two",
  "phrase-three",
  "phrase-four",
  "phrase-five",
  "phrase-six",
] as const
function Rotation({
  section,
  editing,
  thumbnail,
}: { section: SectionInstance; editing?: CanvasEditing; thumbnail?: boolean }) {
  const phrases = phraseKeys
    .map((key) => String(section.settings[key] ?? ""))
    .filter(Boolean)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const duration =
    section.settings["rotation-speed"] === "fast"
      ? 1500
      : section.settings["rotation-speed"] === "slow"
        ? 5000
        : 3000
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(media.matches)
    const update = () => setReduced(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  useEffect(() => {
    if (thumbnail || paused || reduced || phrases.length < 2) return
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % phrases.length),
      duration,
    )
    return () => clearInterval(timer)
  }, [duration, paused, reduced, thumbnail, phrases.length])
  return (
    <>
      <h1>
        <Copy section={section} field="prefix" editing={editing} />{" "}
        <button
          type="button"
          className="cv-rotation"
          aria-label={
            editing ? `Edit rotating phrases: ${phrases.join(", ")}` : undefined
          }
          onClick={(event) =>
            editing
              ? editing.onPhrases(section.id, event.currentTarget)
              : setPaused(!paused)
          }
          title={
            editing ? "Edit rotating phrases" : "Pause or play rotating text"
          }
        >
          {phrases[index % Math.max(phrases.length, 1)] ?? "Your phrase"}
        </button>
      </h1>
      {!thumbnail ? (
        <button
          className="cv-pause"
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? "Play" : "Pause"}
        </button>
      ) : null}
    </>
  )
}

/** Shared section render: library previews, editor and published pages use the same markup. */
export function CanvasSection({
  section,
  snapshot,
  domain,
  customerChatOrigin = "",
  after,
  editing,
  thumbnail = false,
  syncUrl = false,
}: {
  section: SectionInstance
  snapshot: StorefrontClientSnapshot
  domain: string
  customerChatOrigin?: string
  after?: string
  editing?: CanvasEditing
  thumbnail?: boolean
  syncUrl?: boolean
}) {
  const kind = portableSectionKind(section.type)
  const source =
    section.source?.templateKey ?? snapshot.composition.template.key
  const family = portableFamily(source)
  const definition = portableSection(section.type)
  const label = `${definition?.label ?? "Section"} • ${portableTemplateName(source)}`
  const { business } = snapshot.resources
  const copy = (field: string, fallback = "", multiline = false) => (
    <Copy
      section={section}
      field={field}
      fallback={fallback}
      editing={editing}
      multiline={multiline}
    />
  )
  const cover = storefrontDesignAsset(section.settings.cover)
  const concierge = snapshot.composition.template.key === "service-concierge"
  let body: ReactNode
  if (concierge && kind === "story")
    body = (
      <ServiceConciergeStory
        headline={copy("headline", "Our story")}
        story={copy(
          "tagline",
          business.description ?? (editing ? "Tell your story…" : ""),
          true,
        )}
      />
    )
  // The editor keeps the plain-text FAQ so questions stay directly editable.
  else if (concierge && kind === "faq" && !editing)
    body = (
      <ServiceConciergeFaq
        heading={copy("heading")}
        entries={["one", "two", "three"].map((n) => ({
          id: n,
          question: String(section.settings[`question-${n}`] ?? ""),
          answer: String(section.settings[`answer-${n}`] ?? ""),
        }))}
      />
    )
  else if (kind === "intro" || kind === "story")
    body = (
      <div className={cover ? "cv-split" : ""}>
        <div>
          {kind === "intro" && family !== "catalog" ? (
            <p className="cv-eyebrow">{business.name}</p>
          ) : null}
          {kind === "intro" ||
          (snapshot.composition.template.key === "service-concierge" &&
            section.type.endsWith("-story")) ? (
            <h1>{copy("headline", business.name)}</h1>
          ) : (
            <h2>{copy("headline", "Our story")}</h2>
          )}
          <p className="cv-lede">
            {copy(
              "tagline",
              kind === "intro"
                ? (business.description ?? "")
                : editing
                  ? "Tell your story…"
                  : "",
              true,
            )}
          </p>
        </div>
        {cover ? (
          <img src={cover.url} alt="" width={1200} height={560} />
        ) : null}
      </div>
    )
  else if (kind === "rotate")
    body = (
      <Rotation section={section} editing={editing} thumbnail={thumbnail} />
    )
  else if (section.type === "service-concierge-collection")
    body = (
      <ServiceConciergeCollection
        domain={domain}
        headline={copy("headline")}
        description={copy("tagline")}
        enquiryHeading={copy("request-heading")}
        after={after}
      />
    )
  else if (kind === "floor")
    body = (
      <MarketHallFloor
        section={section}
        copy={copy}
        after={after}
        editing={!!editing}
      />
    )
  else if (kind === "counter") {
    // Live pages omit an empty strip; the editor keeps it selectable.
    if (
      !editing &&
      !thumbnail &&
      !marketHallSplit(snapshot.resources.catalog.items).counter.length
    )
      return null
    body = (
      <MarketHallCounter section={section} copy={copy} editing={!!editing} />
    )
  } else if (kind === "collection")
    body = (
      <CommerceCollection
        syncUrl={syncUrl && !editing && !thumbnail}
        domain={domain}
        kind={family === "desk" ? "services" : "retail"}
        heading={String(section.settings.heading)}
        headingContent={copy("heading")}
        requestHeading={String(section.settings["request-heading"])}
        requestHeadingContent={copy("request-heading")}
        showCategories={section.settings["show-categories"] === true}
        after={after}
        customerChatOrigin={customerChatOrigin}
      />
    )
  else if (kind === "faq")
    body = (
      <div className="cv-faq-layout">
        <h2>{copy("heading")}</h2>
        <div>
          {["one", "two", "three"].map((n) => (
            <details key={n} open={!!editing || thumbnail}>
              <summary>
                {copy(`question-${n}`, editing ? "Your question" : "")}
              </summary>
              <p>{copy(`answer-${n}`, editing ? "Your answer" : "", true)}</p>
            </details>
          ))}
        </div>
      </div>
    )
  else if (kind === "quotes") {
    const quotes = ["one", "two", "three"].filter(
      (n) => editing || thumbnail || section.settings[`quote-${n}`],
    )
    if (!quotes.length) return null
    body = (
      <>
        <h2>{copy("heading")}</h2>
        <div className="cv-quotes">
          {quotes.map((n) => (
            <blockquote key={n}>
              <p>
                {copy(
                  `quote-${n}`,
                  editing || thumbnail ? "Add a real customer quote…" : "",
                  true,
                )}
              </p>
              <cite>
                {copy(`name-${n}`, editing || thumbnail ? "Customer name" : "")}
              </cite>
            </blockquote>
          ))}
        </div>
      </>
    )
  } else if (kind === "contact")
    body = (
      <div className="cv-contact">
        <div>
          <h2>{copy("heading")}</h2>
          <p>{business.name}</p>
          <p>{domain}</p>
        </div>
        <div>
          <span className="cv-cta-label">{copy("cta")}</span>
          <TemplateActions domain={domain} />
        </div>
      </div>
    )
  else return null
  return (
    <section
      className={`cv-section cv-${kind} cv-${family}${editing?.selectedId === section.id ? " cv-selected" : ""}`}
      data-section-id={section.id}
      data-source-template={source}
      data-source-version={section.source?.templateVersion}
      aria-label={label}
      tabIndex={editing ? 0 : undefined}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === "Enter")
          editing?.onSelect(section.id)
      }}
      onClick={() => editing?.onSelect(section.id)}
    >
      {editing ? (
        <button
          type="button"
          className="cv-section-label"
          onClick={() => editing.onSelect(section.id)}
        >
          {label}
        </button>
      ) : null}
      <div className="cv-wrap">{body}</div>
    </section>
  )
}

export function CanvasStorefront({
  snapshot,
  domain,
  pageKey = "home",
  editing,
  onPageChange,
  customerChatOrigin,
  after,
  syncUrl = false,
}: Props & { syncUrl?: boolean }) {
  const { composition, resources } = snapshot
  const page =
    composition.pages.find((entry) => entry.key === pageKey) ??
    composition.pages[0]
  if (!page) return null
  const family = portableFamily(composition.template.key)
  const concierge = composition.template.key === "service-concierge"
  const theme = {
    "--cv-accent": composition.theme.accent,
    "--cv-background": composition.theme.background,
    "--cv-radius":
      composition.theme.radius === "none"
        ? "0px"
        : composition.theme.radius === "rounded"
          ? "14px"
          : "4px",
    fontFamily:
      composition.theme.font === "serif"
        ? 'Georgia, "Times New Roman", serif'
        : concierge
          ? '"Manrope", "Geist", system-ui, sans-serif'
          : '"Geist", system-ui, sans-serif',
  } as CSSProperties
  const site = (
    <div
      className={`cv-site tf-store tf-${family === "desk" ? "desk" : "retail"}`}
      data-template={composition.template.key}
      data-page={page.key}
      style={theme}
    >
      {concierge ? (
        <ServiceConciergeHeader
          name={resources.business.name}
          pages={composition.pages}
          current={page.key}
          onPageChange={onPageChange}
        />
      ) : (
        <header className={`cv-header cv-${family}`}>
          <div className="cv-wrap">
            <strong>{resources.business.name}</strong>
            <nav aria-label="Storefront pages">
              {composition.pages.map((entry) => (
                <a
                  key={entry.key}
                  href={entry.key === "home" ? "/" : `/${entry.key}`}
                  aria-current={page.key === entry.key ? "page" : undefined}
                  onClick={
                    onPageChange
                      ? (event) => {
                          event.preventDefault()
                          onPageChange(entry.key)
                        }
                      : undefined
                  }
                >
                  {entry.key === "home" ? "Home" : "About"}
                </a>
              ))}
            </nav>
            <TemplateActions domain={domain} />
          </div>
        </header>
      )}
      <main>
        {page.sections
          .filter(
            (section) =>
              section.visible &&
              !["studio-header", "studio-footer"].includes(section.type),
          )
          .map((section) => (
            <CanvasSection
              key={section.id}
              syncUrl={syncUrl && !editing && !onPageChange}
              section={section}
              snapshot={snapshot}
              domain={domain}
              after={after}
              customerChatOrigin={customerChatOrigin}
              editing={editing}
            />
          ))}
      </main>
      <footer className="cv-footer">
        <div className="cv-wrap">
          <span>
            {resources.business.name} · {domain}
          </span>
          <span>
            <StorefrontAttribution />
          </span>
        </div>
      </footer>
    </div>
  )
  return (
    <TemplateHost snapshot={snapshot}>
      {family === "hall" ? (
        <MarketHallDetail
          domain={domain}
          // A portable collection on the same page already owns the ?item= dialog.
          deepLink={
            !page.sections.some(
              (section) =>
                section.visible &&
                portableSectionKind(section.type) === "collection",
            )
          }
          syncUrl={syncUrl && !editing && !onPageChange}
        >
          {site}
        </MarketHallDetail>
      ) : (
        site
      )}
    </TemplateHost>
  )
}

export function CanvasSectionPreview({
  section,
  snapshot,
}: { section: SectionInstance; snapshot: StorefrontClientSnapshot }) {
  if (section.type.startsWith("commerce-studio-"))
    return (
      <CommerceStudioSectionPreview section={section} snapshot={snapshot} />
    )
  const minimal = {
    ...snapshot,
    mode: "preview" as const,
    resources: {
      ...snapshot.resources,
      catalog: {
        ...snapshot.resources.catalog,
        items: snapshot.resources.catalog.items.slice(0, 4),
      },
    },
  }
  const theme = {
    "--cv-accent": snapshot.composition.theme.accent,
    "--cv-background": snapshot.composition.theme.background,
    "--cv-radius":
      snapshot.composition.theme.radius === "rounded"
        ? "14px"
        : snapshot.composition.theme.radius === "none"
          ? "0px"
          : "4px",
    fontFamily:
      snapshot.composition.theme.font === "serif"
        ? "Georgia, serif"
        : "system-ui, sans-serif",
  } as CSSProperties
  return (
    <TemplateHost snapshot={minimal}>
      <div className="cv-site tf-store tf-retail" style={theme}>
        <CanvasSection
          section={section}
          snapshot={minimal}
          domain={`${snapshot.resources.business.slug}.ewatrade.com`}
          thumbnail
        />
      </div>
    </TemplateHost>
  )
}
