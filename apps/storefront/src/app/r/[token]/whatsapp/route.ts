import { prisma } from "@ewatrade/db"
import { resolveCustomerEntryPointWhatsAppRedirect } from "@ewatrade/db/queries"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
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
  const intent = new URL(request.url).searchParams.get("intent")
  const selection = intent === "product" ? " intent:product" : ""
  const text = encodeURIComponent(
    `Start ewastore:${action.contextToken}${selection}`,
  )
  return Response.redirect(`https://wa.me/${phone}?text=${text}`, 302)
}
