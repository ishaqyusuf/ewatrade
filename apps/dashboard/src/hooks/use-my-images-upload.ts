"use client"

import { useTRPC } from "@/trpc/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import {
  INVALID_FILE,
  isCatalogPhotoFile,
  uploadCatalogFile,
} from "./use-catalog-photo"

/**
 * Uploads one image straight to My images (no item): the normal private
 * upload, then catalog.photos.addToGallery with its title and category. A
 * retry after the bytes landed only repeats the gallery step.
 */
export function useMyImagesUpload(storeId: string) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const createIntent = useMutation(
    trpc.catalog.photos.createIntent.mutationOptions(),
  )
  const addToGallery = useMutation(
    trpc.catalog.photos.addToGallery.mutationOptions(),
  )
  const [uploading, setUploading] = useState(false)
  const uploaded = useRef(new WeakMap<File, string>())

  async function upload(input: {
    file: File
    title: string
    category: string
  }) {
    if (!isCatalogPhotoFile(input.file)) throw new Error(INVALID_FILE)
    setUploading(true)
    try {
      const assetId =
        uploaded.current.get(input.file) ??
        (await uploadCatalogFile({
          file: input.file,
          storeId,
          clientOperationId: `my-images:${crypto.randomUUID()}`,
          assertCurrent: () => undefined,
          createIntent: (request) => createIntent.mutateAsync(request),
        }))
      uploaded.current.set(input.file, assetId)
      const kept = await addToGallery.mutateAsync({
        storeId,
        assetId,
        title: input.title,
        category: input.category,
      })
      await queryClient.invalidateQueries({
        queryKey: trpc.catalog.photos.gallery.pathKey(),
      })
      return kept
    } finally {
      setUploading(false)
    }
  }

  return { upload, uploading }
}
