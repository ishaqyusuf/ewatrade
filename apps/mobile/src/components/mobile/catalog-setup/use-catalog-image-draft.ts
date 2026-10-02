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

export const CATALOG_IMAGE_MAX_BYTES = 10 * 1024 * 1024

/** Only device-local selection here; a preview URI is never a Catalog URL. */
export function useCatalogImageDraft(input: {
  canEdit: () => boolean
  scopeKey: string
}) {
  const [image, setImage] = useState<CatalogImageDraft | null>(null)
  const [illustrationId, setIllustrationId] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    setImage(null)
    setIllustrationId(null)
    setError(null)
    return () => {
      generation.current += 1
    }
  }, [input.scopeKey])

  async function select(source: CatalogImageDraft["source"]) {
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
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync()
        if (!isCurrent()) return
        if (!permission.granted) {
          setError(
            "Camera access is off. Choose a photo instead, or enable camera access in Settings.",
          )
          return
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options)
      if (!isCurrent() || result.canceled) return
      const asset = result.assets[0]
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
            ? "The camera could not open. Try again or choose a photo."
            : "Photos could not open. Check photo access and try again.",
        )
    } finally {
      if (operation === generation.current) {
        picking.current = false
        setSelecting(false)
      }
    }
  }

  return {
    image,
    illustrationId,
    chooseIllustration: (id: string) => {
      if (
        !current.current.canEdit() ||
        picking.current ||
        !findCatalogIllustration(id)
      )
        return
      setImage(null)
      setIllustrationId(id)
      setError(null)
    },
    selecting,
    error,
    select,
    remove: () => {
      if (!current.current.canEdit() || picking.current) return
      setImage(null)
      setIllustrationId(null)
      setError(null)
    },
  }
}
