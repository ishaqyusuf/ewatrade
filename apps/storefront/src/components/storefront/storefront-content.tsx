import type { getPublicStorefront } from "@ewatrade/db/queries"
import { Button, Card, CardContent, CardHeader, CardTitle } from "@ewatrade/ui"
import { getCatalogIllustrationSvg } from "@ewatrade/utils/catalog-illustration-artwork"
import Link from "next/link"

type Storefront = NonNullable<Awaited<ReturnType<typeof getPublicStorefront>>>
export function StorefrontContent({ store }: { store: Storefront }) {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10 lg:px-16">
      <header className="space-y-6 border-b border-border pb-10">
        <p className="text-sm font-medium text-muted-foreground">
          {store.slug}.ewatrade.com
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {store.name}
        </h1>
        {store.description ? (
          <p className="max-w-2xl whitespace-pre-wrap text-base leading-7 text-muted-foreground">
            {store.description}
          </p>
        ) : null}
        {store.chatToken ? (
          <Button
            render={<Link href={`/r/${encodeURIComponent(store.chatToken)}`} />}
          >
            Message this store
          </Button>
        ) : null}
      </header>
      <section aria-label="Products and services" className="py-10">
        <h2 className="mb-6 text-xl font-semibold">What we offer</h2>
        {store.items.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {store.items.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CatalogPicture id={item.illustrationId} />
                  <CardTitle>{item.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {item.kind === "SERVICE" ? "Service" : "Product"}
                  </p>
                  {item.priceMinor !== null ? (
                    <p className="mt-2 font-semibold">
                      {new Intl.NumberFormat("en-NG", {
                        style: "currency",
                        currency: item.currencyCode,
                      }).format(item.priceMinor / 100)}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-border bg-card p-8 text-muted-foreground">
            We’re getting our products and services ready. Check back soon.
          </p>
        )}
        {store.hasHiddenItems ? (
          <p className="mt-8 text-sm text-muted-foreground">
            More items coming soon.
          </p>
        ) : null}
        {store.nextCursor ? (
          <div className="mt-8">
            <Button
              variant="outline"
              render={
                <Link href={`?after=${encodeURIComponent(store.nextCursor)}`} />
              }
            >
              More products and services
            </Button>
          </div>
        ) : null}
      </section>
      <footer className="border-t border-border py-6 text-sm text-muted-foreground">
        Powered by ẸwáTrade
      </footer>
    </main>
  )
}
function CatalogPicture({ id }: { id: string }) {
  const svg = getCatalogIllustrationSvg(id, {
    ink: "var(--foreground)",
    fill: "var(--muted)",
    accent: "var(--primary)",
    highlight: "var(--accent)",
  })
  return svg ? (
    <div
      aria-hidden="true"
      className="mb-4 flex h-36 items-center justify-center rounded-2xl bg-muted [&_svg]:size-28"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Only bundled allowlisted SVG with fixed semantic paints; no merchant markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ) : null
}
