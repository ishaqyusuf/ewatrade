"use client"

import { CommerceLink } from "./navigation"

import { storefrontItemHref } from "@ewatrade/storefront-runtime/links"
import {
  StorefrontArtwork,
  StorefrontPhoto,
} from "@ewatrade/storefront-runtime/primitives"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@ewatrade/ui/accordion"
import { Button, buttonVariants } from "@ewatrade/ui/button"
import { cn } from "@ewatrade/ui/cn"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@ewatrade/ui/empty"
import {
  ArrowRight01Icon,
  Clock01Icon,
  DeliveryTruck01Icon,
  Location01Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"
import type { SectionInstance } from "../../../storefront-contracts/src/manifest"
import type { PublicCatalogItem } from "../../../storefront-contracts/src/resources"
import { CatalogListingControls } from "../shared/catalog-controls"
import {
  catalogListingFiltered,
  catalogListingPathHref,
} from "../shared/catalog-listing"
import { formatMoney, itemSoldOut, stockWording } from "./commerce"
import {
  CommerceStudioProvider,
  commerceThemeStyle,
  sectionText,
  useCommerceStudio,
} from "./context"
import { aboutHasContent } from "./shell"

import type { CanvasEditing } from "../canvas/render"
import type { CommerceStudioProps } from "./types"

export function CommerceStudioPageContent(props: CommerceStudioProps) {
  const { snapshot } = props
  const page =
    snapshot.composition.pages.find(
      (entry) => entry.key === (props.pageKey ?? "home"),
    ) ?? snapshot.composition.pages[0]
  if (!page) return null
  return (
    <>
      {page.sections
        .filter(
          (section) =>
            section.visible &&
            section.type !== "commerce-studio-header" &&
            section.type !== "commerce-studio-footer",
        )
        .map((section) => (
          <EditableFrame
            key={section.id}
            section={section}
            editing={props.editing}
          >
            <Section section={section} pageKey={page.key} />
          </EditableFrame>
        ))}
    </>
  )
}

/** In Studio, sections are selectable; copy edits go through the section dialog. */
function EditableFrame({
  section,
  editing,
  children,
}: {
  section: SectionInstance
  editing?: CanvasEditing
  children: ReactNode
}) {
  if (!editing) return <>{children}</>
  return (
    <div
      className="cs-editable"
      data-selected={editing.selectedId === section.id}
      // biome-ignore lint/a11y/useSemanticElements: wraps arbitrary section markup for Studio selection.
      role="button"
      tabIndex={0}
      aria-label={`Edit ${section.type.replace("commerce-studio-", "")} section`}
      onClick={() => editing.onSelect(section.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          editing.onSelect(section.id)
        }
      }}
    >
      {children}
    </div>
  )
}

function Section({
  section,
  pageKey,
}: { section: SectionInstance; pageKey: string }) {
  switch (section.type) {
    case "commerce-studio-hero":
      return <Hero section={section} />
    case "commerce-studio-categories":
      return <Categories section={section} />
    case "commerce-studio-featured":
      return <Featured section={section} />
    case "commerce-studio-catalog":
      return <Catalog section={section} />
    case "commerce-studio-services":
      return <Services section={section} standalone={pageKey === "services"} />
    case "commerce-studio-story":
      return <Story section={section} standalone={pageKey === "about"} />
    case "commerce-studio-faq":
      return <Faq section={section} />
    case "commerce-studio-contact":
      return <Contact section={section} />
    default:
      return null
  }
}

// ---------------------------------------------------------------- Sections

/**
 * The public product a section's `image` field names (1.2.0). Resolved only against the
 * published load, like Featured pins: hidden, archived, off-Store or over-cap items and
 * services are skipped, so the section falls back silently.
 */
export function chosenPhotoItem(
  snapshot: StorefrontClientSnapshot,
  section: SectionInstance,
) {
  const value = section.settings.image
  const id = Array.isArray(value) ? value[0] : undefined
  if (typeof id !== "string") return null
  const { items, pinnedItems = [] } = snapshot.resources.catalog
  return (
    [...items, ...pinnedItems].find(
      (item) => item.id === id && item.kind === "PRODUCT",
    ) ?? null
  )
}

