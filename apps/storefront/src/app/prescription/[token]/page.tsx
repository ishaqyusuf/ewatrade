import { randomUUID } from "node:crypto"

import { prisma } from "@ewatrade/db"
import {
  PrescriptionRequestError,
  getPublicPrescriptionChannel,
  submitPublicPrescriptionRequest,
} from "@ewatrade/db/queries"
import { enqueuePrescriptionMediaSafety } from "@ewatrade/jobs"
import { storePrescriptionMedia } from "@ewatrade/prescriptions"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}

function value(data: FormData, key: string) {
  const result = data.get(key)
  return typeof result === "string" ? result.trim() : ""
}

async function loadChannel(token: string) {
  try {
    return await getPublicPrescriptionChannel(prisma, { publicToken: token })
  } catch (error) {
    if (error instanceof PrescriptionRequestError) notFound()
    throw error
  }
}

async function submit(data: FormData) {
  "use server"
  const token = value(data, "token")
  const channel = await loadChannel(token)
  const files = data
    .getAll("media")
    .filter((item): item is File => item instanceof File && item.size > 0)
  if (files.length < 1 || files.length > 12) {
    redirect(`/prescription/${token}?error=media`)
  }
  if (value(data, "consentAccepted") !== "yes") {
    redirect(`/prescription/${token}?error=consent`)
  }
  const customerPhone = value(data, "customerPhone")
  const customerEmail = value(data, "customerEmail").toLowerCase()
  if (!customerPhone && !customerEmail) {
    redirect(`/prescription/${token}?error=contact`)
  }
  try {
    const media = []
    for (const [index, file] of files.entries()) {
      media.push(
        await storePrescriptionMedia({
          bytes: new Uint8Array(await file.arrayBuffer()),
          clientMediaId: randomUUID(),
          mediaType: file.type,
          originalFileName: file.name,
          pageNumber: index + 1,
          scopeId: channel.channelId,
        }),
      )
    }
    const result = await submitPublicPrescriptionRequest(prisma, {
      clientRequestId: `web-${randomUUID()}`,
      consentAcceptedAt: new Date(),
      consentVersion: "2026-08-08",
      customerEmail: customerEmail || undefined,
      customerName: value(data, "customerName") || undefined,
      customerPhone: customerPhone || undefined,
      fulfilmentPreference:
        value(data, "fulfilmentPreference") === "delivery"
          ? "delivery"
          : value(data, "fulfilmentPreference") === "pickup"
            ? "pickup"
            : "unspecified",
      media,
      publicToken: token,
    })
    if (!result.statusToken) {
      redirect(`/prescription/${token}?error=retry`)
    }
    if (result.created) {
      await enqueuePrescriptionMediaSafety(result.requestId)
    }
    redirect(`/prescription-status/${result.statusToken}`)
  } catch (error) {
    if (error instanceof PrescriptionRequestError) {
      redirect(`/prescription/${token}?error=invalid`)
    }
    throw error
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const channel = await getPublicPrescriptionChannel(prisma, {
    publicToken: token,
  }).catch(() => null)
  return channel
    ? {
        title: `${channel.store.name} prescription request`,
        description: `Send a private prescription request to ${channel.store.name}.`,
      }
    : { title: "Prescription request unavailable | ewatrade" }
}

export default async function Page({ params, searchParams }: Props) {
  const { token } = await params
  const query = await searchParams
  const channel = await loadChannel(token)
  const whatsappNumber = channel.whatsappDisplayNumber?.replace(/\D/g, "")
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Start rxstore:${token}`)}`
    : null
  const error =
    query.error === "media"
      ? "Add between one and 12 supported prescription pages, up to 10 MB each."
      : query.error === "consent"
        ? "Confirm consent before sending the request."
        : query.error === "contact"
          ? "Add a phone number or email address."
          : query.error
            ? "The request could not be sent. Review the details and try again."
            : null

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
          <p className="text-sm text-muted-foreground">{channel.store.name}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Send a prescription request
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Choose a channel. A pharmacist reviews the request before any price,
            alternative, or availability decision.
          </p>
          <div
            className="mt-6 flex flex-wrap gap-2"
            aria-label="Contact channel"
          >
            <a
              className="border border-border bg-background px-4 py-2 text-sm font-medium"
              href="#web-intake"
            >
              Continue securely on web
            </a>
            {channel.supportedChannels.whatsapp && whatsappUrl ? (
              <a
                className="border border-border bg-background px-4 py-2 text-sm font-medium"
                href={whatsappUrl}
              >
                Continue on WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </section>
      <section
        id="web-intake"
        className="mx-auto grid max-w-3xl gap-6 px-5 py-10 md:px-8"
      >
        {error ? (
          <p
            role="alert"
            className="border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <form
          action={submit}
          className="grid gap-6"
          encType="multipart/form-data"
        >
          <input type="hidden" name="token" value={token} />
          <section className="grid gap-4 border border-border p-5">
            <h2 className="font-semibold">Contact and fulfilment</h2>
            <input
              className="h-11 border border-border bg-background px-3 text-sm"
              name="customerName"
              placeholder="Name (optional)"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                className="h-11 border border-border bg-background px-3 text-sm"
                inputMode="tel"
                name="customerPhone"
                placeholder="Phone"
              />
              <input
                className="h-11 border border-border bg-background px-3 text-sm"
                name="customerEmail"
                placeholder="Email"
                type="email"
              />
            </div>
            <select
              className="h-11 border border-border bg-background px-3 text-sm"
              name="fulfilmentPreference"
              defaultValue="unspecified"
            >
              <option value="unspecified">Choose later</option>
              <option value="pickup">Pick up</option>
              <option value="delivery">Delivery</option>
            </select>
          </section>
          <section className="grid gap-3 border border-border p-5">
            <h2 className="font-semibold">Private prescription pages</h2>
            <input
              className="min-h-11 border border-border bg-background p-3 text-sm"
              type="file"
              name="media"
              multiple
              required
              accept="application/pdf,image/heic,image/heif,image/jpeg,image/png,image/webp"
            />
            <p className="text-xs text-muted-foreground">
              Files are private, safety-scanned, and shown only to authorized
              pharmacy staff. Do not add unrelated health information.
            </p>
          </section>
          <label className="flex items-start gap-3 border border-border p-5 text-sm">
            <input
              type="checkbox"
              name="consentAccepted"
              value="yes"
              required
            />
            <span>
              I consent to this pharmacy processing these files and contacting
              me for clarification, quoting, and fulfilment.
            </span>
          </label>
          <button
            className="h-12 bg-primary px-6 text-sm font-medium text-primary-foreground"
            type="submit"
          >
            Send private request
          </button>
        </form>
      </section>
    </main>
  )
}
