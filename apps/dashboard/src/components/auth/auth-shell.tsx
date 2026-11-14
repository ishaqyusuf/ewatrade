import Link from "next/link"
import type { ReactNode } from "react"

/**
 * The one public shell for pages outside the dashboard frame (sign in,
 * password recovery, staff invitations, access notices). Midnight Paper:
 * canvas background, logo top left, one card with the page's only <h1>.
 */
export function AuthShell({
  title,
  description,
  brandHref = "/",
  footer,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  brandHref?: string
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col bg-[var(--canvas)] text-foreground">
      <header className="flex h-16 shrink-0 items-center px-4 md:px-6">
        <Link
          href={brandHref}
          aria-label="EwaTrade home"
          className="inline-flex rounded-[var(--ui-radius-item)]"
        >
          <img
            src="/brand/ewatrade-logo-precision-rise-v1-mono.svg"
            alt="ẸwáTrade"
            width={128}
            height={28}
            className="block h-7 w-auto dark:hidden"
          />
          <img
            src="/brand/ewatrade-logo-precision-rise-v1-reverse.svg"
            alt="ẸwáTrade"
            width={128}
            height={28}
            className="hidden h-7 w-auto dark:block"
          />
        </Link>
      </header>
      <main className="flex flex-1 justify-center px-4 pb-12 pt-4 sm:items-center sm:pb-24 sm:pt-0">
        <div className="w-full max-w-[26rem]">
          <section className="rounded-[var(--ui-radius-surface)] border border-border bg-card p-6 sm:p-8">
            <h1 className="text-[1.75rem] leading-tight">{title}</h1>
            {description ? (
              <div className="mt-2 text-muted-foreground">{description}</div>
            ) : null}
            {children ? <div className="mt-6">{children}</div> : null}
          </section>
          {footer ? (
            <div className="mt-6 text-center text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

/** Inline text link in the Midnight Paper link colour. */
export function AuthLink({
  href,
  children,
  className = "",
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <a
      href={href}
      className={`font-medium text-[var(--link)] underline-offset-4 hover:underline ${className}`}
    >
      {children}
    </a>
  )
}
