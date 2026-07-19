import { prisma } from "@ewatrade/db"
import { CatalogError, getPublicServiceTracking } from "@ewatrade/db/queries"
import { notFound } from "next/navigation"

import { publicServiceDetail } from "@/lib/service-display"

export const dynamic = "force-dynamic"

async function load(token: string) {
  try {
    return await getPublicServiceTracking(prisma, { trackingToken: token })
  } catch (error) {
    if (error instanceof CatalogError) notFound()
    throw error
  }
}

function label(value: string) {
  return value.replaceAll("_", " ")
}

export default async function Page({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const job = await load(token)
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
          <p className="text-sm text-muted-foreground">Service tracking</p>
          <h1 className="mt-3 text-4xl font-semibold">{job.orderNumber}</h1>
          <p className="mt-3 capitalize text-muted-foreground">
            {label(job.milestone)}
          </p>
        </div>
      </section>
      <section className="mx-auto grid max-w-3xl gap-5 px-5 py-10 md:px-8">
        <div className="grid gap-3 border border-border p-5">
          <h2 className="font-semibold">Services</h2>
          {job.lines.map((line, index) => (
            <div
              className="flex items-start justify-between gap-4 border-t border-border pt-3 first:border-0 first:pt-0"
              key={`${line.item}:${index}`}
            >
              <div>
                <p className="font-medium">{line.item}</p>
                <p className="text-sm text-muted-foreground">
                  {publicServiceDetail(line.item, null, line.offering)} ·{" "}
                  {line.quantity}
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {line.ready ? "Ready" : "In progress"}
              </span>
            </div>
          ))}
          <p className="border-t border-border pt-3 text-sm text-muted-foreground">
            Promised date:{" "}
            {job.dueAt
              ? new Intl.DateTimeFormat("en-NG", {
                  dateStyle: "medium",
                  timeZone: job.timeZone,
                  timeStyle: "short",
                }).format(new Date(job.dueAt))
              : "Not set"}
          </p>
        </div>
        {job.messages.map((message, index) => (
          <div
            className="border border-border p-5"
            key={`${message.createdAt.toISOString()}:${index}`}
          >
            {message.renderedSubject ? (
              <h2 className="font-semibold">{message.renderedSubject}</h2>
            ) : null}
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {message.renderedMessage}
            </p>
          </div>
        ))}
        {job.evidence.length > 0 ? (
          <div className="grid gap-3 border border-border p-5">
            <h2 className="font-semibold">Published updates</h2>
            {job.evidence.map((item, index) => (
              <p
                className="text-sm text-muted-foreground"
                key={`${item.safePublicAssetId}:${index}`}
              >
                {item.label ?? label(item.purpose)}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  )
}
