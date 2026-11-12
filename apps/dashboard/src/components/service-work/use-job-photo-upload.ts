"use client"

import { useTRPC } from "@/trpc/client"
import { useMutation } from "@tanstack/react-query"
import { useRef } from "react"

export const JOB_PHOTO_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif"
/** Same cap as the API upload route. */
export const JOB_PHOTO_MAX_BYTES = 4 * 1024 * 1024
const RESIZABLE = ["image/jpeg", "image/png", "image/webp"]

async function sha256(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** Phone photos are often larger than the cap; shrink them to a JPEG. */
async function fitPhoto(file: File): Promise<Blob> {
  if (file.size <= JOB_PHOTO_MAX_BYTES) return file
  if (!RESIZABLE.includes(file.type))
    throw new Error("This photo is too large. Use one under 4 MB.")
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  )
  if (!blob || blob.size > JOB_PHOTO_MAX_BYTES)
    throw new Error("This photo is too large. Use one under 4 MB.")
  return blob
}

export function jobPhotoProblem(file: File | null) {
  if (!file) return null
  if (!JOB_PHOTO_ACCEPT.split(",").includes(file.type))
    return "Choose a photo (JPG, PNG, WebP or HEIC)."
  if (file.size > JOB_PHOTO_MAX_BYTES && !RESIZABLE.includes(file.type))
    return "This photo is too large. Use one under 4 MB."
  return null
}

/**
 * Uploads one private job photo. The evidence id is kept until it succeeds,
 * so a retry resumes the same photo instead of adding another.
 */
export function useJobPhotoUpload(jobId: string) {
  const trpc = useTRPC()
  const start = useMutation(trpc.services.startPhotoUpload.mutationOptions())
  const clientEvidenceId = useRef(`photo-${crypto.randomUUID()}`)
  const prepared = useRef<{ source: File; blob: Blob } | null>(null)

  async function upload(input: {
    file: File
    label?: string
    purpose: "exception" | "progress"
  }) {
    if (prepared.current?.source !== input.file)
      prepared.current = {
        source: input.file,
        blob: await fitPhoto(input.file),
      }
    const { blob } = prepared.current
    const contentType = blob.type || input.file.type
    const route = await start.mutateAsync({
      clientEvidenceId: clientEvidenceId.current,
      contentDigest: await sha256(blob),
      contentType: contentType as "image/jpeg",
      jobId,
      label: input.label?.trim() || undefined,
      purpose: input.purpose,
      sizeBytes: blob.size,
    })
    if (!route.uploaded) {
      const response = await fetch(route.path, {
        body: blob,
        credentials: "same-origin",
        headers: { "Content-Type": contentType },
        method: "PUT",
      })
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(result?.error ?? "The photo didn't upload. Try again.")
      }
    }
    clientEvidenceId.current = `photo-${crypto.randomUUID()}`
    prepared.current = null
  }

  return { upload, isPending: start.isPending }
}

export function jobPhotoSource(evidenceId: string) {
  return `/api/services/evidence/${encodeURIComponent(evidenceId)}/content`
}
