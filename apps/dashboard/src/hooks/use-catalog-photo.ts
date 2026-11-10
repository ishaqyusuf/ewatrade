"use client"

import { useTRPC } from "@/trpc/client"
import { uploadCatalogPhotoDraft } from "@ewatrade/catalog/photo-client"
import {
  CATALOG_PHOTO_CONTENT_TYPES,
  CATALOG_PHOTO_MAX_BYTES,
} from "@ewatrade/catalog/photo-contracts"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

export const INVALID_FILE =
  "Choose a JPG, PNG, WebP or HEIC photo smaller than 10 MB."
const STORE_CHANGED =
  "The active Store changed. Reopen this item before saving."

export function isCatalogPhotoFile(file: File) {
  return (
    CATALOG_PHOTO_CONTENT_TYPES.some((type) => type === file.type) &&
    file.size >= 1 &&
    file.size <= CATALOG_PHOTO_MAX_BYTES
  )
}

type UploadDraftInput = Parameters<typeof uploadCatalogPhotoDraft>[0]

/** Uploads one file as a private draft photo of the Store; returns its asset. */
export function uploadCatalogFile(input: {
  file: File
  storeId: string
  clientOperationId: string
  assertCurrent(): void
  createIntent: UploadDraftInput["createIntent"]
}) {
  const { file, storeId } = input
  return uploadCatalogPhotoDraft({
    clientOperationId: input.clientOperationId,
    storeId,
    contentType: file.type,
    assertCurrent: input.assertCurrent,
    readBytes: async () => new Uint8Array(await file.arrayBuffer()),
    digest: async (bytes) => {
      const buffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(buffer).set(bytes)
      return Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("")
    },
    createIntent: input.createIntent,
    upload: async (assetId, bytes, contentType) => {
      const response = await fetch(
        `/api/catalog/photos/${encodeURIComponent(assetId)}/upload?storeId=${encodeURIComponent(storeId)}`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "Content-Type": contentType,
            "x-store-id": storeId,
          },
          body: new Blob([bytes.slice().buffer], { type: contentType }),
          signal: AbortSignal.timeout(90_000),
        },
      )
      const result: unknown = await response.json()
      if (!response.ok)
        throw new Error(
          result &&
            typeof result === "object" &&
            "error" in result &&
            typeof result.error === "string"
            ? result.error
            : "Photo upload failed. Your draft is unchanged.",
        )
      if (
        !result ||
        typeof result !== "object" ||
        !("assetId" in result) ||
        typeof result.assetId !== "string" ||
        !("state" in result) ||
        typeof result.state !== "string"
      )
        throw new Error("Photo upload could not be confirmed.")
      return { assetId: result.assetId, state: result.state }
    },
  })
}

export function useCatalogPhoto(storeId: string) {
  const trpc = useTRPC()
  const createIntent = useMutation(
    trpc.catalog.photos.createIntent.mutationOptions(),
  )
  const reuse = useMutation(trpc.catalog.photos.reuse.mutationOptions())
  const [file, setFile] = useState<File | null>(null)
  // A My images photo picked instead of a file; copied onto the item on save.
  const [reused, setReused] = useState<{
    assetId: string
    storeId: string
    name: string
  } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const current = useRef({ storeId, mounted: true })
  current.current.storeId = storeId
  const operation = useRef<string | null>(null)
  const asset = useRef<string | null>(null)
  const restoredAssets = useRef<string[]>([])
  const [assetIds, setAssetIds] = useState<string[]>([])
  const busy = useRef(false)
  useEffect(() => {
    current.current.mounted = true
    return () => {
      current.current.mounted = false
    }
  }, [])
  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  function select(next: File | null) {
    if (busy.current) return false
    if (next && !isCatalogPhotoFile(next)) {
      setError(INVALID_FILE)
      return false
    }
    setFile(next)
    setReused(null)
    restoredAssets.current = []
    setAssetIds([])
    setError(null)
    asset.current = null
    operation.current = next ? crypto.randomUUID() : null
    return true
  }
  async function upload(clientOperationId: string) {
    if (!file && reused) return [await reuseSource(clientOperationId, reused)]
    if (!file) return restoredAssets.current
    if (busy.current) throw new Error("Your photo is still uploading.")
    const originalStore = storeId
    const selected = file
    const photoOperation = operation.current
    busy.current = true
    setUploading(true)
    setError(null)
    const assertCurrent = () => {
      if (!current.current.mounted || current.current.storeId !== originalStore)
        throw new Error(STORE_CHANGED)
    }
    try {
      assertCurrent()
      if (asset.current) return [asset.current]
      const id = await uploadCatalogFile({
        file: selected,
        storeId: originalStore,
        clientOperationId: `${clientOperationId}:photo:${photoOperation}`,
        assertCurrent,
        createIntent: (request) => createIntent.mutateAsync(request),
      })
      asset.current = id
      return [id]
    } catch (error) {
      if (current.current.mounted)
        setError(
          error instanceof Error
            ? error.message
            : "Photo upload failed. Your draft is unchanged.",
        )
      throw error
    } finally {
      busy.current = false
      if (current.current.mounted) setUploading(false)
    }
  }
  async function reuseSource(
    clientOperationId: string,
    source: NonNullable<typeof reused>,
  ) {
    if (busy.current) throw new Error("Your photo is still uploading.")
    if (asset.current) return asset.current
    const originalStore = storeId
    busy.current = true
    setUploading(true)
    setError(null)
    try {
      const copy = await reuse.mutateAsync({
        storeId: originalStore,
        sourceAssetId: source.assetId,
        sourceStoreId: source.storeId,
        clientOperationId: `${clientOperationId}:reuse:${source.assetId}`,
      })
      if (!current.current.mounted || current.current.storeId !== originalStore)
        throw new Error(STORE_CHANGED)
      asset.current = copy.assetId
      return copy.assetId
    } catch (error) {
      if (current.current.mounted)
        setError(
          error instanceof Error
            ? error.message
            : "This image could not be added. Your draft is unchanged.",
        )
      throw error
    } finally {
      busy.current = false
      if (current.current.mounted) setUploading(false)
    }
  }
  return {
    assetIds,
    file,
    reused,
    /** Pick a My images photo instead of a file. */
    reuse: (source: NonNullable<typeof reused>) => {
      if (busy.current) return false
      setFile(null)
      setReused(source)
      restoredAssets.current = []
      setAssetIds([])
      setError(null)
      asset.current = null
      operation.current = null
      return true
    },
    preview: reused
      ? `/api/catalog/photos/${encodeURIComponent(reused.assetId)}/preview?storeId=${encodeURIComponent(reused.storeId)}`
      : (preview ??
        (assetIds[0]
          ? `/api/catalog/photos/${encodeURIComponent(assetIds[0])}/preview?storeId=${encodeURIComponent(storeId)}`
          : null)),
    error,
    uploading,
    select,
    upload,
    restore: (ids: string[]) => {
      restoredAssets.current = [...ids]
      setAssetIds([...ids])
      setFile(null)
      setReused(null)
      asset.current = null
      operation.current = null
    },
    hasPhoto: Boolean(file || reused || restoredAssets.current.length),
  }
}

