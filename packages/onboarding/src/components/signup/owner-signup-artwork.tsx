"use client"

import {
  BUSINESS_TYPE_GROUPS,
  findBusinessType,
} from "@ewatrade/utils/business-types"
import { getCatalogIllustrationSvg } from "@ewatrade/utils/catalog-illustration-artwork"
import type { CSSProperties } from "react"

const icons = {
  plus: '<path d="M5 12h14M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/>',
  arrowRight: '<path d="M5 12h14M13 5l7 7-7 7"/>',
  box: '<path d="M11 21.7a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7z"/><path d="M12 22V12M3.3 7 12 12l8.7-5"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  alert:
    '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.3 2A6 6 0 0 0 20 3v11a6 6 0 0 1-4.7 1c-2.3 0-4.3-2-7.3-2a6 6 0 0 0-4 1.3"/>',
  sparkle:
    '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  store:
    '<path d="M3 9 4.5 4h15L21 9M3 9v11h18V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M9 20v-5h6v5"/>',
} as const
export function OwnerSignupIcon({
  name,
  className = "",
}: { name: keyof typeof icons; className?: string }) {
  return (
    <svg
      className={`owner-ref-ico ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Fixed local allowlisted icon geometry copied from the approved Workshop, never merchant markup.
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  )
}
export function OwnerBusinessAvatar({
  typeKey,
  name,
  size = 44,
}: { typeKey?: string; name?: string; size?: number }) {
  const type = findBusinessType(typeKey)
  const tone = BUSINESS_TYPE_GROUPS.find(
    (group) => group.key === type?.group,
  )?.tone
  const ink = tone ? `var(--x-${tone}-fg)` : "var(--muted-fg)"
  const fill = tone ? `var(--x-${tone})` : "var(--muted)"
  const svg = type
    ? getCatalogIllustrationSvg(type.illustrationId, {
        ink,
        accent: ink,
        fill: "var(--card)",
        highlight: fill,
      })
    : undefined
  const style = { "--av": `${size}px`, background: fill } as CSSProperties
  if (!svg)
    return (
      <span className="owner-ref-av-txt" style={style}>
        {name?.trim()
          ? name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((word) => word[0])
              .join("")
              .toUpperCase()
          : "?"}
      </span>
    )
  return (
    <span
      className="owner-ref-av-ill"
      style={style}
      aria-hidden="true"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shared allowlisted SVG renderer with fixed semantic palette roles, never merchant markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
