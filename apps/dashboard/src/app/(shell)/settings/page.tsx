import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

export default async function SettingsPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null

  if (!session || !ctx) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0]

  return (
    <div className="grid gap-6 p-6 lg:p-8">
      <header>
        <p className="text-sm text-muted-foreground">{ctx.tenant.name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          General settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the business identity used across your dashboard and
          storefront.
        </p>
      </header>
      <section className="max-w-2xl rounded-xl border border-border bg-background p-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">
              Business
            </dt>
            <dd className="mt-1 font-medium">{ctx.tenant.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">
              Active store
            </dt>
            <dd className="mt-1 font-medium">{store?.name ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">
              Owner account
            </dt>
            <dd className="mt-1 font-medium">{session.user.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted-foreground">
              Currency
            </dt>
            <dd className="mt-1 font-medium">
              {store?.currencyCode ?? ctx.tenant.currencyCode}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
