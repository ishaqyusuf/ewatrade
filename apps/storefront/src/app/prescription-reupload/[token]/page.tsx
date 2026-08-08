import { randomUUID } from "node:crypto"

import { prisma } from "@ewatrade/db"
import {
  PrescriptionRequestError,
  replacePrescriptionMedia,
} from "@ewatrade/db/queries"
import { enqueuePrescriptionMediaSafety } from "@ewatrade/jobs"
import { storePrescriptionMedia } from "@ewatrade/prescriptions"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

async function submit(data: FormData) {
  "use server"
  const token = String(data.get("token") ?? "")
  const files = data
    .getAll("media")
    .filter((item): item is File => item instanceof File && item.size > 0)
  if (files.length < 1 || files.length > 12) {
    redirect(`/prescription-reupload/${token}?error=media`)
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
          scopeId: `reupload-${randomUUID()}`,
        }),
      )
    }
    const result = await replacePrescriptionMedia(prisma, {
      media,
      reuploadToken: token,
    })
    await enqueuePrescriptionMediaSafety(result.requestId)
  } catch (error) {
    if (error instanceof PrescriptionRequestError) {
      redirect(`/prescription-reupload/${token}?error=invalid`)
    }
    throw error
  }
  redirect(`/prescription-reupload/${token}?sent=1`)
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const { token } = await params
  const query = await searchParams
  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground">
      <section className="mx-auto grid max-w-xl gap-6 border border-border p-6">
        <div>
          <p className="text-sm text-muted-foreground">
            Secure pharmacy request
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Send clearer pages</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload only the requested prescription pages. The previous revision
            is retained according to the pharmacy retention policy.
          </p>
        </div>
        {query.sent ? (
          <p className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Clearer pages received. You may close this page.
          </p>
        ) : (
          <form
            action={submit}
            className="grid gap-4"
            encType="multipart/form-data"
          >
            <input name="token" type="hidden" value={token} />
            {query.error ? (
              <p role="alert" className="text-sm text-destructive">
                This link or upload is unavailable. Ask the pharmacy for a new
                link.
              </p>
            ) : null}
            <input
              className="min-h-11 border border-border bg-background p-3 text-sm"
              type="file"
              name="media"
              multiple
              required
              accept="application/pdf,image/heic,image/heif,image/jpeg,image/png,image/webp"
            />
            <button
              className="h-12 bg-primary px-5 text-sm font-medium text-primary-foreground"
              type="submit"
            >
              Send clearer pages
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
