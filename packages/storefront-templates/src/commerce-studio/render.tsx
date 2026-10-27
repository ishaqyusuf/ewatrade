"use client"

import { storefrontItemHref } from "@ewatrade/storefront-runtime/links"
import {
  StorefrontArtwork,
  StorefrontAttribution,
} from "@ewatrade/storefront-runtime/primitives"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Toaster,
  buttonVariants,
  cn,
} from "@ewatrade/ui"
import {
  ArrowRight01Icon,
  Clock01Icon,
  DeliveryTruck01Icon,
  Location01Icon,
  ShoppingBag01Icon,
  UserIcon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"
import type { SectionInstance } from "../../../storefront-contracts/src/manifest"
import type { PublicCatalogItem } from "../../../storefront-contracts/src/resources"
import type { CanvasEditing } from "../canvas/render"
import { CatalogListingControls } from "../shared/catalog-controls"
import {
  catalogListingFiltered,
  catalogListingHref,
} from "../shared/catalog-listing"
import { type AccountView, CommerceAccount } from "./account"
import { BagSheet } from "./bag"
import { CommerceCheckout } from "./checkout"
import {
  type StorefrontCommerceAdapter,
  type StorefrontCustomerView,
  bagTotals,
  formatMoney,
  itemSoldOut,
  stockWording,
} from "./commerce"
import {
  CommerceStudioProvider,
  commerceThemeStyle,
  sectionText,
  useCommerceStudio,
} from "./context"
import { ProductDetail } from "./product"
import { CommerceReceipt, type ReceiptView } from "./receipt"
import { ServiceDetail } from "./service"

/** Domain-owned routes the storefront app renders inside this template's shell. */
export type CommerceStudioRoute =
  | { kind: "page" }
  | { kind: "checkout" }
  | { kind: "receipt"; receipt: ReceiptView }
  | { kind: "account"; account: AccountView }

export type CommerceStudioProps = {
  snapshot: StorefrontClientSnapshot
  domain: string
  pageKey?: string
  editing?: CanvasEditing
  onPageChange?: (key: string) => void
  draftPreview?: boolean
  syncUrl?: boolean
  commerce?: StorefrontCommerceAdapter
  customer?: StorefrontCustomerView
  route?: CommerceStudioRoute
}

const pagePath: Record<string, string> = {
  home: "/",
  shop: "/shop",
  services: "/services",
  about: "/about",
}

export function CommerceStudio(props: CommerceStudioProps) {
  const { snapshot } = props
  const preview = Boolean(
    props.editing || props.onPageChange || props.draftPreview,
  )
  const theme = snapshot.composition.theme
  const style = commerceThemeStyle(theme)
  return (
    <CommerceStudioProvider
      snapshot={snapshot}
      adapter={props.commerce}
      customer={props.customer}
      preview={preview}
      onPageChange={props.onPageChange}
    >
      <div
        className="cs-store"
        data-preview={preview || undefined}
        data-font={theme.font}
        data-density={theme.density ?? "comfortable"}
        data-page={
          props.route?.kind === "page" || !props.route
            ? (props.pageKey ?? "home")
            : props.route.kind
        }
        style={style}
      >
        {snapshot.mode === "preview" && !preview ? (
          <p className="cs-qa-banner" role="note">
            Local QA preview · test data · requests are saved to the QA database
            and no messages are sent
          </p>
        ) : null}
        <StoreHeader
          current={
            !props.editing && snapshot.resources.catalog.highlightedItem
              ? snapshot.resources.catalog.highlightedItem.kind === "SERVICE"
                ? "services"
                : "shop"
              : (props.pageKey ?? "home")
          }
        />
        <main id="cs-main" className="cs-main" tabIndex={-1}>
          <RouteBody {...props} />
        </main>
        <StoreFooter />
        <BagDock hidden={props.route?.kind === "checkout"} />
        <BagSheet />
        {preview ? null : <Toaster position="top-center" />}
      </div>
    </CommerceStudioProvider>
  )
}

function RouteBody(props: CommerceStudioProps) {
  const { snapshot, route } = props
  if (route?.kind === "checkout") return <CommerceCheckout />
  if (route?.kind === "receipt")
    return <CommerceReceipt receipt={route.receipt} />
  if (route?.kind === "account")
    return <CommerceAccount account={route.account} />
  const detail = props.editing
    ? null
    : snapshot.resources.catalog.highlightedItem
  if (detail?.kind === "PRODUCT") return <ProductDetail item={detail} />
  if (detail?.kind === "SERVICE") return <ServiceDetail item={detail} />
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

// ---------------------------------------------------------------- Shell

function StoreHeader({ current }: { current: string }) {
  const {
    snapshot,
    facts,
    header,
    customer,
    accounts,
    ordering,
    bag,
    setBagOpen,
    href,
    navigate,
    preview,
  } = useCommerceStudio()
  const pages = snapshot.composition.pages.filter((page) => {
    if (page.key === "shop") return facts.products > 0
    if (page.key === "services") return facts.services > 0
    if (page.key === "about") return aboutHasContent(snapshot, header)
    return true
  })
  const count = bag.lines.length
  const name = snapshot.resources.business.name
  return (
    <header className="cs-header">
      <a className="cs-skip" href="#cs-main">
        Skip to content
      </a>
      <div className="cs-wrap cs-header__row">
        <a
          className="cs-wordmark"
          href={href("/")}
          onClick={(event) => {
            if (preview) {
              event.preventDefault()
              navigate("/")
            }
          }}
        >
          <span className="cs-wordmark__name">{name}</span>
          {header.tagline ? (
            <span className="cs-wordmark__tagline">{header.tagline}</span>
          ) : null}
        </a>
        <nav className="cs-nav" aria-label={`${name} pages`}>
          {pages.map((page) => {
            const path = pagePath[page.key] ?? "/"
            const label =
              snapshot.composition.pages.length && page.key === "about"
                ? "Our story"
                : page.key === "home"
                  ? "Home"
                  : page.key === "shop"
                    ? "Shop"
                    : "Services"
            return (
              <a
                key={page.key}
                className="cs-nav__link"
                href={href(path)}
                aria-current={current === page.key ? "page" : undefined}
                onClick={(event) => {
                  if (preview) {
                    event.preventDefault()
                    navigate(path)
                  }
                }}
              >
                {label}
              </a>
            )
          })}
        </nav>
        <div className="cs-header__actions">
          {accounts ? (
            <a
              className={buttonVariants({
                variant: "ghost",
                className: "cs-icon-text",
              })}
              href="/account"
              aria-label={customer?.signedIn ? "Your account" : "Log in"}
            >
              <HugeiconsIcon icon={UserIcon} strokeWidth={1.8} />
              <span className="cs-hide-sm">
                {customer?.signedIn ? "Account" : "Log in"}
              </span>
            </a>
          ) : null}
          {ordering ? (
            <Button
              variant="ghost"
              className="cs-icon-text"
              aria-label={`Bag, ${count} ${count === 1 ? "item" : "items"}`}
              onClick={() => setBagOpen(true)}
            >
              <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={1.8} />
              <span className="cs-hide-sm">Bag</span>
              <span className="cs-count" aria-hidden="true">
                {count}
              </span>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  )
}

/** "Our story" only when there is something real to read there. */
function aboutHasContent(
  snapshot: StorefrontClientSnapshot,
  header: { location: string; hours: string },
) {
  const story = snapshot.composition.pages
    .find((page) => page.key === "about")
    ?.sections.some(
      (section) =>
        section.visible &&
        section.type === "commerce-studio-story" &&
        String(section.settings.body ?? "").trim(),
    )
  return Boolean(
    story ||
      snapshot.resources.business.description?.trim() ||
      header.location ||
      header.hours ||
      snapshot.resources.contact.whatsAppPhone,
  )
}

function StoreFooter() {
  const { snapshot, header, facts, href } = useCommerceStudio()
  const footer = snapshot.composition.pages
    .flatMap((page) => page.sections)
    .find((section) => section.type === "commerce-studio-footer")
  const note = footer ? sectionText(footer, "note") : ""
  const whatsapp = snapshot.resources.contact.whatsAppPhone
  const name = snapshot.resources.business.name
  return (
    <footer className="cs-footer">
      <div className="cs-wrap cs-footer__grid">
        <div>
          <p className="cs-footer__name">{name}</p>
          {header.tagline ? <p>{header.tagline}</p> : null}
        </div>
        {header.location || header.hours ? (
          <div>
            <h2 className="cs-footer__head">Visit</h2>
            {header.location ? <p>{header.location}</p> : null}
            {header.hours ? <p>{header.hours}</p> : null}
          </div>
        ) : null}
        {facts.products ||
        facts.services ||
        aboutHasContent(snapshot, header) ? (
          <div>
            <h2 className="cs-footer__head">Explore</h2>
            <ul className="cs-footer__links">
              {facts.products ? (
                <li>
                  <a href={href("/shop")}>Shop</a>
                </li>
              ) : null}
              {facts.services ? (
                <li>
                  <a href={href("/services")}>Services</a>
                </li>
              ) : null}
              {aboutHasContent(snapshot, header) ? (
                <li>
                  <a href={href("/about")}>Our story</a>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
        {whatsapp || facts.products || facts.services ? (
          <div>
            <h2 className="cs-footer__head">Talk to us</h2>
            {whatsapp ? (
              <a
                className="cs-link"
                href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                Message on WhatsApp
              </a>
            ) : (
              <p>
                Send a request on this site and the business replies to the
                number you give.
              </p>
            )}
          </div>
        ) : null}
      </div>
      <div className="cs-wrap cs-footer__fine">
        {note ? <p>{note}</p> : null}
        <p>
          © {name} · <StorefrontAttribution />
        </p>
      </div>
    </footer>
  )
}

function BagDock({ hidden }: { hidden: boolean }) {
  const { bag, ordering, setBagOpen, snapshot } = useCommerceStudio()
  if (hidden || !ordering || !bag.lines.length) return null
  const totals = bagTotals(bag.lines)
  const currency = bag.lines[0]?.currencyCode ?? snapshot.currencyCode
  return (
    <div className="cs-dock">
      <button
        type="button"
        className="cs-dock__button"
        onClick={() => setBagOpen(true)}
      >
        <span className="cs-dock__count">
          <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={1.8} />
          {totals.count} {totals.count === 1 ? "item" : "items"}
        </span>
        <span className="cs-dock__total">
          {totals.complete
            ? formatMoney(totals.subtotal, currency)
            : "Total to confirm"}
        </span>
        <span className="cs-dock__cta">
          View bag <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- Sections

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
  // A sparse catalog already shows its items below; repeating one here adds nothing.
  const sparse = facts.products + facts.services < 4
  const feature =
    items.find((item) => item.photoUrl && !itemSoldOut(item)) ??
    (sparse
      ? null
      : (items.find(
          (item) =>
            item.kind === (facts.products ? "PRODUCT" : "SERVICE") &&
            !itemSoldOut(item),
        ) ?? null))
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
    <section className="cs-hero" data-media={feature ? "item" : "none"}>
      <div className="cs-wrap cs-hero__grid">
        <div className="cs-hero__copy">
          <h1 className="cs-display">{headline}</h1>
          {description ? <p className="cs-lead">{description}</p> : null}
          {showActions && (facts.products || facts.services) ? (
            <div className="cs-hero__actions">
              {facts.products ? (
                <a
                  className={buttonVariants({
                    size: "lg",
                    className: "cs-primary",
                  })}
                  href={href("/shop")}
                >
                  Shop now
                </a>
              ) : null}
              {facts.services ? (
                <a
                  className={buttonVariants({
                    size: "lg",
                    variant: facts.products ? "outline" : "default",
                    className: facts.products ? "cs-secondary" : "cs-primary",
                  })}
                  href={href("/services")}
                >
                  {facts.products ? "See services" : "Choose a service"}
                </a>
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
        {feature ? (
          <a
            className="cs-hero__media"
            href={href(storefrontItemHref(feature.id))}
            aria-label={`View ${feature.name}`}
          >
            <StorefrontArtwork item={feature} />
            <span className="cs-hero__caption">{feature.name}</span>
          </a>
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
            <a
              key={category.id}
              className="cs-category"
              href={href(`/shop${catalogListingHref(category.id)}`)}
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
            </a>
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
) {
  const ids = Array.isArray(pinned) ? pinned : []
  const chosen = ids.flatMap((id) => {
    const item = items.find(
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
  ).slice(0, count)
  const heading = sectionText(section, "heading", "New in the shop")
  return (
    <section className="cs-section">
      <div className="cs-wrap">
        <div className="cs-section__head">
          <h2 className="cs-title">{heading}</h2>
          {facts.products > items.length ? (
            <a className="cs-link cs-link--arrow" href={href("/shop")}>
              View all {facts.products}{" "}
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
            </a>
          ) : null}
        </div>
        {items.length === 1 && items[0] ? (
          <FeatureItem item={items[0]} />
        ) : items.length ? (
          <ProductGrid items={items} sparse={items.length < 3} />
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
    : stockWording(first?.stock)
  const link = href(storefrontItemHref(item.id))
  return (
    <article className="cs-feature">
      {/* biome-ignore lint/a11y/useAnchorContent: decorative duplicate of the named link below, hidden from assistive tech. */}
      <a
        className="cs-feature__media"
        href={link}
        tabIndex={-1}
        aria-hidden="true"
      >
        <StorefrontArtwork item={{ ...item, availability: null }} />
      </a>
      <div className="cs-feature__body">
        <h3 className="cs-title">
          <a href={link}>{item.name}</a>
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
        <a
          className={buttonVariants({
            size: "lg",
            className: "cs-primary cs-feature__cta",
          })}
          href={link}
        >
          View details
        </a>
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
            <a
              className="cs-chip"
              href={href("/shop")}
              aria-current={!catalog.category ? "page" : undefined}
            >
              All
            </a>
            {catalog.categories.map((category) => (
              <a
                key={category.id}
                className="cs-chip"
                href={href(
                  `/shop${catalogListingHref(category.id, null, catalog.query)}`,
                )}
                aria-current={
                  catalog.category === category.id ? "page" : undefined
                }
              >
                {category.name}
              </a>
            ))}
          </nav>
        ) : null}
        {showSearch ? (
          <CatalogListingControls
            className="cs-listing-controls"
            category={catalog.category}
            query={catalog.query}
            label="Search the shop"
          />
        ) : null}
        {products.length === 1 && products[0] && !filtered ? (
          <FeatureItem item={products[0]} />
        ) : products.length ? (
          <ProductGrid items={products} sparse={products.length < 3} />
        ) : filtered ? (
          <Empty className="cs-empty">
            <EmptyHeader>
              <EmptyTitle>Nothing matches that search</EmptyTitle>
              <EmptyDescription>
                Try another word or clear the filters.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <a
                className={buttonVariants({ variant: "outline" })}
                href={href("/shop")}
              >
                Clear search
              </a>
            </EmptyContent>
          </Empty>
        ) : (
          <EmptyShelf />
        )}
        {catalog.nextCursor ? (
          <div className="cs-more">
            <a
              className={buttonVariants({ variant: "outline" })}
              href={href(
                `/shop${catalogListingHref(catalog.category, catalog.nextCursor, catalog.query)}`,
              )}
            >
              Show more
            </a>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function ProductGrid({
  items,
  sparse,
}: { items: readonly PublicCatalogItem[]; sparse?: boolean }) {
  return (
    <ul
      className="cs-grid"
      data-sparse={sparse ? "true" : undefined}
      // Column count follows the item count so rows don't end with an orphan.
      data-columns={items.length % 4 === 0 || items.length > 6 ? "4" : "3"}
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
    : stockWording(first?.stock)
  const link = href(storefrontItemHref(item.id))
  return (
    <article className="cs-card" data-sold-out={soldOut || undefined}>
      {/* biome-ignore lint/a11y/useAnchorContent: decorative duplicate of the named link below, hidden from assistive tech. */}
      <a
        className="cs-card__media"
        href={link}
        tabIndex={-1}
        aria-hidden="true"
      >
        <StorefrontArtwork item={{ ...item, availability: null }} />
        {soldOut ? <span className="cs-card__flag">Sold out</span> : null}
      </a>
      <div className="cs-card__body">
        <h3 className="cs-card__name">
          <a href={link}>{item.name}</a>
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
          <a
            className={buttonVariants({ variant: "outline" })}
            href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
          >
            Message on WhatsApp
          </a>
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
          <a href={href}>{item.name}</a>
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
      <a
        className={buttonVariants({
          variant: "outline",
          className: "cs-service__cta",
        })}
        href={href}
        aria-label={`Choose ${item.name}`}
      >
        Choose
      </a>
    </article>
  )
}

function Story({
  section,
  standalone,
}: { section: SectionInstance; standalone: boolean }) {
  const { snapshot } = useCommerceStudio()
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
  return (
    <section className="cs-section cs-story">
      <div className="cs-wrap cs-prose">
        <Heading className={cn("cs-title", standalone && "cs-title--page")}>
          {sectionText(section, "heading", "Our story")}
        </Heading>
        {body.split(/\n{2,}/).map((paragraph) => (
          <p key={paragraph.slice(0, 40)}>{paragraph}</p>
        ))}
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
  return (
    <section className="cs-section">
      <div className="cs-wrap cs-faq">
        <h2 className="cs-title">
          {sectionText(section, "heading", "How ordering works")}
        </h2>
        <Accordion className="cs-faq__list">
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
            <a
              className={buttonVariants({ className: "cs-primary" })}
              href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              <HugeiconsIcon icon={WhatsappIcon} strokeWidth={1.8} />
              Message on WhatsApp
            </a>
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
