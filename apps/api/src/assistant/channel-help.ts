import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { WhatsAppControlCapability } from "@ewatrade/assistant/channels/controls"
import { whatsAppCapabilityEnabled } from "@ewatrade/assistant/channels/policy"
import type { resolveAssistantWhatsAppConversation } from "@ewatrade/db/assistant-whatsapp"
import type { Prisma, PrismaClient } from "@ewatrade/db/types"
import { resolveLinkedAssistantIdentity } from "./channel-principal"
import {
  assertGeneralActionHandoffAuthority,
  canUseCapability,
} from "./general-context"

type Selected = Awaited<ReturnType<typeof resolveAssistantWhatsAppConversation>>
const structuredStarters = [
  ["sales.order.record_simple", "Record sale"],
  ["customers.create", "Add customer"],
  ["catalog.product.create", "Add product"],
  ["finance.expense.record_simple", "Record expense"],
  ["inventory.stock.receive", "Receive stock"],
] as const

/** Navigation only; app destinations use the canonical destination authority check. */
export async function assistantWhatsAppMenuCapabilities(
  selected: Selected,
  db: PrismaClient | Prisma.TransactionClient,
): Promise<readonly WhatsAppControlCapability[]> {
  if (selected.conversation.purpose !== "GENERAL") return []
  const resolved = await resolveLinkedAssistantIdentity(db, {
    ...selected.principal,
    bindingId: selected.binding.id,
    selectionGeneration: selected.binding.selectionGeneration,
  })
  const context = {
    session: resolved.identity,
    tenantContext: resolved.tenantContext,
  }
  return capabilityManifest.flatMap(
    (capability): WhatsAppControlCapability[] => {
      let availability: "native" | "app_review"
      if (
        whatsAppCapabilityEnabled(capability) &&
        canUseCapability(context, capability)
      )
        availability = "native"
      else {
        if (capability.mode !== "write") return []
        try {
          assertGeneralActionHandoffAuthority(context, capability)
        } catch {
          return []
        }
        availability = "app_review"
      }
      const starter = structuredStarters.find(
        ([id]) => id === capability.id,
      )?.[1]
      return [
        {
          id: capability.id,
          domain: capability.domain,
          title: starter ?? capability.title,
          example: starter ?? capability.examples[0] ?? capability.title,
          availability,
        },
      ]
    },
  )
}

/** Hints only. Every displayed operation passes the same live channel/domain policy as a turn. */
export async function assistantWhatsAppHelpExamples(
  selected: Selected,
  db: PrismaClient | Prisma.TransactionClient,
): Promise<readonly string[]> {
  const available = (
    await assistantWhatsAppMenuCapabilities(selected, db)
  ).filter((capability) => capability.availability === "native")
  const examples: string[] = []
  for (const [id, text] of structuredStarters)
    if (available.some((capability) => capability.id === id))
      examples.push(text)
  const domains = new Set<string>()
  for (const capability of available) {
    if (examples.length >= 6) break
    const entry = capabilityManifest.find((entry) => entry.id === capability.id)
    if (entry?.mode !== "read" || domains.has(capability.domain)) continue
    const example = capability.example
    if (example && !examples.includes(example)) {
      examples.push(example)
      domains.add(capability.domain)
    }
  }
  return examples.slice(0, 6)
}
