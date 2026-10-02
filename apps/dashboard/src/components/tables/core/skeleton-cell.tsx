"use client"

import { cn } from "@/utils"
import type { SkeletonType } from "./types"

export function SkeletonCell({
  type,
  width = "w-24",
}: {
  type: SkeletonType
  width?: string
}) {
  const block = (className: string) => (
    <span
      aria-hidden="true"
      className={cn("animate-pulse rounded bg-muted", className)}
    />
  )

  switch (type) {
    case "checkbox":
      return block("size-4")
    case "avatar-text":
      return (
        <span className="flex items-center gap-2">
          {block("size-6 shrink-0 rounded-full")}
          {block(cn("h-3.5", width))}
        </span>
      )
    case "icon-text":
      return (
        <span className="flex items-center gap-2">
          {block("size-3 shrink-0")}
          {block(cn("h-3.5", width))}
        </span>
      )
    case "badge":
      return block(cn("h-5", width))
    case "tags":
      return (
        <span className="flex items-center gap-1">
          {block("h-5 w-12")}
          {block("h-5 w-16")}
        </span>
      )
    case "icon":
      return block("size-5")
    default:
      return block(cn("h-3.5", width))
  }
}
