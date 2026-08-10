import {
  DirectMetaWhatsAppProvider,
  protectCommunicationsCredential,
  verifyEmbeddedSignupState,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import { createWhatsAppEmbeddedSignupSession } from "@ewatrade/db/queries"
import type { OpenAPIHono } from "@hono/zod-openapi"

function dashboardRedirect(status: string) {
  const dashboard =
    process.env.NEXT_PUBLIC_DASHBOARD_URL?.replace(/\/$/, "") ??
    "http://ewatrade-dashboard.localhost"
  const url = new URL(`${dashboard}/settings/channels`)
  url.searchParams.set("whatsapp", status)
  if (status === "select-number") {
    url.searchParams.set("serviceCommerceSheet", "connection")
  }
  return url.toString()
}

export function registerWhatsAppEmbeddedSignupRoutes(app: OpenAPIHono) {
  app.get(
    "/api/communications/whatsapp/embedded-signup/callback",
    async (c) => {
      const stateSecret = process.env.META_EMBEDDED_SIGNUP_STATE_SECRET?.trim()
      const appId = process.env.META_APP_ID?.trim()
      const appSecret = process.env.META_APP_SECRET?.trim()
      const code = c.req.query("code")
      const state = c.req.query("state")
      const verified =
        stateSecret && state
          ? verifyEmbeddedSignupState(state, stateSecret)
          : null
      if (!verified || !appId || !appSecret || !code) {
        return c.redirect(dashboardRedirect("invalid"), 302)
      }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")
      if (!apiUrl) return c.redirect(dashboardRedirect("unavailable"), 302)
      const provider = new DirectMetaWhatsAppProvider()
      try {
        const authorization = await provider.exchangeEmbeddedSignupCode({
          appId,
          appSecret,
          code,
          redirectUri: `${apiUrl}/api/communications/whatsapp/embedded-signup/callback`,
        })
        const numbers = await provider.discover({
          accessToken: authorization.accessToken,
        })
        if (!numbers.length)
          return c.redirect(dashboardRedirect("no-number"), 302)
        await createWhatsAppEmbeddedSignupSession(prisma, {
          credentialReference: protectCommunicationsCredential(
            authorization.accessToken,
          ),
          discoveredNumbers: numbers,
          storeId: verified.storeId,
          tenantId: verified.tenantId,
          userId: verified.userId,
        })
        return c.redirect(dashboardRedirect("select-number"), 302)
      } catch {
        return c.redirect(dashboardRedirect("failed"), 302)
      }
    },
  )
}
