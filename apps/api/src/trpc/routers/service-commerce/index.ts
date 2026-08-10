import { mergeRouters } from "../../init"
import { serviceCommerceAccessRouter } from "./access"

export const serviceCommerceRouter = mergeRouters(serviceCommerceAccessRouter)
