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

  return <>{children}</>
}
