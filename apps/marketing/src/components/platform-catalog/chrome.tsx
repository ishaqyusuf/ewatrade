import { platformInitials } from "@/lib/platform-catalog"
import Link from "next/link"
import { PlatformIcon } from "./icons"
import { ShareButton } from "./share-button"

/** The honest platform frame: this is not the merchant's own site. */
export function PlatformStrip() {
  return (
    <div className="pf">
      <div className="wrap pf-in">
        <a className="pf-mark" href="/">
          ẸwáTrade
        </a>
        <span className="pf-label">Business page</span>
      </div>
    </div>
  )
}

export function PlatformHeader({
  business,
  shareUrl,
  whatsAppUrl,
}: {
  business: { name: string; slug: string }
  shareUrl: string
  whatsAppUrl?: string | null
}) {
  return (
    <header className="top">
      <div className="wrap top-in">
        <Link
          className="brand"
          href={`/b/${encodeURIComponent(business.slug)}`}
          aria-label={`${business.name}, all products`}
        >
          <span className="mark" aria-hidden="true">
            {platformInitials(business.name)}
          </span>
          <span className="brand-name">{business.name}</span>
        </Link>
        <div className="top-actions">
          <ShareButton url={shareUrl} title={business.name} />
          {whatsAppUrl ? (
            <a
              className="btn btn-solid btn-sm"
              href={whatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <PlatformIcon name="wa" />
              <span>WhatsApp</span>
            </a>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export function PlatformFooter({
  business,
  url,
}: {
  business: { name: string }
  url: string
}) {
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <span>
          <span className="foot-name">{business.name}</span> ·{" "}
          {url.replace(/^https?:\/\//, "")}
        </span>
        <span className="foot-pf">
          Listed on <strong>ẸwáTrade</strong> ·{" "}
          <a className="link" href="/support">
            Report this page
          </a>
        </span>
      </div>
    </footer>
  )
}
