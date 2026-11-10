import {
  PlatformFooter,
  PlatformHeader,
  PlatformStrip,
} from "@/components/platform-catalog/chrome"
import { PlatformIcon } from "@/components/platform-catalog/icons"
import { PlatformProductGrid } from "@/components/platform-catalog/product-card"
import {
  platformCatalogHref,
  platformOrigin,
  platformWhatsAppUrl,
} from "@/lib/platform-catalog"
import {
  catalogSearch,
  loadPlatformCatalog,
} from "@/lib/platform-catalog-server"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { slug } = await params
  const { q, category, after } = catalogSearch(await searchParams)
  const result = await loadPlatformCatalog(slug, q, category, after)
  if (result.status !== "available")
    return { title: "Business page · ẸwáTrade", robots: { index: false } }
  const { business } = result
  return {
    title: `${business.name} · ẸwáTrade`,
    description: business.description ?? `Products from ${business.name}.`,
    alternates: { canonical: `/b/${encodeURIComponent(business.slug)}` },
    openGraph: {
      title: business.name,
      description: business.description ?? undefined,
    },
    robots: q || category || after ? { index: false } : undefined,
  }
}

export default async function PlatformBusinessCatalogPage({
  params,
  searchParams,
}: Props) {
  const { slug } = await params
  const { q, category, after } = catalogSearch(await searchParams)
  const result = await loadPlatformCatalog(slug, q, category, after)
  if (result.status === "site") redirect(`https://${result.host}/`)
  if (result.status !== "available") notFound()
  const { business, items, categories } = result
  const pageUrl = `${platformOrigin(process.env)}/b/${encodeURIComponent(business.slug)}`
  const whatsAppUrl = platformWhatsAppUrl({
    phone: business.whatsAppPhone,
    intent: "business",
    businessName: business.name,
    pageUrl,
  })
  const filtered = Boolean(q?.trim() || result.category)
  return (
    <>
      <PlatformStrip />
      <PlatformHeader
        business={business}
        shareUrl={pageUrl}
        whatsAppUrl={whatsAppUrl}
      />
      <main className="wrap">
        <section className="hero">
          <h1>{business.name}</h1>
          {business.description ? (
            <p className="lede">{business.description}</p>
          ) : null}
        </section>
        <section className="catalog" aria-labelledby="cat-h">
          <h2 id="cat-h" className="cat-h">
            Products{" "}
            {filtered || result.nextCursor || after ? null : (
              <span className="cat-n">{items.length}</span>
            )}
          </h2>
          <div className="find">
            <form
              className="search"
              action={`/b/${encodeURIComponent(business.slug)}`}
            >
              <PlatformIcon name="search" />
              <label className="sr" htmlFor="pc-q">
                Search products
              </label>
              <input
                id="pc-q"
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder={`Search ${business.name}`}
                autoComplete="off"
                maxLength={120}
              />
              {result.category ? (
                <input type="hidden" name="category" value={result.category} />
              ) : null}
            </form>
            {categories.length ? (
              <nav className="chips" aria-label="Collections">
                <Link
                  className="chip"
                  href={platformCatalogHref(business.slug, { q })}
                  aria-current={!result.category}
                >
                  All
                </Link>
                {categories.map((entry) => (
                  <Link
                    key={entry.id}
                    className="chip"
                    href={platformCatalogHref(business.slug, {
                      q,
                      category: entry.id,
                    })}
                    aria-current={result.category === entry.id}
                  >
                    {entry.name}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
          {items.length ? (
            <PlatformProductGrid slug={business.slug} items={items} />
          ) : (
            <div className="no-results">
              <h3>
                {filtered
                  ? `No products match “${q?.trim() || "this collection"}”`
                  : "New products are on the way"}
              </h3>
              <p>
                {filtered
                  ? `Try another word, or ask ${business.name} on WhatsApp.`
                  : `${business.name} is adding products. Check back soon.`}
              </p>
              {filtered ? (
                <Link
                  className="btn btn-line"
                  href={platformCatalogHref(business.slug, {})}
                >
                  Clear search
                </Link>
              ) : null}
            </div>
          )}
          {result.nextCursor || after ? (
            <div className="pager">
              {result.nextCursor ? (
                <Link
                  className="btn btn-line"
                  href={platformCatalogHref(business.slug, {
                    q,
                    category: result.category,
                    after: result.nextCursor,
                  })}
                >
                  More products
                </Link>
              ) : null}
              {after ? (
                <Link
                  className="pager-back"
                  href={platformCatalogHref(business.slug, {
                    q,
                    category: result.category,
                  })}
                >
                  Back to the first page
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>
      <PlatformFooter business={business} url={pageUrl} />
    </>
  )
}
