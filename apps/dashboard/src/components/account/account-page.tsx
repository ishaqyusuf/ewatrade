import { PublicBrand } from "@/components/auth/auth-shell"
import { SignOut } from "@/components/dashboard/sign-out"
import Link from "next/link"
import type { ReactNode } from "react"

/**
 * Personal account pages outside the shell (WhatsApp, Telegram, assistant
 * data): logo and Sign out on top, one <h1>, the page's sections, then links.
 */
export function AccountPage({
  title,
  links,
  children,
}: {
  title: string
  links?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col bg-[var(--canvas)] text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 px-4 md:px-6">
        <PublicBrand label="Back to EwaTrade" />
        <SignOut appearance="button" />
      </header>
      <main className="mx-auto grid w-full max-w-2xl gap-8 px-4 pt-4 pb-12">
        <h1 className="text-[1.75rem] leading-tight">{title}</h1>
        {children}
        {links ? (
          <nav className="flex flex-wrap gap-x-6 gap-y-2">{links}</nav>
        ) : null}
      </main>
    </div>
  )
}

export function AccountLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  )
}
