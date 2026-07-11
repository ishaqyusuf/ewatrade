import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import { createTRPCRouter } from "../init"
import { retailOpsRouter } from "./retail-ops"
import { tenantRouter } from "./tenant"

export const appRouter = createTRPCRouter({
  retailOps: retailOpsRouter,
  tenant: tenantRouter,
})

export type AppRouter = typeof appRouter
export type RouterInputs = inferRouterInputs<AppRouter>
export type RouterOutputs = inferRouterOutputs<AppRouter>
