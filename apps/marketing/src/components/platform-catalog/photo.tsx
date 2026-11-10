"use client"

import { useState } from "react"

/** Covers the artwork; a photo the API refuses simply disappears. */
export function PlatformPhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      className="tile-photo"
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