export type CatalogPhotoDraft = { key: string; file: File; preview: string }

/**
 * Several new photos chosen in one editor session. Each file keeps its own
 * upload identity and, once uploaded, its asset, so a retry re-sends only the
 * files that didn't finish.
 */
export function useCatalogPhotoQueue(storeId: string) {
  const trpc = useTRPC()
  const createIntent = useMutation(
    trpc.catalog.photos.createIntent.mutationOptions(),
  )
  const [drafts, setDrafts] = useState<CatalogPhotoDraft[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const current = useRef({ storeId, mounted: true })
  current.current.storeId = storeId
  const assets = useRef(new Map<string, string>())
  const previews = useRef(new Set<string>())
  const busy = useRef(false)
  useEffect(() => {
    current.current.mounted = true
    const urls = previews.current
    return () => {
      current.current.mounted = false
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])
  function discard(draft: CatalogPhotoDraft) {
    URL.revokeObjectURL(draft.preview)
    previews.current.delete(draft.preview)
    assets.current.delete(draft.key)
  }
  /** Adds files while `room` allows; returns how many were added. */
  function add(files: File[], room: number) {
    if (busy.current) return 0
    const valid = files.filter(isCatalogPhotoFile)
    const added = valid.slice(0, Math.max(0, room)).map((file) => {
      const preview = URL.createObjectURL(file)
      previews.current.add(preview)
      return { key: crypto.randomUUID(), file, preview }
    })
    setDrafts((list) => [...list, ...added])
    setError(
      valid.length < files.length
        ? INVALID_FILE
        : added.length < valid.length
          ? "An item holds eight photos, so only the first ones were added."
          : null,
    )
    return added.length
  }
  function remove(key: string) {
    if (busy.current) return false
    const draft = drafts.find((entry) => entry.key === key)
    if (draft) discard(draft)
    setDrafts((list) => list.filter((entry) => entry.key !== key))
    setError(null)
    return true
  }
  function clear() {
    if (busy.current) return false
    for (const draft of drafts) discard(draft)
    setDrafts([])
    setError(null)
    return true
  }
  /** Uploads every draft in order; returns each draft key's asset. */
  async function upload(clientOperationId: string) {
    if (busy.current) throw new Error("Your photos are still uploading.")
    const originalStore = storeId
    const selected = drafts
    const uploaded = new Map<string, string>()
    if (!selected.length) return uploaded
    busy.current = true
    setUploading(true)
    setError(null)
    const assertCurrent = () => {
      if (!current.current.mounted || current.current.storeId !== originalStore)
        throw new Error(STORE_CHANGED)
    }
    try {
      for (const draft of selected) {
        assertCurrent()
        const known = assets.current.get(draft.key)
        const id =
          known ??
          (await uploadCatalogFile({
            file: draft.file,
            storeId: originalStore,
            clientOperationId: `${clientOperationId}:photo:${draft.key}`,
            assertCurrent,
            createIntent: (request) => createIntent.mutateAsync(request),
          }))
        assets.current.set(draft.key, id)
        uploaded.set(draft.key, id)
      }
      return uploaded
    } catch (error) {
      if (current.current.mounted)
        setError(
          error instanceof Error
            ? error.message
            : "Photo upload failed. Your draft is unchanged.",
        )
      throw error
    } finally {
      busy.current = false
      if (current.current.mounted) setUploading(false)
    }
  }
  return { drafts, error, uploading, add, remove, clear, upload }
}
