import Link from "next/link"

export function SupportContactPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground sm:px-8 sm:py-20">
      <div className="mx-auto max-w-3xl space-y-10">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
        >
          EwaTrade home
        </Link>
        <header className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            EwaTrade support
          </p>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
            How can we help?
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            For account access, software billing or concerns about misuse of the
            platform, email the EwaTrade team.
          </p>
        </header>
        <section className="space-y-4 border-t border-border pt-8">
          <h2 className="text-xl font-semibold">Email support</h2>
          <a
            href="mailto:support@ewatrade.com"
            className="inline-flex min-h-11 items-center break-all text-lg font-semibold underline underline-offset-4"
          >
            support@ewatrade.com
          </a>
          <p className="text-base leading-7 text-muted-foreground">
            Include a short description of the issue and any error reference you
            received. Do not send passwords, one-time codes, full payment card
            details or prescription documents.
          </p>
        </section>
        <section className="space-y-4 border-t border-border pt-8">
          <h2 className="text-xl font-semibold">Orders and services</h2>
          <p className="text-base leading-7 text-muted-foreground">
            For a purchase, delivery, pickup, refund or appointment, contact the
            seller shown in your transaction. EwaTrade support can help with
            access to the platform itself.
          </p>
        </section>
      </div>
    </main>
  )
}
