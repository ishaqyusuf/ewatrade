import { expect, test } from "bun:test"
import {
  DirectTelegramBotProvider,
  parseAssistantTelegramUpdate,
} from "./telegram"
import { readTelegramMedia } from "./telegram-media"

const base = {
  message_id: 41,
  date: 1_784_000_000,
  from: { id: 4_501_234_567_890, is_bot: false, first_name: "Ada" },
  chat: { id: 4_501_234_567_890, type: "private" },
}
const update = (message: Record<string, unknown>) => ({
  update_id: 9001,
  message: { ...base, ...message },
})
const photo = [
  { file_id: "AgAD-small", file_unique_id: "u1", width: 90, height: 90 },
  { file_id: "AgAD-large", file_unique_id: "u2", width: 1280, height: 960 },
]

test("recognises photos, files, videos and voice notes without keeping files or captions", () => {
  const parsed = parseAssistantTelegramUpdate(
    update({ photo, caption: "receipt for S-1038" }),
  )
  expect(parsed).toEqual({
    updateId: "9001",
    chatId: "4501234567890",
    userId: "4501234567890",
    messageId: "41",
    occurredAt: new Date(1_784_000_000_000),
    kind: "media",
    media: "photo",
    mediaGroupId: null,
    attachable: true,
  })
  // No file ID, caption, name or MIME type leaves the parser.
  expect(JSON.stringify(parsed)).not.toMatch(/AgAD|receipt|file_id/)

  expect(
    readTelegramMedia({ voice: { file_id: "v", duration: 7 } }),
  ).toMatchObject({ media: "voice", attachable: false })
  expect(readTelegramMedia({ video_note: { file_id: "n" } })).toMatchObject({
    media: "video_note",
  })
  expect(readTelegramMedia({ video: { file_id: "m" } })).toMatchObject({
    media: "video",
    attachable: false,
  })
  expect(readTelegramMedia({ audio: { file_id: "a" } })).toMatchObject({
    media: "audio",
    attachable: false,
  })
})

test("only photo and PDF documents count as attachable in the EwaTrade chat", () => {
  const doc = (mime_type?: string) =>
    readTelegramMedia({ document: { file_id: "d", mime_type } })
  expect(doc("application/pdf")).toMatchObject({ attachable: true })
  expect(doc("image/jpeg")).toMatchObject({ attachable: true })
  expect(doc("application/zip")).toMatchObject({ attachable: false })
  expect(doc()).toMatchObject({ media: "document", attachable: false })
})

test("keeps the album group ID and ignores malformed ones", () => {
  expect(
    readTelegramMedia({ photo, media_group_id: "13945875392561" }),
  ).toMatchObject({ mediaGroupId: "13945875392561" })
  expect(
    readTelegramMedia({ photo, media_group_id: "x".repeat(65) }),
  ).toMatchObject({ mediaGroupId: null })
  expect(readTelegramMedia({ photo, media_group_id: 12 })).toMatchObject({
    mediaGroupId: null,
  })
})

test("text still wins, and stickers, groups and bots stay unhandled", () => {
  expect(
    parseAssistantTelegramUpdate(update({ text: "Hi", photo })),
  ).toMatchObject({ kind: "message", text: "Hi" })
  expect(
    parseAssistantTelegramUpdate(update({ sticker: { file_id: "s" } })),
  ).toBeNull()
  expect(parseAssistantTelegramUpdate(update({ photo: [] }))).toBeNull()
  expect(
    parseAssistantTelegramUpdate(
      update({ photo, chat: { id: -100, type: "group" } }),
    ),
  ).toBeNull()
  expect(
    parseAssistantTelegramUpdate(
      update({ photo, from: { id: 77, is_bot: true } }),
    ),
  ).toBeNull()
})

test("a reply can quote the user's message, and still sends if it was deleted", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const bot = new DirectTelegramBotProvider(
    { token: "123:synthetic_test_token_123456789" },
    async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      return Response.json({ ok: true, result: { message_id: 52 } })
    },
  )
  expect(
    await bot.sendMessage({
      chatId: "4501234567890",
      text: "I can only read text messages here for now.",
      replyToMessageId: "41",
    }),
  ).toEqual({ status: "accepted", messageId: "52" })
  expect(calls[0]?.body.reply_parameters).toEqual({
    message_id: 41,
    allow_sending_without_reply: true,
  })
  expect(
    await bot.sendMessage({
      chatId: "4501234567890",
      text: "x",
      replyToMessageId: "not-an-id",
    }),
  ).toEqual({ status: "failed" })
})
