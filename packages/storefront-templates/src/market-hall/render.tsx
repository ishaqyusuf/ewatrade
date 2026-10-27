"use client"

import {
  handleStorefrontItemClick,
  storefrontItemHref,
} from "@ewatrade/storefront-runtime/links"

import {
  StorefrontArtwork,
  StorefrontPrice,
  availabilityLabel,
  formatStorefrontPrice,
} from "@ewatrade/storefront-runtime/primitives"
import {
  useStorefrontAction,
  useStorefrontCatalog,
  useStorefrontContext,
} from "@ewatrade/storefront-runtime/react"
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  FieldLegend,
  FieldSet,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Separator,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from "@ewatrade/ui"
import Link from "next/link"
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import type { SectionInstance } from "../../../storefront-contracts/src/manifest"
import type { PublicCatalogItem } from "../../../storefront-contracts/src/resources"
import { CatalogListingControls } from "../shared/catalog-controls"
import {
  LISTING_NO_RESULTS,
  catalogListingFiltered,
  catalogListingHref,
  catalogListingQuery,
} from "../shared/catalog-listing"
import { TemplateActions, useCommerceDetail } from "../shared/commerce"

type Copy = (field: string, fallback?: string, multiline?: boolean) => ReactNode

/** Products lead the floor; services move to the counter. A service-only page puts services on the floor. */
export function marketHallSplit(items: readonly PublicCatalogItem[]) {
  const products = items.filter((item) => item.kind === "PRODUCT")
  const services = items.filter((item) => item.kind === "SERVICE")
  return products.length
    ? { floor: products, counter: services }
    : { floor: services, counter: [] }
}

/** Deterministic plinth pick from the loaded page: in stock with a photo, then in stock, then first. */
export function marketHallFeature(items: readonly PublicCatalogItem[]) {
  return (
    items.find(
      (item) => item.photoUrl && item.availability !== "OUT_OF_STOCK",
    ) ??
    items.find((item) => item.availability !== "OUT_OF_STOCK") ??
    items[0] ??
    null
  )
}

type Detail = ReturnType<typeof useCommerceDetail> & { linkable: boolean }
const DetailContext = createContext<Detail | null>(null)

/**
 * One detail Sheet per page. `syncUrl` is set only by the storefront host: opening details pushes
 * ?item= so Back closes the Sheet. Embedded previews never touch the host URL.
 */
export function MarketHallDetail({
  domain,
  deepLink,
  syncUrl,
  children,
}: {
  domain: string
  deepLink: boolean
  syncUrl: boolean
  children: ReactNode
}) {
  const catalog = useStorefrontCatalog()
  const detail = useCommerceDetail({
    domain,
    initial: deepLink ? catalog.highlightedItem : null,
    history: syncUrl ? "push" : "none",
  })
  return (
    <DetailContext.Provider value={{ ...detail, linkable: syncUrl }}>
      {children}
      <ItemSheet detail={detail} domain={domain} />
    </DetailContext.Provider>
  )
}

function useChatAvailable() {
  const action = useStorefrontAction()
  return (item: PublicCatalogItem) =>
    action.allowed({ type: "openConversation" }) ||
    action.allowed({ type: "whatsappEnquiry", itemId: item.id })
}

/** Vertical collection tabs only when the storefront container is wide enough for the aside. */
function useWide<T extends HTMLElement>(minWidth: number) {
  const ref = useRef<T>(null)
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const element = ref.current
    const target = element?.closest<HTMLElement>(".cv-site") ?? element
    if (!target) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWide(entry.contentRect.width >= minWidth)
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [minWidth])
  return [ref, wide] as const
}

/** Names and artwork share the existing detail action and real public URL. */
function ItemDetailLink({
  item,
  children,
  className = "",
}: {
  item: PublicCatalogItem
  children: ReactNode
  className?: string
}) {
  const detail = useContext(DetailContext)
  const label = `${item.kind === "SERVICE" ? "View service" : "View details"}: ${item.name}`
  const classes = `mh-detail-link ${className}`
  return detail?.linkable ? (
    <a
      href={storefrontItemHref(item.id)}
      className={classes}
      aria-label={label}
      onClick={(event) =>
        handleStorefrontItemClick(event, () =>
          detail.open(item, event.currentTarget),
        )
      }
    >
      {children}
    </a>
  ) : (
    <button
      type="button"
      className={classes}
      aria-label={label}
      onClick={(event) => detail?.open(item, event.currentTarget)}
    >
      {children}
    </button>
  )
}