/** Explicit 3/4 columns (1.2.0) or, by default, a count that leaves no orphan row. */
function gridColumns(section: SectionInstance) {
  return section.settings.columns === "three"
    ? "3"
    : section.settings.columns === "four"
      ? "4"
      : undefined
}

function Hero({ section }: { section: SectionInstance }) {
  const { snapshot, facts, header, href } = useCommerceStudio()
  const business = snapshot.resources.business
  const headline = sectionText(section, "headline", business.name)
  const description = sectionText(
    section,
    "description",
    business.description ?? "",
  )
  const showActions = section.settings["show-actions"] !== false
  const items = snapshot.resources.catalog.items
  // 1.2.0: the merchant's chosen product photo leads; otherwise its catalog artwork.
  const chosen = chosenPhotoItem(snapshot, section)
  const photo = chosen?.photoUrl ? chosen : null
  // A sparse catalog already shows its items below; repeating one here adds nothing.
  const sparse = facts.products + facts.services < 4
  const feature = photo
    ? null
    : (chosen ??
      items.find((item) => item.photoUrl && !itemSoldOut(item)) ??
      (sparse
        ? null
        : (items.find(
            (item) =>
              item.kind === (facts.products ? "PRODUCT" : "SERVICE") &&
              !itemSoldOut(item),
          ) ?? null)))
  const factsList = [
    header.location ? { icon: Location01Icon, text: header.location } : null,
    header.offerDelivery && header.deliveryNote
      ? { icon: DeliveryTruck01Icon, text: header.deliveryNote }
      : null,
    facts.products || facts.services
      ? {
          icon: WhatsappIcon,
          text: "You send a request; the business confirms with you before you pay.",
        }
      : null,
  ].filter(Boolean) as { icon: typeof Location01Icon; text: string }[]
  return (
    <section
      className="cs-hero"
      data-media={photo ? "photo" : feature ? "item" : "none"}
    >
      <div className="cs-wrap cs-hero__grid">
        <div className="cs-hero__copy">
          <h1 className="cs-display">{headline}</h1>
          {description ? <p className="cs-lead">{description}</p> : null}
          {showActions && (facts.products || facts.services) ? (
            <div className="cs-hero__actions">
              {facts.products ? (
                <CommerceLink
                  className={buttonVariants({
                    size: "lg",
                    className: "cs-primary",
                  })}
                  href={href("/shop")}
                >
                  {sectionText(section, "shop-label", "Shop now")}
                </CommerceLink>
              ) : null}
              {facts.services ? (
                <CommerceLink
                  className={buttonVariants({
                    size: "lg",
                    variant: facts.products ? "outline" : "default",
                    className: facts.products ? "cs-secondary" : "cs-primary",
                  })}
                  href={href("/services")}
                >
                  {sectionText(
                    section,
                    "services-label",
                    facts.products ? "See services" : "Choose a service",
                  )}
                </CommerceLink>
              ) : null}
            </div>
          ) : null}
          {facts.mode === "empty" ? (
            <p className="cs-lead cs-muted">
              Nothing is listed here yet. Check back soon
              {snapshot.resources.contact.whatsAppPhone
                ? " or message the business."
                : "."}
            </p>
          ) : null}
          {factsList.length ? (
            <ul className="cs-hero__facts">
              {factsList.map((fact) => (
                <li key={fact.text}>
                  <HugeiconsIcon icon={fact.icon} strokeWidth={1.6} />
                  {fact.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {photo?.photoUrl ? (
          <figure className="cs-hero__media cs-hero__media--photo">
            <StorefrontPhoto
              src={photo.photoUrl}
              alt={sectionText(section, "image-alt", photo.name)}
              className="cs-photo"
              fetchPriority="high"
              fallback={
                <StorefrontArtwork
                  item={{ ...photo, photoUrl: undefined, availability: null }}
                />
              }
            />
          </figure>
        ) : feature ? (
          <CommerceLink
            className="cs-hero__media"
            href={href(storefrontItemHref(feature.id))}
            aria-label={`View ${feature.name}`}
          >
            <StorefrontArtwork item={feature} />
            <span className="cs-hero__caption">{feature.name}</span>
          </CommerceLink>
        ) : null}
      </div>
    </section>
  )
}

function Categories({ section }: { section: SectionInstance }) {
  const { snapshot, facts, href } = useCommerceStudio()
  const { categories, items } = snapshot.resources.catalog
  // One category is not a choice: hide it rather than show a control that does nothing.
  if (!facts.products || categories.length < 2) return null
  // Only categories with products on sale here; service-only groups aren't shop shelves.
  const tiles = categories
    .map((category) => ({
      category,
      cover: items.find(
        (item) => item.kind === "PRODUCT" && item.category?.id === category.id,
      ),
    }))
    .filter((tile) => tile.cover)
    .slice(0, 8)
  if (tiles.length < 2) return null
  return (
    <section className="cs-section">
      <div className="cs-wrap">
        <h2 className="cs-title">
          {sectionText(section, "heading", "Shop by category")}
        </h2>
        <div className="cs-category-row">
          {tiles.map(({ category, cover }) => (
            <CommerceLink
              key={category.id}
              className="cs-category"
              href={href(catalogListingPathHref("/shop", category.id))}
            >
              <span className="cs-category__media">
                {cover ? (
                  <StorefrontArtwork item={cover} />
                ) : (
                  <span className="cs-category__blank" aria-hidden="true">
                    {category.name.slice(0, 1)}
                  </span>
                )}
              </span>
              <span className="cs-category__label">{category.name}</span>
            </CommerceLink>
          ))}
        </div>
      </div>
    </section>
  )
}

function leadItems(items: readonly PublicCatalogItem[], lead: string) {
  const products = items.filter((item) => item.kind === "PRODUCT")
  if (lead === "price-low")
    return [...products].sort(
      (a, b) =>
        (a.priceMinor ?? Number.MAX_SAFE_INTEGER) -
        (b.priceMinor ?? Number.MAX_SAFE_INTEGER),
    )
  if (lead === "newest") return [...products].reverse()
  return [...products].sort(
    (a, b) => Number(itemSoldOut(a)) - Number(itemSoldOut(b)),
  )
}

/**
 * Pinned products first, in the merchant's order, then the automatic lead. Pins resolve
 * only against the public load, so hidden, archived, off-Store or over-cap items and
 * services are skipped silently.
 */
export function featuredItems(
  items: readonly PublicCatalogItem[],
  pinned: unknown,
  lead: string,
  /** Pinned public items beyond this page: eligible as pins, never as automatic picks. */
  pinnedPool: readonly PublicCatalogItem[] = [],
) {
  const ids = Array.isArray(pinned) ? pinned : []
  const chosen = ids.flatMap((id) => {
    const item = [...items, ...pinnedPool].find(
      (entry) => entry.id === id && entry.kind === "PRODUCT",
    )
    return item ? [item] : []
  })
  return [
    ...chosen,
    ...leadItems(items, lead).filter((item) => !chosen.includes(item)),
  ]
}

function Featured({ section }: { section: SectionInstance }) {
  const { snapshot, facts, href } = useCommerceStudio()
  if (!facts.products) return null
  const count =
    section.settings.count === "three"
      ? 3
      : section.settings.count === "eight"
        ? 8
        : 4
  const items = featuredItems(
    snapshot.resources.catalog.items,
    section.settings.pinned,
    String(section.settings.lead ?? "available"),
    // Pinned public items past this page arrive separately; they are never listed.
    snapshot.resources.catalog.pinnedItems,
  ).slice(0, count)
  const heading = sectionText(section, "heading", "New in the shop")
  return (
    <section className="cs-section">
      <div className="cs-wrap">
        <div className="cs-section__head">
          <h2 className="cs-title">{heading}</h2>
          {facts.products > items.length ? (
            <CommerceLink
              className="cs-link cs-link--arrow"
              href={href("/shop")}
            >
              View all {facts.products}{" "}
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </CommerceLink>
          ) : null}
        </div>
        {items.length === 1 && items[0] ? (
          <FeatureItem item={items[0]} />
        ) : items.length ? (
          <ProductGrid
            items={items}
            sparse={items.length < 3}
            columns={gridColumns(section)}
          />
        ) : (
          <EmptyShelf />
        )}
      </div>
    </section>
  )
}

/** One product: a balanced wide layout instead of a lone card in an empty grid. */
function FeatureItem({ item }: { item: PublicCatalogItem }) {
  const { href } = useCommerceStudio()
  const soldOut = itemSoldOut(item)
  const first =
    item.options.find((option) => option.stock !== "out_of_stock") ??
    item.options[0]
  const stock = soldOut
    ? stockWording("out_of_stock")
    : stockWording(first?.stock, first?.lowStockQuantity)
  const link = href(storefrontItemHref(item.id))
  return (
    <article className="cs-feature">
      <CommerceLink
        className="cs-feature__media"
        href={link}
        tabIndex={-1}
        aria-hidden="true"
      >
        <StorefrontArtwork item={{ ...item, availability: null }} />
      </CommerceLink>
      <div className="cs-feature__body">
        <h3 className="cs-title">
          <CommerceLink href={link}>{item.name}</CommerceLink>
        </h3>
        <p className="cs-product__price">
          {item.priceMinor === null
            ? "Price on request"
            : `${item.isFromPrice ? "From " : ""}${formatMoney(item.priceMinor, item.currencyCode)}`}
          {first?.unit?.label && item.priceMinor !== null ? (
            <span className="cs-unit"> per {first.unit.label}</span>
          ) : null}
        </p>
        {item.description ? (
          <p className="cs-lead">{item.description}</p>
        ) : null}
        <p className="cs-card__meta">
          <span className="cs-stock" data-tone={stock.tone}>
            {stock.label}
          </span>
          {item.options.length > 1 ? (
            <span>{item.options.length} options</span>
          ) : null}
        </p>
        <CommerceLink
          className={buttonVariants({
            size: "lg",
            className: "cs-primary cs-feature__cta",
          })}
          href={link}
        >
          View details
        </CommerceLink>
      </div>
    </article>
  )
}

function Catalog({ section }: { section: SectionInstance }) {
  const { snapshot, facts, href } = useCommerceStudio()
  const catalog = snapshot.resources.catalog
  if (!facts.products && !catalog.items.some((item) => item.kind === "PRODUCT"))
    return (
      <section className="cs-section">
        <div className="cs-wrap">
          <h1 className="cs-title cs-title--page">
            {sectionText(section, "heading", "Shop")}
          </h1>
          <EmptyShelf />
        </div>
      </section>
    )
  const products = catalog.items.filter((item) => item.kind === "PRODUCT")
  const filtered = catalogListingFiltered(catalog.query)
  const showSearch =
    section.settings["show-search"] !== false && facts.products > 6
  return (
    <section className="cs-section">
      <div className="cs-wrap">
        <div className="cs-section__head">
          <h1 className="cs-title cs-title--page">
            {sectionText(section, "heading", "Shop")}
          </h1>
          <p className="cs-muted">
            {facts.products} {facts.products === 1 ? "item" : "items"}
          </p>
        </div>
        {catalog.categories.length > 1 ? (
          <nav className="cs-chips" aria-label="Categories">
            <CommerceLink
              className="cs-chip"
              href={href("/shop")}
              aria-current={!catalog.category ? "page" : undefined}
            >
              All
            </CommerceLink>
            {catalog.categories.map((category) => (
              <CommerceLink
                key={category.id}
                className="cs-chip"
                href={href(
                  catalogListingPathHref(
                    "/shop",
                    category.id,
                    null,
                    catalog.query,
                  ),
                )}
                aria-current={
                  catalog.category === category.id ? "page" : undefined
                }
              >
                {category.name}
              </CommerceLink>
            ))}
          </nav>
        ) : null}
        {showSearch ? (
          <CatalogListingControls
            className="cs-listing-controls"
            category={catalog.category}
            query={catalog.query}
            label="Search the shop"
            action="/shop"
          />
        ) : null}
        {/* Product cards use h3; keep the outline h1 → h2 → h3. */}
        <h2 className="cs-visually-hidden">Products</h2>
        {products.length === 1 && products[0] && !filtered ? (
          <FeatureItem item={products[0]} />
        ) : products.length ? (
          <ProductGrid
            items={products}
            sparse={products.length < 3}
            columns={gridColumns(section)}
          />
        ) : filtered ? (
          <Empty className="cs-empty">
            <EmptyHeader>
              <EmptyTitle>Nothing matches that search</EmptyTitle>
              <EmptyDescription>
                Try another word or clear the filters.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <CommerceLink
                className={buttonVariants({ variant: "outline" })}
                href={href("/shop")}
              >
                Clear search
              </CommerceLink>
            </EmptyContent>
          </Empty>
        ) : (
          <EmptyShelf />
        )}
        {catalog.nextCursor ? (
          <div className="cs-more">
            <CommerceLink
              className={buttonVariants({ variant: "outline" })}
              href={href(
                catalogListingPathHref(
                  "/shop",
                  catalog.category,
                  catalog.nextCursor,
                  catalog.query,
                ),
              )}
            >
              Show more
            </CommerceLink>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function ProductGrid({
  items,
  sparse,
  columns,
}: {
  items: readonly PublicCatalogItem[]
  sparse?: boolean
  columns?: "3" | "4"
}) {
  return (
    <ul
      className="cs-grid"
      data-sparse={sparse ? "true" : undefined}
      // Without a merchant choice, the count follows the items so rows don't end with an orphan.
      data-columns={
        columns ?? (items.length % 4 === 0 || items.length > 6 ? "4" : "3")
      }
    >
      {items.map((item) => (
        <li key={item.id}>
          <ProductCard item={item} />
        </li>
      ))}
    </ul>
  )
}

function ProductCard({ item }: { item: PublicCatalogItem }) {
  const { href } = useCommerceStudio()
  const soldOut = itemSoldOut(item)
  const first =
    item.options.find((option) => option.stock !== "out_of_stock") ??
    item.options[0]
  const stock = soldOut
    ? stockWording("out_of_stock")
    : stockWording(first?.stock, first?.lowStockQuantity)
  const link = href(storefrontItemHref(item.id))
  return (
    <article className="cs-card" data-sold-out={soldOut || undefined}>
      <CommerceLink
        className="cs-card__media"
        href={link}
        tabIndex={-1}
        aria-hidden="true"
      >
        <StorefrontArtwork item={{ ...item, availability: null }} />
        {soldOut ? <span className="cs-card__flag">Sold out</span> : null}
      </CommerceLink>
      <div className="cs-card__body">
        <h3 className="cs-card__name">
          <CommerceLink href={link}>{item.name}</CommerceLink>
        </h3>
        <p className="cs-card__price">
          {item.priceMinor === null
            ? "Price on request"
            : `${item.isFromPrice ? "From " : ""}${formatMoney(item.priceMinor, item.currencyCode)}`}
          {first?.unit?.label && item.priceMinor !== null ? (
            <span className="cs-unit"> per {first.unit.label}</span>
          ) : null}
        </p>
        <p className="cs-card__meta">
          <span className="cs-stock" data-tone={stock.tone}>
            {stock.label}
          </span>
          {item.options.length > 1 ? (
            <span>{item.options.length} options</span>
          ) : null}
        </p>
      </div>
    </article>
  )
}

function EmptyShelf() {
  const { snapshot } = useCommerceStudio()
  const whatsapp = snapshot.resources.contact.whatsAppPhone
  return (
    <Empty className="cs-empty">
      <EmptyHeader>
        <EmptyTitle>Nothing is listed right now</EmptyTitle>
        <EmptyDescription>
          {whatsapp
            ? "Message the business if you're looking for something in particular."
            : "Check back soon."}
        </EmptyDescription>
      </EmptyHeader>
      {whatsapp ? (
        <EmptyContent>
          <CommerceLink
            className={buttonVariants({ variant: "outline" })}
            href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
          >
            Message on WhatsApp
          </CommerceLink>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

function Services({
  section,
  standalone,
}: { section: SectionInstance; standalone: boolean }) {
  const { snapshot, facts, href } = useCommerceStudio()
  const services = snapshot.resources.catalog.items.filter(
    (item) => item.kind === "SERVICE",
  )
  if (!facts.services && !standalone) return null
  const Heading = standalone ? "h1" : "h2"
  return (
    <section className="cs-section cs-services">
      <div className="cs-wrap">
        <div className="cs-section__head cs-section__head--stack">
          <Heading className={cn("cs-title", standalone && "cs-title--page")}>
            {sectionText(section, "heading", "Services")}
          </Heading>
          <p className="cs-lead cs-lead--narrow">
            {sectionText(section, "intro")}
          </p>
        </div>
        {standalone ? (
          <h2 className="cs-visually-hidden">All services</h2>
        ) : null}
        {services.length ? (
          <ul className="cs-service-list">
            {services.map((service) => (
              <li key={service.id}>
                <ServiceRow
                  item={service}
                  href={href(storefrontItemHref(service.id))}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyShelf />
        )}
      </div>
    </section>
  )
}

export function servicePriceLabel(item: PublicCatalogItem) {
  const priced = item.options.filter((option) => option.priceMinor !== null)
  if (!priced.length) return "Priced after the business checks"
  const lowest = Math.min(...priced.map((option) => option.priceMinor ?? 0))
  const varied =
    priced.length !== item.options.length ||
    priced.some((option) => option.priceMinor !== lowest)
  return `${varied ? "From " : ""}${formatMoney(lowest, item.currencyCode)}`
}

function ServiceRow({ item, href }: { item: PublicCatalogItem; href: string }) {
  const duration = item.options.find(
    (option) => option.durationMinutes,
  )?.durationMinutes
  return (
    <article className="cs-service">
      <div className="cs-service__main">
        <h3 className="cs-service__name">
          <CommerceLink href={href}>{item.name}</CommerceLink>
        </h3>
        {item.description ? (
          <p className="cs-service__text">{item.description}</p>
        ) : null}
        <p className="cs-service__meta">
          <span>{servicePriceLabel(item)}</span>
          {duration ? (
            <span>
              <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.6} />
              About{" "}
              {duration >= 60
                ? `${Math.round((duration / 60) * 10) / 10} h`
                : `${duration} min`}
            </span>
          ) : null}
          {item.options.length > 1 ? (
            <span>{item.options.length} options</span>
          ) : null}
        </p>
      </div>
      <CommerceLink
        className={buttonVariants({
          variant: "outline",
          className: "cs-service__cta",
        })}
        href={href}
        aria-label={`Choose ${item.name}`}
      >
        Choose
      </CommerceLink>
    </article>
  )
}

function Story({
  section,
  standalone,
}: { section: SectionInstance; standalone: boolean }) {
  const { snapshot, header, href } = useCommerceStudio()
  // On Home the introduction already shows the description; don't repeat it.
  const body = sectionText(
    section,
    "body",
    standalone ? (snapshot.resources.business.description ?? "") : "",
  )
  // No story written and no business description: nothing truthful to show.
  if (!body)
    return standalone ? (
      <section className="cs-section">
        <div className="cs-wrap cs-prose">
          <h1 className="cs-title cs-title--page">
            {sectionText(section, "heading", "Our story")}
          </h1>
          <p className="cs-muted">
            {snapshot.resources.business.name} hasn't added its story yet.
          </p>
        </div>
      </section>
    ) : null
  const Heading = standalone ? "h1" : "h2"
  const chosen = chosenPhotoItem(snapshot, section)
  // 1.2.0 Home treatment: a link on to the full Our story page, when it has content.
  const link =
    !standalone &&
    section.settings["show-link"] === true &&
    aboutHasContent(snapshot, header)
  const prose = (
    <div className={cn(!chosen && "cs-wrap", "cs-prose")}>
      <Heading className={cn("cs-title", standalone && "cs-title--page")}>
        {sectionText(section, "heading", "Our story")}
      </Heading>
      {body.split(/\n{2,}/).map((paragraph) => (
        <p key={paragraph.slice(0, 40)}>{paragraph}</p>
      ))}
      {link ? (
        <CommerceLink
          className="cs-link cs-link--arrow cs-story__link"
          href={href("/about")}
        >
          {sectionText(section, "link-label", "Read our story")}{" "}
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </CommerceLink>
      ) : null}
    </div>
  )
  if (!chosen) return <section className="cs-section cs-story">{prose}</section>
  return (
    <section
      className="cs-section cs-story"
      data-media="item"
      data-side={section.settings["image-side"] === "end" ? "end" : "start"}
    >
      <div className="cs-wrap cs-story__grid">
        <figure className="cs-story__media">
          {chosen.photoUrl ? (
            <StorefrontPhoto
              src={chosen.photoUrl}
              alt={sectionText(section, "image-alt", chosen.name)}
              className="cs-photo"
              loading="lazy"
              fallback={
                <StorefrontArtwork
                  item={{ ...chosen, photoUrl: undefined, availability: null }}
                />
              }
            />
          ) : (
            // No public photo yet: the item's catalog artwork, decorative only.
            <StorefrontArtwork item={{ ...chosen, availability: null }} />
          )}
        </figure>
        {prose}
      </div>
    </section>
  )
}

function Faq({ section }: { section: SectionInstance }) {
  const { facts } = useCommerceStudio()
  // Ordering explanations mean nothing while nothing can be ordered.
  if (facts.mode === "empty") return null
  const pairs = (["one", "two", "three"] as const)
    .map((n) => ({
      q: sectionText(section, `question-${n}`),
      a: sectionText(section, `answer-${n}`),
    }))
    .filter((pair) => pair.q && pair.a)
  if (!pairs.length) return null
  const headingId = `cs-faq-${section.id}`
  return (
    <section className="cs-section">
      <div className="cs-wrap cs-faq">
        <h2 className="cs-title" id={headingId}>
          {sectionText(section, "heading", "How ordering works")}
        </h2>
        <Accordion className="cs-faq__list" aria-labelledby={headingId}>
          {pairs.map((pair) => (
            <AccordionItem key={pair.q} value={pair.q}>
              <AccordionTrigger>{pair.q}</AccordionTrigger>
              <AccordionContent>{pair.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

function Contact({ section }: { section: SectionInstance }) {
  const { snapshot, header } = useCommerceStudio()
  const whatsapp = snapshot.resources.contact.whatsAppPhone
  const note = sectionText(section, "note")
  if (!whatsapp && !header.location && !header.hours && !note) return null
  return (
    <section className="cs-section cs-contact">
      <div className="cs-wrap">
        <h2 className="cs-title">
          {sectionText(section, "heading", "Visit or message us")}
        </h2>
        <div className="cs-contact__body">
          {header.location ? (
            <p>
              <HugeiconsIcon icon={Location01Icon} strokeWidth={1.6} />
              <span>{header.location}</span>
            </p>
          ) : null}
          {header.hours ? (
            <p>
              <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.6} />
              <span>{header.hours}</span>
            </p>
          ) : null}
          {note ? <p className="cs-contact__note">{note}</p> : null}
          {whatsapp ? (
            <CommerceLink
              className={buttonVariants({ className: "cs-primary" })}
              href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              <HugeiconsIcon icon={WhatsappIcon} strokeWidth={1.8} />
              Message on WhatsApp
            </CommerceLink>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/** Studio section-library thumbnail: one section in the template's own styling, never live. */
export function CommerceStudioSectionPreview({
  section,
  snapshot,
}: { section: SectionInstance; snapshot: StorefrontClientSnapshot }) {
  return (
    <CommerceStudioProvider snapshot={{ ...snapshot, mode: "preview" }} preview>
      <div
        className="cs-store"
        data-font={snapshot.composition.theme.font}
        data-density={snapshot.composition.theme.density ?? "comfortable"}
        style={commerceThemeStyle(snapshot.composition.theme)}
      >
        <Section section={section} pageKey="home" />
      </div>
    </CommerceStudioProvider>
  )
}
