import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// @ts-expect-error Bun test runtime types are outside the jobs package tsconfig.
import { afterEach, describe, expect, mock, test } from "bun:test"

const originalEmailCaptureFile = process.env.EMAIL_CAPTURE_FILE
const originalMarketingInboxEmails = process.env.MARKETING_INBOX_EMAILS
const originalNodeEnv = process.env.NODE_ENV
const originalTestEmail = process.env.TEST_EMAIL
const originalTestEmails = process.env.TEST_EMAILS

afterEach(() => {
  restoreEnv("EMAIL_CAPTURE_FILE", originalEmailCaptureFile)
  restoreEnv("MARKETING_INBOX_EMAILS", originalMarketingInboxEmails)
  restoreEnv("NODE_ENV", originalNodeEnv)
  restoreEnv("TEST_EMAIL", originalTestEmail)
  restoreEnv("TEST_EMAILS", originalTestEmails)
})

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key)
    return
  }

  process.env[key] = value
}

describe("notification dispatch handler", () => {
  test("records marketing lead email delivery receipts on the lead metadata", async () => {
    const updateCalls: unknown[] = []
    const directory = await mkdtemp(join(tmpdir(), "ewatrade-jobs-capture-"))
    const captureFile = join(directory, "messages.jsonl")

    mock.module("@ewatrade/db/client", () => ({
      prisma: {
        leadCapture: {
          async findUnique() {
            return {
              metadata: {
                source: "existing",
              },
            }
          },
          async update(args: unknown) {
            updateCalls.push(args)

            return {}
          },
        },
      },
    }))

    try {
      process.env.EMAIL_CAPTURE_FILE = captureFile
      process.env.MARKETING_INBOX_EMAILS = "founders@ewatrade.com"
      process.env.NODE_ENV = "production"
      process.env.TEST_EMAILS = "founders@ewatrade.com"
      Reflect.deleteProperty(process.env, "TEST_EMAIL")

      const { notificationDispatchHandler } = await import(
        "./notification-dispatch"
      )

      await notificationDispatchHandler(
        {
          payload: {
            companyName: "Codex Laundry",
            email: "owner@test.com",
            fullName: "Codex Owner",
            id: "lead_early_access_1",
          },
          type: "marketing_waitlist_joined",
        },
        1,
      )

      expect(updateCalls).toHaveLength(1)
      const update = updateCalls[0] as {
        data?: {
          metadata?: {
            lastNotificationDispatch?: {
              providerStatuses?: string[]
              receipts?: Array<{
                provider?: string | null
                recipientEmail?: string
                status?: string
              }>
              sent?: number
              status?: string
            }
            source?: string
          }
        }
      }

      expect(update.data?.metadata?.source).toBe("existing")
      expect(update.data?.metadata?.lastNotificationDispatch).toMatchObject({
        providerStatuses: ["sent", "sent"],
        sent: 2,
        status: "sent",
      })
      expect(
        update.data?.metadata?.lastNotificationDispatch?.receipts?.map(
          (receipt) => ({
            provider: receipt.provider,
            recipientEmail: receipt.recipientEmail,
            status: receipt.status,
          }),
        ),
      ).toEqual([
        {
          provider: "capture",
          recipientEmail: "founders@ewatrade.com",
          status: "sent",
        },
        {
          provider: "capture",
          recipientEmail: "founders@ewatrade.com",
          status: "sent",
        },
      ])

      const capturedMessages = (await readFile(captureFile, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { text: string; to: string })

      expect(capturedMessages).toHaveLength(2)
      expect(capturedMessages.map((message) => message.to)).toEqual([
        "founders@ewatrade.com",
        "founders@ewatrade.com",
      ])
      expect(
        capturedMessages.some((message) =>
          message.text.includes("Original recipient: owner@test.com"),
        ),
      ).toBe(true)
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
