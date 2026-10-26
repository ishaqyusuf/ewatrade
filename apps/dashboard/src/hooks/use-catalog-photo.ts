"use client"

import { useTRPC } from "@/trpc/client"
import { uploadCatalogPhotoDraft } from "@ewatrade/catalog/photo-client"
import {
  CATALOG_PHOTO_CONTENT_TYPES,
  CATALOG_PHOTO_MAX_BYTES,
} from "@ewatrade/catalog/photo-contracts"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

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
    if (
      next &&
      (!CATALOG_PHOTO_CONTENT_TYPES.some((type) => type === next.type) ||
        next.size < 1 ||
        next.size > CATALOG_PHOTO_MAX_BYTES)
    ) {
      setError("Choose a JPG, PNG, WebP or HEIC photo smaller than 10 MB.")
      return false
    }
    setFile(next)
    setReused(null)
    restoredAssets.current = []
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
        throw new Error(
          "The active Store changed. Reopen this item before saving.",
        )
    }
    try {
      assertCurrent()
      if (asset.current) return [asset.current]
      const id = await uploadCatalogPhotoDraft({
        clientOperationId: `${clientOperationId}:photo:${photoOperation}`,
        storeId: originalStore,
        contentType: selected.type,
        assertCurrent,
        readBytes: async () => new Uint8Array(await selected.arrayBuffer()),
        digest: async (bytes) => {
          const buffer = new ArrayBuffer(bytes.byteLength)
          new Uint8Array(buffer).set(bytes)
          return Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
            (byte) => byte.toString(16).padStart(2, "0"),
          ).join("")
        },
        createIntent: (request) => createIntent.mutateAsync(request),
        upload: async (assetId, bytes, contentType) => {
          const response = await fetch(
            `/api/catalog/photos/${encodeURIComponent(assetId)}/upload?storeId=${encodeURIComponent(originalStore)}`,
            {
              method: "PUT",
              credentials: "same-origin",
              headers: {
                "Content-Type": contentType,
                "x-store-id": originalStore,
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
        throw new Error(
          "The active Store changed. Reopen this item before saving.",
        )
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
    file,
    reused,
    /** Pick a My images photo instead of a file. */
    reuse: (source: NonNullable<typeof reused>) => {
      if (busy.current) return false
      setFile(null)
      setReused(source)
      restoredAssets.current = []
      setError(null)
      asset.current = null
      operation.current = null
      return true
    },
    preview: reused
      ? `/api/catalog/photos/${encodeURIComponent(reused.assetId)}/preview?storeId=${encodeURIComponent(reused.storeId)}`
      : preview,
    error,
    uploading,
    select,
    upload,
    restore: (ids: string[]) => {
      restoredAssets.current = ids
    },
    hasPhoto: Boolean(file || reused || restoredAssets.current.length),
  }
}
