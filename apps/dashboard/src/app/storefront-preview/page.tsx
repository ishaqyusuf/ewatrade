import { StorefrontPreview } from "@/components/storefront/storefront-preview"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import { Geist } from "next/font/google"
import { redirect } from "next/navigation"
import "@ewatrade/storefront-templates/styles.css"

export const metadata = {
  title: "Private storefront preview",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"
const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

export default async function PreviewPage({
  searchParams,
}: { searchParams: Promise<{ session?: string }> }) {
  const auth = await getServerSession()
  const context = auth ? await getActiveTenant(auth.user.id) : null
  if (!auth || !context) redirect("/login")
  const role = normalizeRole(context.membership.role)
  if (!role || !canManageTenant(role)) redirect("/")
  const { session } = await searchParams
  return (
    <div className={geist.variable}>
      <StorefrontPreview session={session ?? ""} />
    </div>
  )
}
