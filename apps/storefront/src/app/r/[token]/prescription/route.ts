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
    ? Response.redirect(
        new URL(
          `/prescription/${encodeURIComponent(channel.publicToken)}`,
          request.url,
        ),
        302,
      )
    : new Response("This prescription channel is unavailable.", {
        status: 404,
      })
}
