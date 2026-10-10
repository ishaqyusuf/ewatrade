import { requireGeneralScope } from "./general-context"
import { requireSetupAssistantScope } from "./setup-context"

type Purpose = "SETUP" | "PRODUCT_CREATE" | "GENERAL"
type AttachmentContext = Parameters<typeof requireSetupAssistantScope>[0] &
  Parameters<typeof requireGeneralScope>[0]

/**
 * Who may upload assistant voice notes and files, and into which chats.
 * Owners and admins use setup, product and their own general chats; anyone
 * else who can use the general assistant records voice in their general chats.
 */
export function requireAssistantAttachmentScope(ctx: AttachmentContext) {
  try {
    return {
      ...requireSetupAssistantScope(ctx),
      purposes: ["SETUP", "PRODUCT_CREATE", "GENERAL"] as Purpose[],
    }
  } catch (setupError) {
    try {
      return {
        ...requireGeneralScope(ctx),
        purposes: ["GENERAL"] as Purpose[],
      }
    } catch {
      throw setupError
    }
  }
}
