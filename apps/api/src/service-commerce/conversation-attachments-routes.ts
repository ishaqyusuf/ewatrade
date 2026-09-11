import type { OpenAPIHono } from "@hono/zod-openapi"

import {
  parseGuestStoreConversationAttachmentRequest,
  storeConversationAttachmentErrorResponse,
} from "./conversation-attachments"

export function registerStoreConversationAttachmentRoutes(
  app: OpenAPIHono,
  dependencies: {
    parse?: typeof parseGuestStoreConversationAttachmentRequest
  } = {},
) {
  const parse =
    dependencies.parse ?? parseGuestStoreConversationAttachmentRequest
  app.post(
    "/api/service-commerce/conversations/attachments",
    async (context) => {
      try {
        const result = await parse(context.req.raw, {
          channel: "mobile",
          credentialToken: context.req.header(
            "x-store-conversation-credential",
          ),
          installationToken: context.req.header(
            "x-store-conversation-installation",
          ),
          uploadAuthorization: context.req.header(
            "x-store-conversation-attachment-authorization",
          ),
        })
        return context.json(result, result.replayed ? 200 : 201)
      } catch (error) {
        return storeConversationAttachmentErrorResponse(error)
      }
    },
  )
}
