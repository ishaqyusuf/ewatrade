import type { ServiceCommercePublicEntryAction } from "@ewatrade/service-commerce"
import { getNameInitials } from "@ewatrade/utils"

type PublicRequestKind = "prescription" | "product_inquiry"

export function CustomerEntryCompatibility({
  actions,
  publicToken,
  requestKinds,
  storeName,
}: {
  actions: ServiceCommercePublicEntryAction[]
  publicToken: string
  requestKinds: PublicRequestKind[]
  storeName: string
}) {
  const encodedToken = encodeURIComponent(publicToken)
  const canRequest = actions.includes("request_online")
  const canChat = actions.includes("chat_on_whatsapp")
  const canRequestProduct = requestKinds.includes("product_inquiry")
  const canSubmitPrescription = requestKinds.includes("prescription")
  const hasOption =
    (canRequest && (canRequestProduct || canSubmitPrescription)) || canChat

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-customer-entry-mode="compatibility"
    >
      <header className="border-b border-border bg-card/70">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4 md:px-8">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            {getNameInitials(storeName)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{storeName}</span>
            <span className="block text-xs text-muted-foreground">
              Secure Store entry on EwaTrade
            </span>
          </span>
        </div>
      </header>

      <section className="mx-auto grid max-w-2xl gap-8 px-5 py-10 md:px-8 md:py-16">
        <div className="grid gap-3">
          <p className="text-sm font-medium text-primary">Current options</p>
          <h1 className="max-w-xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            What would you like to do?
          </h1>
          <p className="max-w-xl text-pretty text-sm leading-6 text-muted-foreground md:text-base">
            Choose an available way to contact {storeName}. The Store may ask
            for more details, confirm availability, arrange a booking, or send a
            Quote before an Order is created.
          </p>
        </div>

        <div className="grid overflow-hidden rounded-2xl border border-border bg-card">
          {canRequest && canRequestProduct ? (
            <EntryAction
              description="Describe the product you need securely on EwaTrade."
              href={`/request/${encodedToken}`}
              label="Request a product online"
              meta="Continue on web"
            />
          ) : null}
          {canRequest && canSubmitPrescription ? (
            <EntryAction
              description="Use the Pharmacy's secure clinical intake."
              href={`/r/${encodedToken}/prescription`}
              label="Send a prescription"
              meta="Continue securely"
            />
          ) : null}
          {canChat ? (
            <EntryAction
              description="Ask about a product through the Store's current WhatsApp sender."
              href={`/r/${encodedToken}/whatsapp?intent=product`}
              label="Ask on WhatsApp"
              meta="Open WhatsApp"
            />
          ) : null}
          {!hasOption ? (
            <div
              aria-labelledby="customer-entry-unavailable-title"
              className="grid gap-3 p-6"
            >
              <p
                className="font-semibold"
                id="customer-entry-unavailable-title"
              >
                Contact options are unavailable
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                This Store is not accepting online requests right now. Try this
                link again later or use contact details you already have.
              </p>
              <a
                className="mt-1 inline-flex min-h-11 w-fit items-center rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/r/${encodedToken}`}
              >
                Try again
              </a>
            </div>
          ) : null}
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          EwaTrade checks the Store&apos;s current channel and policy settings
          each time this link opens. The printed QR stays the same when those
          settings change.
        </p>
      </section>
    </main>
  )
}

function EntryAction({
  description,
  href,
  label,
  meta,
}: {
  description: string
  href: string
  label: string
  meta: string
}) {
  return (
    <a
      className="group grid min-h-28 grid-cols-[1fr_auto] items-center gap-5 border-b border-border p-5 text-left transition-colors last:border-b-0 hover:bg-muted/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:p-6"
      href={href}
    >
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="mt-1 block text-sm leading-6 text-muted-foreground">
          {description}
        </span>
        <span className="mt-3 block text-sm font-medium text-primary">
          {meta}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-full bg-primary/10 text-xl text-primary transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </a>
  )
}
