import { describe, expect, test } from "bun:test"
import { OpenAPIHono } from "@hono/zod-openapi"

import { registerStoreConversationAttachmentRoutes } from "./conversation-attachments-routes"

describe("mobile Store Conversation attachment route", () => {
  test("passes purpose-bound mobile headers to the upload boundary and returns a safe created response", async () => {
    const calls: unknown[] = []
    const app = new OpenAPIHono()
    registerStoreConversationAttachmentRoutes(app, {
      parse: async (request, auth) => {
        calls.push([request.url, auth])
        return {
          message: {
            attachments: [
              {
                id: "conversation-attachment-1",
                kind: "image",
                label: "Image attachment",
                recovery: null,
                state: "pending",
                viewable: false,
              },
            ],
            id: "message-1",
          },
          replayed: false,
        } as never
      },
    })

    const response = await app.request(
      "/api/service-commerce/conversations/attachments",
      {
        body: new FormData(),
        headers: {
          "x-store-conversation-credential": "c".repeat(32),
          "x-store-conversation-installation": "i".repeat(32),
        },
        method: "POST",
      },
    )
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toMatchObject({
      message: {
        attachments: [
          {
            id: "conversation-attachment-1",
            kind: "image",
            state: "pending",
          },
        ],
      },
      replayed: false,
    })
    expect(calls).toEqual([
      [
        "http://localhost/api/service-commerce/conversations/attachments",
        {
          channel: "mobile",
          credentialToken: "c".repeat(32),
          installationToken: "i".repeat(32),
        },
      ],
    ])
    expect(JSON.stringify(body).toLowerCase()).not.toContain("objectkey")
  })
})
