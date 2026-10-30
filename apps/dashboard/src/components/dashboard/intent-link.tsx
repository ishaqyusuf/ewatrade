"use client"

import Link from "next/link"
import { type ComponentProps, useState } from "react"

type Props = Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & {
  href: string
}

/** Keep full route warming behind interest in this destination. */
export function IntentLink({
  href,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: Props) {
  const [intentHref, setIntentHref] = useState<string | null>(null)
  return (
    <Link
      {...props}
      href={href}
      prefetch={intentHref === href}
      onMouseEnter={(event) => {
        onMouseEnter?.(event)
        if (!event.defaultPrevented) setIntentHref(href)
      }}
      onFocus={(event) => {
        onFocus?.(event)
        if (!event.defaultPrevented) setIntentHref(href)
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event)
        if (!event.defaultPrevented) setIntentHref(href)
      }}
    />
  )
}
