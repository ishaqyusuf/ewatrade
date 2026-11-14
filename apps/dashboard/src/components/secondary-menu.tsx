"use client"

import { cn } from "@/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"

type Item = { path: string; label: string }

export function SecondaryMenu({
  items,
  label,
}: {
  items: Item[]
  label: string
}) {
  const pathname = usePathname()

  return (
    <nav aria-label={label} className="min-w-0 border-b border-border">
      <ul className="flex gap-6 overflow-x-auto scrollbar-hide">
        {items.map((item) => {
          const active = pathname === item.path
          return (
            <li key={item.path} className="shrink-0">
              <Link
                href={item.path}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground",
                  active &&
                    "font-medium text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
