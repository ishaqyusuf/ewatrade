import { getServerSession } from "@/lib/session"
import { redirect } from "next/navigation"

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com"

export const metadata = {
  title: "Set up your store — ewatrade Dashboard",
}

export default async function SetupLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await getServerSession()

  if (!session) {
    redirect(`${MARKETING_URL}/login`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Minimal header */}
      <header className="flex h-14 items-center border-b border-border/60 px-6">
        <span className="text-sm font-semibold text-foreground">ewatrade</span>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12">
        {children}
      </main>
    </div>
  )
}
