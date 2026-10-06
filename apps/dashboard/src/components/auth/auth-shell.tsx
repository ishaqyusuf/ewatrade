import { BrandMark } from "@ewatrade/ui"
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
          className="inline-flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>
            <img
              src="/brand/ewatrade-logo-precision-rise-v1.svg"
              alt="ẸwáTrade"
              width={164}
              height={36}
              className="block h-9 w-auto dark:hidden"
            />
            <img
              src="/brand/ewatrade-logo-precision-rise-v1-reverse.svg"
              alt="ẸwáTrade"
              width={164}
              height={36}
              className="hidden h-9 w-auto dark:block"
            />
          </span>
        </Link>
      </nav>
      <aside className="m-2 hidden w-1/2 items-center justify-center bg-muted p-12 lg:flex">
        <div className="flex max-w-md flex-col gap-6">
          <BrandMark className="size-12" />
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
