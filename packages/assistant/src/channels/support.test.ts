import { expect, test } from "bun:test"
import {
  type WhatsAppControlMenu,
  parseWhatsAppControl,
  renderWhatsAppControl,
} from "./controls"
import { whatsAppSupportHandoff } from "./support"

test("support aliases use deterministic Help and only the approved fixed public contact is rendered", () => {
  for (const alias of [
    "Support",
    " /support ",
    "Contact support",
    "HELP",
    "menu",
  ])
    expect(parseWhatsAppControl(alias)).toEqual({ kind: "help" })
  for (const work of [
    "support my cash sale",
    "contact support for account 123",
    "support https://untrusted.test",
  ])
    expect(parseWhatsAppControl(work)).toBeNull()
  const scope = {
    grantId: "private-grant",
    grantGeneration: 1,
    storeId: "private-store",
  }
  const menu: WhatsAppControlMenu = {
    version: "whatsapp-control-v1",
    identityGeneration: 1,
    selectionGeneration: 1,
    quotaScope: scope,
    scopes: [scope],
    title: "Business · Store",
    detail: "https://untrusted.test/?token=private-token",
    support: true,
    choices: [],
  }
  const body = renderWhatsAppControl(menu)
  expect(body).toContain(whatsAppSupportHandoff())
  expect(body).toContain("support@ewatrade.com")
  expect(body).toContain("https://ewatrade.com/support")
  expect(body).toContain("Send Disconnect")
  for (const secret of [
    "untrusted.test",
    "private-token",
    "private-grant",
    "private-store",
  ])
    expect(body).not.toContain(secret)
  expect(renderWhatsAppControl({ ...menu, support: undefined })).not.toContain(
    "https://ewatrade.com/support",
  )
})
