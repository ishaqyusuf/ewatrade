import {
  PlatformFooter,
  PlatformHeader,
  PlatformStrip,
} from "@/components/platform-catalog/chrome"
import { PlatformIcon } from "@/components/platform-catalog/icons"
import { PlatformProductBuy } from "@/components/platform-catalog/product-buy"
import { PlatformProductGrid } from "@/components/platform-catalog/product-card"
import { PlatformGallery } from "@/components/platform-catalog/product-gallery"
import { PlatformTile } from "@/components/platform-catalog/tile"
import { platformCatalogHref, platformOrigin } from "@/lib/platform-catalog"
import { loadPlatformCatalog } from "@/lib/platform-catalog-server"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ slug: string; productId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productId } = await params
  const result = await loadPlatformCatalog(
    slug,
    undefined,
    undefined,
    undefined,
    productId,
  )
  const item = result.status === "available" ? result.highlightedItem : null
  if (result.status !== "available" || !item)
    return { title: "Product · ẸwáTrade", robots: { index: false } }
  return {
    title: `${item.name} · ${result.business.name}`,
    description:
      item.description ?? `${item.name} from ${result.business.name}.`,
    alternates: {
      canonical: `/b/${encodeURIComponent(result.business.slug)}/p/${encodeURIComponent(item.id)}`,
    },
    openGraph: {
      title: `${item.name} · ${result.business.name}`,
      description: item.description ?? undefined,
    },
  }
}

export default async function PlatformProductPage({ params }: Props) {
  const { slug, productId } = await params
  const result = await loadPlatformCatalog(
    slug,
    undefined,
    undefined,
    undefined,
    productId,
  )
  // A live Site owns its products; `/?item=` is the storefront's item deep link.
  if (result.status === "site")
    redirect(`https://${result.host}/?item=${encodeURIComponent(productId)}`)
  if (result.status !== "available") notFound()
  const { business, highlightedItem: item } = result
  const catalogUrl = `${platformOrigin(process.env)}/b/${encodeURIComponent(business.slug)}`
  const more = result.items.filter((entry) => entry.id !== item?.id).slice(0, 4)
  const header = (
    <>
      <PlatformStrip />
      <PlatformHeader
        business={business}
        shareUrl={
          item ? `${catalogUrl}/p/${encodeURIComponent(item.id)}` : catalogUrl
        }
      />
    </>
  )
  const moreSection = more.length ? (
    <section className="more" aria-labelledby="more-h">
      <h2 id="more-h" className="cat-h">
        More from {business.name}
      </h2>
      <PlatformProductGrid slug={business.slug} items={more} />
      <div className="pager">
        <Link
          className="btn btn-line"
          href={platformCatalogHref(business.slug, {})}
        >
          See all products
        </Link>
      </div>
    </section>
  ) : null

  if (!item)
    return (
      <>
        {header}
        <main className="wrap">
          <section className="gone">
            <h1>This product isn’t available</h1>
            <p>{business.name} may have removed it or stopped listing it.</p>
            <Link
              className="btn btn-solid"
              href={platformCatalogHref(business.slug, {})}
            >
              See all products
            </Link>
          </section>
          {moreSection}
        </main>
        <PlatformFooter business={business} url={catalogUrl} />
      </>
    )

  const pageUrl = `${catalogUrl}/p/${encodeURIComponent(item.id)}`
  return (
    <>
      {header}
      <main className="wrap pd">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href={platformCatalogHref(business.slug, {})}>
            <PlatformIcon name="back" />
            <span>All products</span>
          </Link>
        </nav>
        <div className="pd-grid">
          <PlatformGallery
            item={item}
            artwork={
              <PlatformTile item={item} className="pd-main" tag={false} />
            }
          />
          <div className="pd-info">
            {item.category ? (
              <Link
                className="pd-col"
                href={platformCatalogHref(business.slug, {
                  category: item.category.id,
                })}
              >
                {item.category.name}
              </Link>
            ) : null}
            <h1>{item.name}</h1>
            <PlatformProductBuy
              item={item}
              business={business}
              pageUrl={pageUrl}
            />
            {item.description ? (
              <div className="pd-about">
                <h2 className="pd-h">About this product</h2>
                <p>{item.description}</p>
              </div>
            ) : null}
          </div>
        </div>
        {moreSection}
      </main>
      <PlatformFooter business={business} url={catalogUrl} />
    </>
  )
}
