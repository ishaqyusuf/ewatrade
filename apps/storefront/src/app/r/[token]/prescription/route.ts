import { prisma } from "@ewatrade/db"
import {
  CustomerChannelsError,
  resolveCustomerEntryPointPrescriptionRedirect,
} from "@ewatrade/db/queries"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const sourceUrl = new URL(request.url)
  let channel: Awaited<
    ReturnType<typeof resolveCustomerEntryPointPrescriptionRedirect>
  > | null
  try {
    channel = await resolveCustomerEntryPointPrescriptionRedirect(prisma, {
      publicToken: token,
    })
  } catch (error) {
    if (!(error instanceof CustomerChannelsError)) throw error
    channel = null
  }
  return channel
    ? (() => {
        const target = new URL(
          `/prescription/${encodeURIComponent(channel.publicToken)}`,
          request.url,
        )
        const conversationId = sourceUrl.searchParams.get("conversationId")
        const messageId = sourceUrl.searchParams.get("messageId")
        if (
          conversationId &&
          conversationId.length <= 191 &&
          messageId &&
          messageId.length <= 191
        ) {
          target.searchParams.set("conversationId", conversationId)
          target.searchParams.set("entryToken", token)
          target.searchParams.set("messageId", messageId)
        }
        return Response.redirect(target, 302)
      })()
    : new Response("This prescription channel is unavailable.", {
        status: 404,
      })
}
