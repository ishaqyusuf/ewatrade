import type { Metadata } from "next"
import { redirect } from "next/navigation"
import "@ewatrade/ui/globals.css"
import { cn } from "@/utils"
import { NotificationsProvider } from "@ewatrade/notifications-react"
import { Fraunces, Geist } from "next/font/google"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "WONK"],
})

export const metadata: Metadata = {
  title: "Create your workspace — ewatrade",
  description:
    "Sign up for ewatrade and launch your merchant workspace with a branded storefront, POS, and operations dashboard.",
}

export default function SignupLayout({
  children,
}: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_SIGNUP_ENABLED !== "true") {
    redirect("/")
  }

  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable, fraunces.variable)}
    >
      <body>
        <NotificationsProvider>
          {/* Minimal chrome: just the logo */}
          <header className="flex h-16 items-center px-6 sm:px-10">
            <a
              href="/"
              className="text-xl font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
              style={{ fontFamily: "var(--font-display)" }}
            >
              ewatrade
            </a>
          </header>

          {/* Page content */}
          <main>{children}</main>

          {/* Minimal footer */}
          <footer className="mt-16 border-t border-border/40 px-6 py-6 text-center sm:px-10">
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <a
                href="/login"
                className="text-foreground underline-offset-2 hover:underline"
              >
                Sign in
              </a>
              {" · "}
              <a
                href="/"
                className="text-foreground underline-offset-2 hover:underline"
              >
                Back to ewatrade.com
              </a>
            </p>
          </footer>
        </NotificationsProvider>
      </body>
    </html>
  )
}
