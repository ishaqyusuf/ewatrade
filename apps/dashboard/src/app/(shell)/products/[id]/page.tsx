import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import { notFound } from "next/navigation"
import { ProductForm } from "../_components/product-form"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null

  if (!ctx?.activeStore) return null

  const product = await prisma.product.findFirst({
    where: { id, storeId: ctx.activeStore.id },
    select: {
      id: true,
      name: true,
      description: true,
      sku: true,
      status: true,
      listPriceMinor: true,
      salePriceMinor: true,
      isMarketplaceListed: true,
      isPublished: true,
      variants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          optionSummary: true,
          priceMinor: true,
          compareAtMinor: true,
          isDefault: true,
          isActive: true,
        },
      },
    },
  })

  if (!product) notFound()

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <ProductForm
        mode="edit"
        currencyCode={ctx.activeStore.currencyCode}
        initialData={product}
      />
    </div>
  )
}
