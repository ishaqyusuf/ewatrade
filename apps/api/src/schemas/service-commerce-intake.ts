import {
  serviceCommerceIntakeAcceptedSchema,
  serviceCommerceIntakeEnvelopeSchema,
  serviceCommerceIntakeRecoverySchema,
} from "@ewatrade/service-commerce/schemas"
import { z } from "zod"

function forChannel(channel: "staff" | "web" | "whatsapp") {
  return serviceCommerceIntakeEnvelopeSchema.refine(
    (value) => value.channel === channel,
    {
      message: `This endpoint accepts ${channel} intake only.`,
      path: ["channel"],
    },
  )
}

export const publicServiceCommerceIntakeSchema = forChannel("web")
export const staffServiceCommerceIntakeSchema = forChannel("staff")
export const whatsAppServiceCommerceIntakeSchema = forChannel("whatsapp")

export const serviceCommerceIntakeResultSchema = z.union([
  serviceCommerceIntakeAcceptedSchema,
  serviceCommerceIntakeRecoverySchema,
])
