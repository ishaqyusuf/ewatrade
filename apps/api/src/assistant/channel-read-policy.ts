import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type {
  Capability,
  CapabilityRole,
} from "@ewatrade/assistant/capabilities/types"
import { whatsAppCapabilityEnabled } from "@ewatrade/assistant/channels/policy"
import { TRPCError } from "@trpc/server"
import { generalCapabilityEnabled } from "./general-rollout"

/** A linked domain caller is a specific authorized read, never an unrestricted internal caller. */
export function assertLinkedAssistantRead(
  input: {
    capabilityId?: string
    path: string
    type: string
    role: string
  },
  environment: Record<string, string | undefined> = process.env,
) {
  const capability: Capability | undefined = capabilityManifest.find(
    (entry) => entry.id === input.capabilityId,
  )
  const supportRead =
    input.path === "finance.book" &&
    capability &&
    (capability.domain === "finance" || capability.domain === "customers")
  if (
    !capability ||
    capability.mode !== "read" ||
    input.type !== "query" ||
    !capability.clients.includes("whatsapp") ||
    !generalCapabilityEnabled(capability) ||
    !whatsAppCapabilityEnabled(capability, environment) ||
    !capability.policy.roles.includes(input.role as CapabilityRole) ||
    (!capability.procedures.includes(input.path) && !supportRead)
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This operation is not available through the WhatsApp assistant.",
    })
  return capability
}
