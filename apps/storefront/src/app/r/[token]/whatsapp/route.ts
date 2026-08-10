import { prisma } from "@ewatrade/db"
import { resolveCustomerEntryPointWhatsAppRedirect } from "@ewatrade/db/queries"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  const action = await resolveCustomerEntryPointWhatsAppRedirect(prisma, {
    publicToken: token,
  }).catch(() => null)
  if (!action) {
    return new Response("This WhatsApp channel is unavailable.", {
      status: 404,
    })
  }
  const phone = action.displayNumber.replace(/\D/g, "")
  if (!phone) {
    return new Response("This WhatsApp channel is unavailable.", {
      status: 404,
    })
  }
  const text = encodeURIComponent(`Start ewastore:${action.contextToken}`)
  return Response.redirect(`https://wa.me/${phone}?text=${text}`, 302)
}
