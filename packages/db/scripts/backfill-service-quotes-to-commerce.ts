import { prisma } from "../src/client"
import { backfillServiceQuotesToCommerce } from "../src/migrations/service-quotes-to-commerce"

const result = await backfillServiceQuotesToCommerce(prisma)
console.info("Service Quote Commerce backfill verified", result)
await prisma.$disconnect()
