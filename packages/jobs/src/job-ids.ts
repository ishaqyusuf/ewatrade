export const jobIds = {
  qaPurge: "platform.qa.purge",
  notificationDispatch: "notifications.dispatch",
  serviceNotificationDispatch: "services.notification.dispatch",
  storeConversationNotificationDispatch:
    "store-conversation.notification-dispatch",
  storeConversationNotificationVerification:
    "store-conversation.notification-verification",
  storeConversationPrivacyRequest: "store-conversation.privacy-request",
  storeConversationWhatsAppBridgePrompt:
    "store-conversation.whatsapp-bridge-prompt",
  storeConversationWhatsAppCandidatePrompt:
    "store-conversation.whatsapp-candidate-prompt",
  storeConversationWhatsAppOutbound: "store-conversation.whatsapp-outbound",
  storeConversationWhatsAppRecovery: "store-conversation.whatsapp-recovery",
  serviceCommerceMediaIngest: "service-commerce.media-ingest",
  serviceCommerceBookingNotificationDispatch:
    "service-commerce.booking-notification-dispatch",
  serviceCommerceCustomerNotificationDispatch:
    "service-commerce.customer-notification-dispatch",
  serviceCommerceCustomerNotificationSchedule:
    "service-commerce.customer-notification-schedule",
  serviceCommerceBookingReminders: "service-commerce.booking-reminders",
  serviceCommerceMediaSafety: "service-commerce.media-safety",
  serviceCommerceMediaRetention: "service-commerce.media-retention",
  serviceCommerceWhatsAppInbound: "service-commerce.whatsapp-inbound",
  domainRegistration: "domains.registration",
  domainConnectionVerification: "domains.connection.verify",
  domainReconciliation: "domains.reconcile",
  commercialOrderReminders: "orders.fulfillment-reminders",
  prescriptionTranscription: "prescriptions.transcription",
  prescriptionMediaSafety: "prescriptions.media-safety",
  prescriptionWhatsAppInbound: "prescriptions.whatsapp-inbound",
  prescriptionCommunicationDispatch: "prescriptions.communication-dispatch",
  whatsappConnectionTest: "communications.whatsapp-connection-test",
  prescriptionPrivacyRequest: "prescriptions.privacy-request",
} as const
