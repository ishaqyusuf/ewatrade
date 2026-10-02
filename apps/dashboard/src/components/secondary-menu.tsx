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
    <nav aria-label={label} className="min-w-0 py-4">
      <ul className="flex space-x-6 overflow-auto text-sm scrollbar-hide">
        {items.map((item) => {
          const active = pathname === item.path
          return (
            <li key={item.path} className="shrink-0">
              <Link
                href={item.path}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-[#606060]",
                  active &&
                    "font-medium text-primary underline underline-offset-8",
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
