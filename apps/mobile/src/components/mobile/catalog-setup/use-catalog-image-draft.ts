import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import * as Crypto from "expo-crypto"
import { File } from "expo-file-system"
import * as ImagePicker from "expo-image-picker"
import { useEffect, useRef, useState } from "react"

export type CatalogImageDraft = {
  id: string
  uri: string
  fileName: string
  mimeType: string
  sizeBytes: number
  source: "photos" | "camera"
}

/** A My images photo picked instead of a device image; copied on save. */
export type CatalogReusedImage = {
  assetId: string
  storeId: string
  name: string
}

export const CATALOG_IMAGE_MAX_BYTES = 10 * 1024 * 1024

/** Only device-local selection here; a preview URI is never a Catalog URL. */
export function useCatalogImageDraft(input: {
  canEdit: () => boolean
  scopeKey: string
}) {
  const [image, setImage] = useState<CatalogImageDraft | null>(null)
  const [illustrationId, setIllustrationId] = useState<string | null>(null)
  const [reused, setReused] = useState<CatalogReusedImage | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const generation = useRef(0)
  const picking = useRef(false)
  const current = useRef(input)
  const activeScope = useRef(input.scopeKey)
  current.current = input

  useEffect(() => {
    activeScope.current = input.scopeKey
    generation.current += 1
    setSelecting(false)
    picking.current = false
    setCameraOpen(false)
    setImage(null)
    setIllustrationId(null)
    setReused(null)
    setError(null)
    return () => {
      generation.current += 1
    }
  }, [input.scopeKey])

  /** Validates one picked or captured image, then makes it the draft. */
  async function take(
    source: CatalogImageDraft["source"],
    load: () => Promise<ImagePicker.ImagePickerAsset | null>,
  ) {
    if (!current.current.canEdit() || picking.current) return
    const operation = ++generation.current
    const scope = current.current.scopeKey
    const isCurrent = () =>
      operation === generation.current &&
      scope === current.current.scopeKey &&
      scope === activeScope.current &&
      current.current.canEdit()
    picking.current = true
    setSelecting(true)
    setError(null)
    try {
      const asset = await load()
      if (!isCurrent() || !asset) return
      const sizeBytes = asset.fileSize ?? new File(asset.uri).size
      const mimeType = asset.mimeType
      if (
        !mimeType ||
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ].includes(mimeType)
      ) {
        setError("Choose a JPG, PNG, WebP or HEIC photo.")
        return
      }
      if (
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes <= 0 ||
        sizeBytes > CATALOG_IMAGE_MAX_BYTES
      ) {
        setError(
          "Choose an image smaller than 10 MB. Your previous image is unchanged.",
        )
        return
      }
      setIllustrationId(null)
      setReused(null)
      setImage({
        id: Crypto.randomUUID(),
        uri: asset.uri,
        fileName: asset.fileName ?? `catalog-photo.${mimeType.split("/")[1]}`,
        mimeType,
        sizeBytes,
        source,
      })
    } catch {
      if (isCurrent())
        setError(
          source === "camera"
            ? "The photo could not be saved. Try again or choose a photo."
            : "Photos could not open. Check photo access and try again.",
        )
    } finally {
      if (operation === generation.current) {
        picking.current = false
        setSelecting(false)
      }
    }
  }

  /** The camera source opens the docked camera; its shot arrives in camera.onCapture. */
  async function select(source: CatalogImageDraft["source"]) {
    if (!current.current.canEdit() || picking.current) return
    if (source === "camera") {
      setError(null)
      setCameraOpen(true)
      return
    }
    await take("photos", async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      })
      return result.canceled ? null : (result.assets[0] ?? null)
    })
  }

  return {
    image,
    illustrationId,
    reused,
    chooseReused: (source: CatalogReusedImage) => {
      if (!current.current.canEdit() || picking.current) return
      setImage(null)
      setIllustrationId(null)
      setReused(source)
      setError(null)
    },
    chooseIllustration: (id: string) => {
      if (
        !current.current.canEdit() ||
        picking.current ||
        !findCatalogIllustration(id)
      )
        return
      setImage(null)
      setReused(null)
      setIllustrationId(id)
      setError(null)
    },
    selecting,
    error,
    select,
    /** Props for the DockedPhotoCamera that select("camera") opens. */
    camera: {
      open: cameraOpen,
      onClose: () => setCameraOpen(false),
      onCapture: (photo: { uri: string; mimeType: string }) => {
        setCameraOpen(false)
        void take("camera", async () => ({
          uri: photo.uri,
          mimeType: photo.mimeType,
          width: 0,
          height: 0,
        }))
      },
      onChoosePhoto: () => {
        setCameraOpen(false)
        void select("photos")
      },
    },
    remove: () => {
      if (!current.current.canEdit() || picking.current) return
      setImage(null)
      setIllustrationId(null)
      setReused(null)
      setError(null)
    },
  }
}
