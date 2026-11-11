"use client"

import type { PlatformCatalogItem } from "@/lib/platform-catalog"
import { type ReactNode, useState } from "react"

/** Main photo plus thumbnails; the artwork tile stands in when there are no photos. */
export function PlatformGallery({
  item,
  artwork,
  optionPhotoUrl,
}: {
  item: PlatformCatalogItem
  artwork: ReactNode
  optionPhotoUrl?: string
}) {
  const photos = item.photos ?? []
  const [index, setIndex] = useState(0)
  const [failedOption, setFailedOption] = useState<string>()
  if (optionPhotoUrl && failedOption !== optionPhotoUrl)
    return (
      <div className="gallery">
        <div className="tile pd-main" data-tone="stone">
          <img
            className="tile-photo"
            src={optionPhotoUrl}
            alt={item.name}
            onError={() => setFailedOption(optionPhotoUrl)}
          />
        </div>
      </div>
    )
  if (photos.length === 0) return <div className="gallery">{artwork}</div>
  const current = photos[Math.min(index, photos.length - 1)]
  return (
    <div className="gallery">
      <div className="tile pd-main" data-tone="stone">
        <img className="tile-photo" src={current?.url} alt={item.name} />
      </div>
      {photos.length > 1 ? (
        <fieldset className="thumbs">
          <legend className="sr">Photos</legend>
          {photos.map((photo, photoIndex) => (
            <button
              type="button"
              key={photo.id}
              className="thumb"
              aria-pressed={photoIndex === index}
              aria-label={`Photo ${photoIndex + 1} of ${photos.length}`}
              onClick={() => setIndex(photoIndex)}
            >
              <div className="tile" data-tone="stone">
                <img className="tile-photo" src={photo.url} alt="" />
              </div>
            </button>
          ))}
        </fieldset>
      ) : null}
    </div>
  )
}
