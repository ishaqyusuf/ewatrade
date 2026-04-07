const pillars = ["Operations", "Orders", "Catalog", "Dispatch visibility"]

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-between rounded-[2rem] border border-border/70 bg-surface/90 p-8 shadow-[0_30px_120px_rgba(45,31,14,0.08)] backdrop-blur md:p-12">
        <section className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-8">
            <div className="inline-flex items-center rounded-full border border-border bg-muted px-4 py-1 text-sm text-muted-foreground">
              Tenant dashboard surface
            </div>
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                ewatrade
              </p>
              <h1
                className="max-w-4xl text-5xl leading-none sm:text-6xl lg:text-7xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Merchant operations dashboards for orders, catalog, delivery,
                and tenant settings.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                This app is the dashboard surface and will resolve hostnames
                such as `tenant-dashboard.ewatrade.com` and
                `dashboard.tenant.com`.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {pillars.map((pillar) => (
              <div
                key={pillar}
                className="rounded-2xl border border-border/80 bg-background/70 p-4 text-sm text-foreground shadow-sm"
              >
                {pillar}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-4 border-t border-border/80 pt-8 text-sm text-muted-foreground md:grid-cols-3">
          <div>
            <p className="font-medium text-foreground">App</p>
            <p>`apps/dashboard` is the tenant operations control plane.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Shared styling</p>
            <p>
              `packages/ui` supplies the shared foundation for dashboard shells
              and controls.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Routing</p>
            <p>
              Dashboard hostnames remain distinct from storefront and POS
              hostnames.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
