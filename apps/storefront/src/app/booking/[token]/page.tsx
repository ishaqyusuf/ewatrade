import type { Metadata } from "next"

import { trpc } from "@/trpc/server"
import { BookingClient } from "./booking-client"
import {
  publicBookingWindow,
  publicBookingWindowStart,
} from "./booking-public-state"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Book an appointment | EwaTrade",
}

async function loadSlots(accessToken: string, from: Date, to: Date) {
  return trpc.serviceCommerce.publicBookingSlots.query({
    accessToken,
    from,
    to,
  })
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const query = await searchParams
  const now = new Date()
  const from = publicBookingWindowStart(query.from, now)
  const window = publicBookingWindow(from, now)
  // These reads share the same capability and authorization path. Keep them
  // ordered so a managed booking does not race its availability projection on
  // database adapters that serialize one connection.
  const booking = await trpc.serviceCommerce.publicBooking
    .query({ accessToken: token })
    .catch(() => null)
  const availability = await loadSlots(token, from, window.to).catch(() => null)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto grid max-w-2xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <header className="grid gap-2">
          <p className="text-sm text-muted-foreground">Appointment booking</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Choose a time that works for you
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
            Your appointment is only confirmed after the final confirmation
            step.
          </p>
        </header>
        {booking ? (
          <BookingClient
            accessToken={token}
            booking={booking}
            configurationRevision={
              availability?.configurationRevision ?? booking.revision
            }
            nextHref={`/booking/${encodeURIComponent(token)}?from=${encodeURIComponent(window.next.toISOString())}`}
            offeringId={availability?.offeringId ?? ""}
            previousHref={
              from.getTime() > now.getTime()
                ? `/booking/${encodeURIComponent(token)}?from=${encodeURIComponent(window.previous.toISOString())}`
                : null
            }
            slots={availability?.slots ?? []}
            timezone={booking.timezone}
          />
        ) : availability ? (
          <BookingClient
            accessToken={token}
            configurationRevision={availability.configurationRevision}
            nextHref={`/booking/${encodeURIComponent(token)}?from=${encodeURIComponent(window.next.toISOString())}`}
            offeringId={availability.offeringId}
            previousHref={
              from.getTime() > now.getTime()
                ? `/booking/${encodeURIComponent(token)}?from=${encodeURIComponent(window.previous.toISOString())}`
                : null
            }
            slots={availability.slots}
            timezone={availability.timezone}
          />
        ) : (
          <section className="grid gap-3 rounded-xl border border-border bg-muted/40 p-5">
            <h2 className="font-semibold">Booking is unavailable</h2>
            <p className="text-sm text-muted-foreground">
              This link may have expired or availability is being updated.
              Return to the business&apos;s current booking link and try again.
            </p>
            <a
              className="min-h-11 w-fit rounded-lg border border-border px-4 py-3 text-sm font-medium"
              href={`/booking/${encodeURIComponent(token)}`}
            >
              Retry booking
            </a>
          </section>
        )}
      </section>
    </main>
  )
}
