import { getDashboardLoginUrl } from "@/lib/auth-navigation"
import { NotificationsProvider } from "@ewatrade/notifications-react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import "./signup.css"

export const metadata: Metadata = {
  title: "Create your workspace — EwaTrade",
  description:
    "One connected place for your products, orders and everyday work.",
}

export default function SignupLayout({
  children,
}: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_SIGNUP_ENABLED !== "true")
    redirect("/#early-access")
  return (
    <div className="signup-shell">
      <NotificationsProvider>
        <header className="signup-header">
          <a href="/" aria-label="EwaTrade home">
            <img
              src="/brand/ewatrade-logo-yoruba-v1.png"
              alt="ẸwáTrade"
              width={145}
              height={45}
            />
          </a>
          <a href="/">Come. Trade. Together.</a>
        </header>
        {children}
        <footer className="signup-footer">
          Already have an account? <a href={getDashboardLoginUrl()}>Sign in</a>
          {" · "}
          <a href="/">Back to EwaTrade</a>
        </footer>
      </NotificationsProvider>
    </div>
  )
}
