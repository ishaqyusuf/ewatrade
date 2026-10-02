import { Store04Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import type { ReactNode } from "react"

export function AuthShell({
  title,
  description,
  asideTitle,
  asideDescription,
  brandHref = "/",
  footer,
  children,
}: {
  title: ReactNode
  description: ReactNode
  asideTitle: string
  asideDescription: string
  brandHref?: string
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="relative flex min-h-svh bg-background">
      <nav
        aria-label="EwaTrade"
        className="absolute inset-x-0 top-0 z-10 p-4 xl:p-6"
      >
        <Link
          href={brandHref}
          aria-label="EwaTrade home"
          className="inline-flex size-6 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Store04Icon} className="size-6" />
        </Link>
      </nav>
      <aside className="m-2 hidden w-1/2 items-center justify-center bg-muted p-12 lg:flex">
        <div className="flex max-w-md flex-col gap-6">
          <HugeiconsIcon icon={Store04Icon} className="size-12" />
          <h2 className="font-serif text-4xl leading-tight">{asideTitle}</h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            {asideDescription}
          </p>
        </div>
      </aside>
      <main className="flex min-w-0 w-full flex-col items-center justify-center px-6 pb-8 pt-20 lg:w-1/2 lg:px-12">
        <div className="flex w-full max-w-md flex-col gap-8">
          <header className="text-center">
            <h1 className="font-serif text-xl">{title}</h1>
            <div className="mt-4 text-sm text-muted-foreground">
              {description}
            </div>
          </header>
          {children}
          {footer ? (
            <footer className="text-center text-xs text-muted-foreground">
              {footer}
            </footer>
          ) : null}
        </div>
      </main>
    </div>
  )
}
