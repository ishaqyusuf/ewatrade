import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { ProductForm } from "../_components/product-form"

export default async function NewProductPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null

  if (!ctx?.activeStore) return null

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <ProductForm mode="create" currencyCode={ctx.activeStore.currencyCode} />
    </div>
  )
}
