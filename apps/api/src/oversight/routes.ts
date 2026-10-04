import { prisma } from "@ewatrade/db"
import { createOversightRoutes } from "@ewatrade/oversight"
export const oversightRoutes = createOversightRoutes(() => prisma)
