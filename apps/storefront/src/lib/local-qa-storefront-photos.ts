import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { PublicStorefront } from "@/components/storefront/storefront-types"
import {
  isLocalStorefrontPreviewHost,
  normalizeHostname,
} from "@ewatrade/utils"

type Manifest = { slug: string; photos: Record<string, string> }
const directory = () => join(process.cwd(), ".qa-storefront-photos")
const filenamePattern = /^[a-z0-9-]{1,64}\.webp$/

/** Local stock-photo fixtures, separate from merchant uploads and approval. */
export function parseLocalQaPhotoManifest(
  value: unknown,
  host: string,
  environment: NodeJS.ProcessEnv,
): Manifest | null {
  if (
    !isLocalStorefrontPreviewHost(host, environment) ||
    !value ||
    typeof value !== "object" ||
    !("slug" in value) ||
    typeof value.slug !== "string" ||
    normalizeHostname(host) !== `${value.slug}.ewatrade-storefront.localhost` ||
    !("photos" in value) ||
    !value.photos ||
    typeof value.photos !== "object"
  )
    return null
  const entries = Object.entries(value.photos)
  if (
    entries.length > 8 ||
    entries.some(
      ([id, file]) =>
        !/^[a-zA-Z0-9_-]{1,128}$/.test(id) ||
        typeof file !== "string" ||
        !filenamePattern.test(file),
    )
  )
    return null
  return { slug: value.slug, photos: Object.fromEntries(entries) }
}

async function manifestForHost(host: string) {
  if (!isLocalStorefrontPreviewHost(host, process.env)) return null
  try {
    return parseLocalQaPhotoManifest(
      JSON.parse(await readFile(join(directory(), "manifest.json"), "utf8")),
      host,
      process.env,
    )
  } catch {
    return null
  }
}

export async function withLocalQaStorefrontPhotos(
  store: PublicStorefront | null,
  host: string,
): Promise<PublicStorefront | null> {
  if (!store?.isQaPreview) return store
  const manifest = await manifestForHost(host)
  if (!manifest || manifest.slug !== store.slug) return store
  const decorate = (item: PublicStorefront["items"][number]) => ({
    ...item,
    ...(manifest.photos[item.id]
      ? { photoUrl: `/qa-photo/${manifest.photos[item.id]}` }
      : {}),
  })
  return {
    ...store,
    items: store.items.map(decorate),
    highlightedItem: store.highlightedItem
      ? decorate(store.highlightedItem)
      : null,
  }
}

export async function readLocalQaStorefrontPhoto(
  host: string,
  filename: string,
) {
  if (!filenamePattern.test(filename)) return null
  const manifest = await manifestForHost(host)
  if (!manifest || !Object.values(manifest.photos).includes(filename))
    return null
  try {
    const bytes = await readFile(join(directory(), filename))
    if (
      bytes.length > 2_000_000 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP"
    )
      return null
    return bytes
  } catch {
    return null
  }
}

export async function localQaSharePhotoData(
  store: PublicStorefront,
  host: string,
) {
  if (!store.isQaPreview) return {}
  const manifest = await manifestForHost(host)
  if (!manifest || manifest.slug !== store.slug) return {}
  const items = store.highlightedItem
    ? [store.highlightedItem]
    : store.items.slice(0, 3)
  const result: Record<string, string> = {}
  for (const item of items) {
    const file = manifest.photos[item.id]
    if (!file) continue
    try {
      // OG's raster decoder accepts JPEG/PNG; use the normalized local JPEG pair.
      const bytes = await readFile(
        join(directory(), file.replace(/\.webp$/, "-share.jpg")),
      )
      if (
        bytes.length <= 2_000_000 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      )
        result[item.id] = `data:image/jpeg;base64,${bytes.toString("base64")}`
    } catch {
      /* Bundled artwork remains available if a fixture pair is absent. */
    }
  }
  return result
}