function BoardRow({ item }: { item: PublicCatalogItem }) {
  const detail = useContext(DetailContext)
  const chat = useChatAvailable()
  const meta = [item.category?.name, availabilityLabel(item.availability)]
    .filter(Boolean)
    .join(" · ")
  return (
    <Item
      size="sm"
      className="mh-row"
      render={
        detail?.linkable ? (
          // biome-ignore lint/a11y/useAnchorContent: Item renders the row content into this anchor.
          // biome-ignore lint/a11y/useAnchorContent: Button renders its visible children into this anchor.
          <a href={storefrontItemHref(item.id)} />
        ) : (
          <button type="button" />
        )
      }
      onClick={(event) => {
        if (detail?.linkable)
          handleStorefrontItemClick(event, () =>
            detail.open(item, event.currentTarget),
          )
        else detail?.open(item, event.currentTarget)
      }}
    >
      <ItemMedia variant="image" className="mh-thumb">
        <StorefrontArtwork item={item} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{item.name}</ItemTitle>
        {meta ? <ItemDescription>{meta}</ItemDescription> : null}
      </ItemContent>
      <ItemActions>
        <StorefrontPrice item={item} chatAvailable={chat(item)} />
      </ItemActions>
    </Item>
  )
}

export function MarketHallFloor({
  section,
  copy,
  after,
  editing = false,
}: {
  section: SectionInstance
  copy: Copy
  after?: string
  editing?: boolean
}) {
  const catalog = useStorefrontCatalog()
  const { business } = useStorefrontContext()
  const detail = useContext(DetailContext)
  const chat = useChatAvailable()
  const ids = useId()
  const [root, wide] = useWide<HTMLDivElement>(960)
  const { floor } = marketHallSplit(catalog.items)
  const feature = marketHallFeature(floor)
  const query = catalogListingQuery(catalog.query)
  const filtered = catalogListingFiltered(query)
  const active = catalog.category ?? "all"
  const showCategories =
    section.settings["show-categories"] === true &&
    catalog.categories.length > 1
  const tab = (value: string, label: ReactNode, href: string) => (
    <TabsTrigger
      key={value}
      value={value}
      nativeButton={false}
      render={<Link prefetch={false} scroll={false} href={href} />}
    >
      {label}
    </TabsTrigger>
  )
  return (
    <div className="mh-hall" ref={root}>
      <Tabs
        className="mh-hall-grid"
        value={active}
        orientation={wide ? "vertical" : "horizontal"}
      >
        <div className="mh-aside">
          <h1 className="mh-title">{copy("headline", business.name)}</h1>
          {section.settings.tagline || business.description || editing ? (
            <p className="mh-lede">
              {copy("tagline", business.description ?? "", true)}
            </p>
          ) : null}
          {showCategories ? (
            <TabsList aria-label="Categories" className="mh-tabs">
              {tab(
                "all",
                copy("all-label", "All items"),
                catalogListingHref(null, null, query),
              )}
              {catalog.categories.map((category) =>
                tab(
                  category.id,
                  category.name,
                  catalogListingHref(category.id, null, query),
                ),
              )}
            </TabsList>
          ) : null}
          {catalog.items.length || filtered || query.sort || after ? (
            <CatalogListingControls
              category={catalog.category}
              query={query}
              stacked={wide}
            />
          ) : null}
        </div>
        <TabsContent value={active} className="mh-floor">
          {feature ? (
            <>
              <article
                key={feature.id}
                className="mh-plinth"
                aria-labelledby={`${ids}-feature`}
              >
                <ItemDetailLink item={feature} className="mh-plinth-art">
                  <StorefrontArtwork item={feature} />
                </ItemDetailLink>
                <div className="mh-plinth-body">
                  <h2 id={`${ids}-feature`}>
                    <ItemDetailLink item={feature} className="mh-name-link">
                      {feature.name}
                    </ItemDetailLink>
                  </h2>
                  <div className="mh-plinth-meta">
                    <StorefrontPrice
                      item={feature}
                      chatAvailable={chat(feature)}
                    />
                    {feature.category ? (
                      <span>{feature.category.name}</span>
                    ) : null}
                  </div>
                  {feature.description ? (
                    <p className="mh-plinth-copy">{feature.description}</p>
                  ) : null}
                  <Button
                    size="lg"
                    render={
                      detail?.linkable ? (
                        // biome-ignore lint/a11y/useAnchorContent: Button renders its visible children into this anchor.
                        <a href={storefrontItemHref(feature.id)} />
                      ) : undefined
                    }
                    onClick={(event) =>
                      detail?.linkable
                        ? handleStorefrontItemClick(event, () =>
                            detail.open(feature, event.currentTarget),
                          )
                        : detail?.open(feature, event.currentTarget)
                    }
                  >
                    {feature.kind === "SERVICE"
                      ? "View service"
                      : "View details"}
                  </Button>
                </div>
              </article>
              <section className="mh-board" aria-labelledby={`${ids}-board`}>
                <h3 id={`${ids}-board`}>{copy("board-heading")}</h3>
                <ul className="mh-board-list">
                  {floor.map((item) => (
                    <li key={item.id}>
                      <BoardRow item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : filtered ? (
            <Empty className="mh-empty">
              <EmptyHeader>
                <EmptyTitle>{LISTING_NO_RESULTS.title}</EmptyTitle>
                <EmptyDescription>
                  {LISTING_NO_RESULTS.description}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link
                      prefetch={false}
                      scroll={false}
                      href={catalogListingHref(catalog.category)}
                    />
                  }
                >
                  {LISTING_NO_RESULTS.reset}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Empty className="mh-empty">
              <EmptyHeader>
                <EmptyTitle>
                  {catalog.category
                    ? "Nothing in this category yet"
                    : "The collection is being prepared"}
                </EmptyTitle>
                <EmptyDescription>
                  {catalog.category
                    ? "Try another category to see what's available."
                    : `Check back for ${business.name}'s latest items.`}
                </EmptyDescription>
              </EmptyHeader>
              {catalog.category || after ? (
                <EmptyContent>
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link prefetch={false} href="/" />}
                  >
                    Show all items
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          )}
        </TabsContent>
      </Tabs>
      {catalog.hasHiddenItems ? (
        <p className="mh-help">A selection of this shop’s items is shown.</p>
      ) : null}
      {catalog.nextCursor || after ? (
        <nav className="mh-pagination" aria-label="More items">
          {catalog.nextCursor ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  prefetch={false}
                  href={catalogListingHref(
                    catalog.category,
                    catalog.nextCursor,
                    query,
                  )}
                />
              }
            >
              Show more
            </Button>
          ) : null}
          {after ? (
            <Button
              variant="ghost"
              nativeButton={false}
              render={
                <Link
                  prefetch={false}
                  href={catalogListingHref(catalog.category, null, query)}
                />
              }
            >
              Back to start
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  )
}

export function MarketHallCounter({
  section,
  copy,
  editing = false,
}: {
  section: SectionInstance
  copy: Copy
  editing?: boolean
}) {
  const catalog = useStorefrontCatalog()
  const chat = useChatAvailable()
  const { counter } = marketHallSplit(catalog.items)
  return (
    <div className="mh-counter">
      <div className="mh-counter-head">
        <h2>{copy("heading")}</h2>
        {section.settings.tagline || editing ? (
          <p>
            {copy("tagline", editing ? "Describe your services…" : "", true)}
          </p>
        ) : null}
      </div>
      {counter.length ? (
        <ul className="mh-counter-list">
          {counter.map((item) => (
            <li key={item.id}>
              <Separator />
              <h3>
                <ItemDetailLink
                  item={item}
                  className="mh-name-link mh-detail-cue"
                >
                  {item.name}
                </ItemDetailLink>
              </h3>
              {item.description ? (
                <p className="mh-counter-copy">{item.description}</p>
              ) : null}
              <div className="mh-counter-row">
                <StorefrontPrice item={item} chatAvailable={chat(item)} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mh-help">
          Listed services appear here when products lead the collection.
        </p>
      )}
    </div>
  )
}

function ItemSheet({
  detail,
  domain,
}: {
  detail: ReturnType<typeof useCommerceDetail>
  domain: string
}) {
  const { mode } = useStorefrontContext()
  const chat = useChatAvailable()
  const {
    selected,
    options,
    currentOption,
    setOptionId,
    close,
    requestAction,
    itemAction,
    action,
  } = detail
  const enquiryAction =
    itemAction ??
    (action.allowed({ type: "openConversation" })
      ? { type: "openConversation" as const }
      : null)
  const priced = currentOption ?? selected
  const price = !priced
    ? ""
    : priced.priceMinor === null
      ? selected && chat(selected)
        ? "Ask for price"
        : "Price not listed"
      : `${!currentOption && selected?.isFromPrice ? "From " : ""}${formatStorefrontPrice(priced.priceMinor, priced.currencyCode)}`
  const status = availabilityLabel(
    currentOption?.availability ?? selected?.availability,
  )
  return (
    <Sheet
      open={!!selected}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <SheetContent side="right" className="mh-sheet">
        {selected ? (
          <>
            <SheetHeader className="mh-sheet-head">
              <SheetTitle className="mh-sheet-title">
                {selected.name}
              </SheetTitle>
              <SheetDescription className="mh-sheet-summary">
                {selected.description ??
                  "View the listed price and available options."}
              </SheetDescription>
            </SheetHeader>
            <div className="mh-sheet-scroll">
              <div className="mh-sheet-art">
                <StorefrontArtwork item={selected} />
              </div>
              <p className="mh-sheet-price">
                <span className="mh-price">{price}</span>
                {currentOption && options.length === 1 ? (
                  <span>{currentOption.name}</span>
                ) : null}
              </p>
              {options.length > 1 ? (
                <FieldSet className="mh-options">
                  <FieldLegend variant="label">Option</FieldLegend>
                  <ToggleGroup
                    className="mh-options-group"
                    variant="outline"
                    orientation="vertical"
                    aria-label={`${selected.name} options`}
                    value={currentOption ? [currentOption.id] : []}
                    onValueChange={(next) => {
                      // Single choice: re-pressing the active option yields an empty array.
                      if (next[0]) setOptionId(next[0])
                    }}
                  >
                    {options.map((option) => (
                      <ToggleGroupItem key={option.id} value={option.id}>
                        <span>{option.name}</span>
                        <span className="mh-price">
                          {option.availability === "OUT_OF_STOCK"
                            ? "Out of stock"
                            : option.priceMinor === null
                              ? "Price not listed"
                              : formatStorefrontPrice(
                                  option.priceMinor,
                                  option.currencyCode,
                                )}
                        </span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>
              ) : null}
              {selected.category || status ? (
                <dl className="mh-specs">
                  {selected.category ? (
                    <div>
                      <dt>Category</dt>
                      <dd>{selected.category.name}</dd>
                    </div>
                  ) : null}
                  {status ? (
                    <div>
                      <dt>Availability</dt>
                      <dd>{status}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              {selected.kind === "SERVICE" ? (
                <p className="mh-help">
                  Continuing does not book a time or place an order.
                </p>
              ) : null}
              {!requestAction && !enquiryAction ? (
                <p className="mh-help">
                  Customer requests and messaging are unavailable for this
                  offering.
                </p>
              ) : null}
              {mode === "preview" ? (
                <p className="mh-help">Private preview. Nothing is sent.</p>
              ) : null}
              <TemplateActions
                key={selected.id}
                domain={domain}
                item={selected}
                selectedOptions={detail.selectedOptions}
              />
              {action.notice ? (
                <output className="mh-help">{action.notice}</output>
              ) : null}
            </div>
            <SheetFooter className="mh-sheet-actions">
              <SheetClose render={<Button variant="outline" />}>
                Close
              </SheetClose>
              {enquiryAction ? (
                <Button
                  variant={requestAction ? "outline" : "default"}
                  disabled={action.busy}
                  onClick={() => void action.run(enquiryAction)}
                >
                  {enquiryAction.type === "openConversation"
                    ? "Message business"
                    : selected.kind === "SERVICE"
                      ? "Ask about this service"
                      : "Ask about this item"}
                </Button>
              ) : null}
              {requestAction ? (
                <Button
                  disabled={
                    action.busy ||
                    currentOption?.availability === "OUT_OF_STOCK"
                  }
                  onClick={() => void action.run(requestAction)}
                >
                  Continue to request
                </Button>
              ) : null}
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
