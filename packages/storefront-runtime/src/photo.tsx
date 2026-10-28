"use client"

import { type ReactNode, useEffect, useRef, useState } from "react"

/**
 * An error before hydration fires no React event; a finished image with no pixels
 * is broken. A lazy image that hasn't loaded yet is not complete, so it isn't.
 */
export function photoImageBroken(
  image: Pick<HTMLImageElement, "complete" | "naturalWidth"> | null,
) {
  return Boolean(image?.complete && image.naturalWidth === 0)
}

/**
 * A public catalog photo that swaps to `fallback` (catalog artwork) when delivery
 * fails: revoked review, unpublished Store, removed bytes or a network error. The
 * server re-checks every photo request, so a URL in a cached page can stop working.
 */
export function StorefrontPhoto({
  src,
  alt,
  className,
  loading,
  fetchPriority,
  fallback,
}: {
  src: string
  alt: string
  className?: string
  loading?: "eager" | "lazy"
  fetchPriority?: "high" | "low" | "auto"
  fallback: ReactNode
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (photoImageBroken(image.current)) setFailed(src)
  }, [src])
  if (failed === src) return <>{fallback}</>
  return (
    <img
      ref={image}
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
      onError={() => setFailed(src)}
    />
  )
}
