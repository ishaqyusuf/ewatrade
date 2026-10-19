import { expect, test } from "bun:test"
import {
  type WhatsAppControlMenu,
  parseWhatsAppControl,
  renderWhatsAppControl,
  serializeWhatsAppControlMenu,
  whatsAppControlContentSchema,
  whatsAppControlLabel,
} from "./controls"

test("only explicit navigation commands bypass model input; amounts and ordinary work descriptions remain text", () => {
  for (const [text, kind] of [
    [" /HELP ", "help"],
    ["Switch business", "businesses"],
    ["Store", "stores"],
    ["New chat", "new"],
    ["Continue chat", "chats"],
  ] as const)
    expect(parseWhatsAppControl(text)?.kind).toBe(kind)
  for (const text of [
    "1",
    "123456",
    "new product",
    "help me record a sale",
    "choosecustomer",
    "choose Shop cash",
    "choose customer Amina",
    "Confirm",
    "Connect to EwaTrade: abc",
    "Disconnect",
  ])
    expect(parseWhatsAppControl(text)).toBeNull()
  expect(parseWhatsAppControl("Choose 2", "provider-menu")).toEqual({
    kind: "choose",
    index: 2,
    replyToMessageId: "provider-menu",
  })
  for (const text of ["Choose 0", "Choose 6", "Choose 2 extra", "Choose 999"])
    expect(parseWhatsAppControl(text, "provider-menu")).toEqual({
      kind: "invalid_choice",
    })
  expect(parseWhatsAppControl("Choose 1")).toEqual({ kind: "invalid_choice" })
})

test("menu labels preserve whole emoji at their size bound and omit unsafe link/control text", () => {
  expect(whatsAppControlLabel(`${"a".repeat(159)}😀`)).toBe("a".repeat(159))
  expect(whatsAppControlLabel("😀".repeat(90))).toBe("😀".repeat(80))
  expect(whatsAppControlLabel("Store\nhttps://unsafe.example\u202e")).toBe(
    "Store [link omitted]",
  )
})

test("control authority serialization survives database JSON key ordering and action validation", () => {
  const proof = { grantId: "grant", grantGeneration: 1, storeId: "store" }
  const before: WhatsAppControlMenu = {
    version: "whatsapp-control-v1",
    identityGeneration: 1,
    selectionGeneration: 1,
    quotaScope: proof,
    scopes: [proof],
    title: "Stores",
    detail: "Choose",
    choices: [{ label: "Store", action: { kind: "new", ...proof } }],
  }
  const after: WhatsAppControlMenu = {
    ...before,
    choices: [{ label: "Store", action: { ...proof, kind: "new" } }],
  }
  expect(serializeWhatsAppControlMenu(before)).toBe(
    serializeWhatsAppControlMenu(after),
  )
})

test("server menu rendering shows bounded choices without exposing scope identifiers or turning labels into links", () => {
  const proof = {
    grantId: "private-grant-id",
    grantGeneration: 1,
    storeId: "private-store-id",
  }
  const menu: WhatsAppControlMenu = {
    version: "whatsapp-control-v1",
    identityGeneration: 1,
    selectionGeneration: 2,
    quotaScope: proof,
    scopes: [proof],
    title: "Choose a business",
    detail: "Your connected businesses",
    choices: [
      {
        label: "Business\nhttps://evil.example",
        action: { kind: "stores", grantId: proof.grantId, grantGeneration: 1 },
      },
    ],
  }
  const body = renderWhatsAppControl(menu)
  expect(body).toContain("1. Business [link omitted]")
  expect(body).toContain("Reply to this message with Choose 1")
  expect(body).not.toContain("private-grant-id")
  expect(body).not.toContain("private-store-id")
  expect(body).not.toContain("https://")
  expect(
    whatsAppControlContentSchema.safeParse({
      type: "control",
      command: { kind: "help" },
      menu,
      actorUserId: "forged",
    }).success,
  ).toBe(false)
  expect(() =>
    renderWhatsAppControl({
      ...menu,
      choices: Array.from({ length: 6 }, () => menu.choices[0]),
    } as WhatsAppControlMenu),
  ).toThrow()
})

test("selected GENERAL chat link uses only trusted static app origin and saved exact scope", () => {
  const proof = { grantId: "grant", grantGeneration: 1, storeId: "store" }
  const menu: WhatsAppControlMenu = {
    version: "whatsapp-control-v1",
    identityGeneration: 1,
    selectionGeneration: 2,
    quotaScope: proof,
    scopes: [proof],
    title: "Selected chat",
    detail: "New chat started. https://untrusted.test/forged",
    choices: [],
    conversationTarget: {
      conversationId: "saved-chat",
      purpose: "GENERAL",
      origin: { tenantId: "business", storeId: "store" },
    },
  }
  const options = {
    trustedAppOrigin: "https://dash.ewatrade.com",
    currentScope: { tenantId: "business", storeId: "store" },
  }
  const body = renderWhatsAppControl(menu, options)
  expect(body).toContain(
    "Open saved chat in EwaTrade: https://dash.ewatrade.com/assistant/c/saved-chat",
  )
  expect(body).not.toContain("https://untrusted.test")
  expect(body).toContain("This link does not change them")
  expect(renderWhatsAppControl(menu)).not.toContain("https://")
  expect(
    renderWhatsAppControl(menu, {
      ...options,
      currentScope: { tenantId: "other", storeId: "store" },
    }),
  ).not.toContain("https://")
  expect(
    renderWhatsAppControl(menu, {
      ...options,
      trustedAppOrigin: "https://dash.ewatrade.com/?token=private",
    }),
  ).not.toContain("https://")
  const old = { ...menu, conversationTarget: undefined }
  expect(renderWhatsAppControl(old, options)).toBe(renderWhatsAppControl(old))
  const parsed = JSON.parse(serializeWhatsAppControlMenu(menu))
  expect(parsed.conversationTarget).toEqual(menu.conversationTarget)
  for (const patch of [
    { purpose: "SETUP" },
    { url: "https://untrusted.test" },
    { approvalToken: "private" },
    { conversationId: ".." },
  ]) {
    expect(
      whatsAppControlContentSchema.safeParse({
        type: "control",
        command: { kind: "help" },
        menu: {
          ...menu,
          conversationTarget: { ...menu.conversationTarget, ...patch },
        },
      }).success,
    ).toBe(false)
  }
})
