import { prisma } from "@ewatrade/db"
import {
  RetailOpsServiceOperationsError,
  getPublicRetailOpsServiceTracking,
} from "@ewatrade/db/queries"
import { formatMinorMoney } from "@ewatrade/utils"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

type ServiceTrackingPageProps = {
  params: Promise<{ token: string }>
}

export const dynamic = "force-dynamic"

const statusLabels = {
  cancelled: "Cancelled",
  completed: "Completed",
  in_progress: "In progress",
  ready: "Ready",
  received: "Received",
} as const

async function resolveJob(token: string) {
  try {
    return await getPublicRetailOpsServiceTracking(prisma, {
      trackingToken: token,
    })
  } catch (error) {
    if (error instanceof RetailOpsServiceOperationsError) notFound()
    throw error
  }
}

export async function generateMetadata({
  params,
}: ServiceTrackingPageProps): Promise<Metadata> {
  const { token } = await params
  const job = await resolveJob(token)

  return {
    title: `${job.reference} service tracking | ewatrade`,
    description: `Track the status of service job ${job.reference}.`,
  }
}

export default async function ServiceTrackingPage({
  params,
}: ServiceTrackingPageProps) {
  const { token } = await params
  const job = await resolveJob(token)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-border border-b bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
          <p className="text-sm text-muted-foreground">
            {job.business.name} / Service tracking
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">
            {job.reference}
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Current status:{" "}
            <span className="font-medium text-foreground">
              {statusLabels[job.status]}
            </span>
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-3xl gap-6 px-5 py-10 md:px-8">
        <div className="grid gap-4 rounded-lg border border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Services
              </p>
              <p className="mt-2 font-medium">
                {job.items
                  .map(
                    (line) =>
                      `${line.itemName}${line.variantName ? ` (${line.variantName})` : ""} × ${line.quantity}${line.cancelled ? " (cancelled)" : ""}`,
                  )
                  .join(", ")}
              </p>
            </div>
            <p className="font-semibold">
              {formatMinorMoney(
                job.payment.totalMinor,
                job.payment.currencyCode,
              )}
            </p>
          </div>
          <div className="border-border border-t pt-4 text-sm text-muted-foreground">
            Due:{" "}
            {job.dueAt
              ? new Intl.DateTimeFormat("en-NG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(job.dueAt))
              : "The business will confirm the due date"}
            <span className="mx-2">·</span>
            Payment: {job.payment.status.toLowerCase().replaceAll("_", " ")}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">Pickup or delivery</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {job.guidance}
          </p>
        </div>

        <div className="grid gap-4 rounded-lg border border-border p-5">
          <h2 className="text-lg font-semibold">Progress</h2>
          {job.timeline.map((event) => (
            <div
              key={`${event.happenedAt}:${event.type}`}
              className="grid grid-cols-[12px_1fr] gap-3 border-border border-b pb-4 last:border-0 last:pb-0"
            >
              <span className="mt-1 size-3 rounded-full bg-primary" />
              <div>
                <p className="text-sm font-medium">
                  {event.status
                    ? statusLabels[event.status]
                    : event.type.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("en-NG", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.happenedAt))}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
