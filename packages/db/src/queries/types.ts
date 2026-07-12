import type { Prisma, PrismaClient } from "../../generated/prisma/client"

export type DbClient = PrismaClient | Prisma.TransactionClient
