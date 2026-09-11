/**
 * Public Store Conversation WhatsApp bridge repository seam.
 *
 * Callers receive lifecycle commands and safe projections only. Authorization,
 * locking, policy/readiness checks, persistence and provider-recovery details
 * remain local to the repository implementation.
 */
export {
  StoreConversationWhatsAppBridgeError,
  type StoreConversationWhatsAppBridgeErrorCode,
  appendStoreConversationWhatsAppBridgeText,
  bindStoreConversationWhatsAppBridgeNewRequest,
  claimStoreConversationWhatsAppBridgePrompt,
  completeStoreConversationWhatsAppBridgePrompt,
  consumeStoreConversationWhatsAppBridge,
  failStoreConversationWhatsAppBridgePrompt,
  issueStoreConversationWhatsAppBridge,
  listDueStoreConversationWhatsAppBridgePrompts,
  projectStoreConversationWhatsAppBridgeIssue,
  resolveStoreConversationWhatsAppBridgeInboundRoute,
  selectStoreConversationWhatsAppBridgeChoice,
  selectStoreConversationWhatsAppBridgeRequestKind,
} from "./store-conversation-whatsapp-bridge-repository"
