import "@ewatrade/onboarding/styles/signup.css"
import { getServerSession } from "@/lib/session"
import { redirect } from "next/navigation"

export const metadata = {
  title: "Set up your store — ewatrade Dashboard",
}

export default async function SetupLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await getServerSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="signup-shell">
      <header className="signup-header">
        <a href="/" aria-label="EwaTrade home">
          <img
            src="/brand/ewatrade-logo-precision-rise-v1.svg"
            alt="ẸwáTrade"
            width={145}
            height={32}
          />
        </a>
      </header>
      {children}
    </div>
  )
}
