"use client"

import { StorefrontAttribution } from "@ewatrade/storefront-runtime/primitives"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import { Button, Toaster, buttonVariants } from "@ewatrade/ui"
import {
  ArrowRight01Icon,
  ShoppingBag01Icon,
  UserIcon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"
import { BagSheet } from "./bag"
import { bagTotals, formatMoney } from "./commerce"
import { commerceThemeStyle, sectionText, useCommerceStudio } from "./context"
import { CommerceLink } from "./navigation"

const pagePath: Record<string, string> = {
  home: "/",
  shop: "/shop",
  services: "/services",
  about: "/about",
}

export function CommerceStudioShell({
  children,
  current = "home",
  routeKind = "page",
}: { children: ReactNode; current?: string; routeKind?: string }) {
  const { snapshot, preview } = useCommerceStudio()
  const theme = snapshot.composition.theme
  return (
    <div
      className="cs-store"
      data-preview={preview || undefined}
      data-font={theme.font}
      data-density={theme.density ?? "comfortable"}
      data-page={routeKind === "page" ? current : routeKind}
      style={commerceThemeStyle(theme)}
    >
      {snapshot.mode === "preview" && !preview ? (
        <aside className="cs-qa-banner" aria-label="Preview notice">
          Local QA preview · test data · requests are saved to the QA database
          and no messages are sent
        </aside>
      ) : null}
      <StoreHeader current={current} />
      <main id="cs-main" className="cs-main" tabIndex={-1}>
        {children}
      </main>
      <StoreFooter />
      <BagDock hidden={routeKind === "checkout"} />
      <BagSheet />
      {preview ? null : <Toaster position="top-center" />}
    </div>
  )
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
      <CommerceLink className="cs-skip" href="#cs-main">
        Skip to content
      </CommerceLink>
      <div className="cs-wrap cs-header__row">
        <CommerceLink
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
        </CommerceLink>
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
              <CommerceLink
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
              </CommerceLink>
            )
          })}
        </nav>
        <div className="cs-header__actions">
          {accounts ? (
            <CommerceLink
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
            </CommerceLink>
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
                  <CommerceLink href={href("/shop")}>Shop</CommerceLink>
                </li>
              ) : null}
              {facts.services ? (
                <li>
                  <CommerceLink href={href("/services")}>Services</CommerceLink>
                </li>
              ) : null}
              {aboutHasContent(snapshot, header) ? (
                <li>
                  <CommerceLink href={href("/about")}>Our story</CommerceLink>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
        {whatsapp || facts.products || facts.services ? (
          <div>
            <h2 className="cs-footer__head">Talk to us</h2>
            {whatsapp ? (
              <CommerceLink
                className="cs-link"
                href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                Message on WhatsApp
              </CommerceLink>
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
