"use client"

import type { PublicCatalogItem } from "@ewatrade/storefront-contracts/resources"
import { Button } from "@ewatrade/ui"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { StorefrontArtwork } from "../primitives"

type GalleryPhoto = { id: string; url: string; alt: string }

/**
 * Approved photos only, effective primary first. Older loaders send just `photoUrl`
 * (already the effective primary), so that stands in as a one-photo gallery.
 */
export function galleryPhotos(
  item: Pick<PublicCatalogItem, "name" | "photoUrl" | "photos">,
): GalleryPhoto[] {
  if (item.photos?.length) return item.photos
  return item.photoUrl
    ? [{ id: "primary", url: item.photoUrl, alt: item.name }]
    : []
}

/** An image that reports a failed load, including errors before hydration. */
function GalleryImage({
  photo,
  alt,
  className,
  eager,
  onFail,
}: {
  photo: GalleryPhoto
  alt: string
  className: string
  eager?: boolean
  onFail(id: string): void
}) {
  const image = useRef<HTMLImageElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-check only when the source changes.
  useEffect(() => {
    const current = image.current
    if (current?.complete && current.naturalWidth === 0) onFail(photo.id)
  }, [photo.url])
  return (
    <img
      ref={image}
      src={photo.url}
      alt={alt}
      className={className}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => onFail(photo.id)}
    />
  )
}

/**
 * Product and Service detail media. 0 photos: catalog artwork (Products) or nothing
 * (Services, whose page has no media column then). 1 photo: the image alone. 2+:
 * previous/next, arrow keys and thumbnails. A photo that fails to load drops out;
 * when none are left the artwork shows, so the page's actions never depend on it.
 */
export function CommerceGallery({
  item,
  kind,
}: {
  item: PublicCatalogItem
  kind: "product" | "service"
}) {
  const [failed, setFailed] = useState<readonly string[]>([])
  const [index, setIndex] = useState(0)
  const photos = galleryPhotos(item).filter(
    (photo) => !failed.includes(photo.id),
  )
  const total = photos.length
  const current = Math.min(index, Math.max(total - 1, 0))
  const fail = (id: string) =>
    setFailed((list) => (list.includes(id) ? list : [...list, id]))
  const artwork = (
    <StorefrontArtwork
      item={{ ...item, photoUrl: undefined, availability: null }}
    />
  )
  if (!total)
    return kind === "product" || galleryPhotos(item).length ? artwork : null
  const photo = photos[current] as GalleryPhoto
  if (total === 1)
    return (
      <div className="sf-feature-gallery">
        <div className="sf-feature-gallery__stage">
          <GalleryImage
            key={photo.id}
            photo={photo}
            alt={item.name}
            className="sf-feature-gallery__photo"
            eager
            onFail={fail}
          />
        </div>
      </div>
    )
  const show = (next: number) => setIndex((next + total) % total)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      show(current - 1)
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      show(current + 1)
    }
  }
  return (
    <div className="sf-feature-gallery">
      <div
        className="sf-feature-gallery__stage"
        // biome-ignore lint/a11y/useSemanticElements: a labelled gallery group is not a form fieldset.
        role="group"
        aria-roledescription="gallery"
        aria-label={`${item.name} photos`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: this labelled gallery implements arrow-key photo navigation.
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <GalleryImage
          key={photo.id}
          photo={photo}
          alt={`${item.name}, photo ${current + 1} of ${total}`}
          className="sf-feature-gallery__photo"
          eager
          onFail={fail}
        />
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="sf-feature-gallery__nav"
          data-side="previous"
          aria-label="Previous photo"
          onClick={() => show(current - 1)}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="sf-feature-gallery__nav"
          data-side="next"
          aria-label="Next photo"
          onClick={() => show(current + 1)}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
        </Button>
      </div>
      <ul className="sf-feature-gallery__thumbs">
        {photos.map((entry, position) => (
          <li key={entry.id}>
            <button
              type="button"
              className="sf-feature-gallery__thumb"
              aria-label={`Show photo ${position + 1} of ${total}`}
              aria-current={position === current ? "true" : undefined}
              onClick={() => show(position)}
            >
              <GalleryImage
                photo={entry}
                alt=""
                className="sf-feature-gallery__thumb-photo"
                onFail={fail}
              />
            </button>
          </li>
        ))}
      </ul>
      <output className="sf-feature-visually-hidden">
        Photo {current + 1} of {total}
      </output>
    </div>
  )
}
