import { expect, test } from "bun:test"
import type { AssistantTelegramConfig } from "@ewatrade/communications"
import {
  acceptAssistantTelegramMedia,
  claimTelegramAlbumReply,
  telegramMediaReply,
} from "./telegram-media"
import { telegramCopy } from "./telegram-presentation"

const config: AssistantTelegramConfig = {
  enabled: true,
  botId: "123",
  username: "ewatrade_test_bot",
  token: "123:synthetic_test_token_123456789",
  webhookSecret: "synthetic_test_webhook_secret",
  allowedUserIds: new Set(["person-1"]),
  allowedTenantIds: new Set(["tenant-1"]),
}
const media = (
  overrides: Partial<{
    media: "photo" | "document" | "video" | "audio" | "voice" | "video_note"
    mediaGroupId: string | null
    attachable: boolean
  }> = {},
) => ({
  updateId: "9001",
  chatId: "4501234567890",
  userId: "4501234567890",
  messageId: "41",
  occurredAt: new Date(1_784_000_000_000),
  kind: "media" as const,
  media: "photo" as const,
  mediaGroupId: null,
  attachable: true,
  ...overrides,
})
const scope = {
  userId: "person-1",
  tenantId: "tenant-1",
  storeId: "store-1",
  membershipId: "membership-1",
  conversationId: "conversation-1",
}
const connected = { readScope: (async () => scope) as never }
const unconnected = { readScope: (async () => null) as never }

test("f-today and v-today copy: text only, with the attach hand-off only where EwaTrade accepts it", () => {
  expect(telegramMediaReply(media(), false)).toBe(
    "I can only read text messages here for now. Open this same chat in EwaTrade to attach your photo.",
  )
  expect(telegramMediaReply(media(), true)).toEndWith("attach your photos.")
  expect(
    telegramMediaReply(media({ media: "document", attachable: true }), false),
  ).toEndWith("attach your file.")
  expect(
    telegramMediaReply(media({ media: "video", attachable: false }), false),
  ).toBe(
    "I can only read text messages here for now. The same chat in EwaTrade accepts photos and PDFs.",
  )
  expect(
    telegramMediaReply(media({ media: "voice", attachable: false }), false),
  ).toBe("I can only read text messages here for now. Please type it instead.")
})

test("a connected chat's photo gets a quoted reply with Open chat in EwaTrade", async () => {
  const previous = process.env.DASHBOARD_URL
  process.env.DASHBOARD_URL = "https://dash.example.test"
  try {
    const { notice } = await acceptAssistantTelegramMedia(
      config,
      media(),
      connected,
    )
    expect(notice?.replyTo).toBe("41")
    expect(notice?.text).toEndWith("attach your photo.")
    expect(notice?.buttons).toEqual([
      [
        {
          text: "Open chat in EwaTrade",
          url: "https://dash.example.test/assistant/c/conversation-1",
        },
      ],
    ])
    const voice = await acceptAssistantTelegramMedia(
      config,
      media({ media: "voice", attachable: false }),
      connected,
    )
    expect(voice.notice?.buttons).toBeUndefined()
    expect(voice.notice?.replyTo).toBe("41")
  } finally {
    process.env.DASHBOARD_URL = previous
  }
})

test("local app origins get the reply without a URL button", async () => {
  const previous = process.env.DASHBOARD_URL
  process.env.DASHBOARD_URL = "http://localhost:3000"
  try {
    const { notice } = await acceptAssistantTelegramMedia(
      config,
      media(),
      connected,
    )
    expect(notice?.text).toEndWith("attach your photo.")
    expect(notice?.buttons).toBeUndefined()
  } finally {
    process.env.DASHBOARD_URL = previous
  }
})

test("unconnected chats get the entry reply; outside the pilot or disabled stays silent", async () => {
  const entry = await acceptAssistantTelegramMedia(config, media(), unconnected)
  expect(entry.notice?.text).toBe(telegramCopy.entry)
  expect(entry.notice?.replyTo).toBeUndefined()
  expect(
    await acceptAssistantTelegramMedia(
      { ...config, allowedTenantIds: new Set() },
      media(),
      connected,
    ),
  ).toEqual({})
  expect(
    await acceptAssistantTelegramMedia(
      { ...config, enabled: false },
      media(),
      connected,
    ),
  ).toEqual({})
})

test("an album is answered once per media_group_id", async () => {
  const album = media({ mediaGroupId: "album-1" })
  const replies = await Promise.all(
    ["41", "42", "43"].map((messageId) =>
      acceptAssistantTelegramMedia(config, { ...album, messageId }, connected),
    ),
  )
  const answered = replies.filter(({ notice }) => notice)
  expect(answered).toHaveLength(1)
  expect(answered[0]?.notice?.replyTo).toBe("41")
  expect(answered[0]?.notice?.text).toEndWith("attach your photos.")
  // A different album in the same chat is answered on its own.
  expect(
    (
      await acceptAssistantTelegramMedia(
        config,
        media({ mediaGroupId: "album-2" }),
        connected,
      )
    ).notice,
  ).toBeDefined()
})

test("the album window expires and stays bounded", () => {
  const start = Date.now() + 10 * 60_000
  expect(claimTelegramAlbumReply("window", start)).toBe(true)
  expect(claimTelegramAlbumReply("window", start + 59_000)).toBe(false)
  expect(claimTelegramAlbumReply("window", start + 61_000)).toBe(true)
  for (let index = 0; index < 2_100; index++)
    claimTelegramAlbumReply(`bulk-${index}`, start + 61_000)
  expect(claimTelegramAlbumReply("bulk-2099", start + 61_000)).toBe(false)
})
