import { expect, test } from "bun:test"
import {
  createLifecycleEmailMessage,
  lifecycleEmailSender,
  lifecycleTagValue,
  lifecycleUnsubscribeHeaders,
  renderLifecycleEmail,
} from "./index"
import { lifecycleLayoutFixture } from "./preview-fixtures"

test("lifecycle layout renders the founder signature, one button and opt-out links in HTML and text", () => {
  const { html, text } = renderLifecycleEmail(lifecycleLayoutFixture)
  expect(html).toContain('data-email-kind="lifecycle"')
  expect(html).toContain("Hi Ada,")
  expect(html).toContain("Founder, EwaTrade")
  expect(html.match(/href="https:\/\/api\.ewatrade\.test\/go\//g)).toHaveLength(
    1,
  )
  expect(html).toContain(
    lifecycleLayoutFixture.unsubscribeUrl.replace("&", "&amp;"),
  )
  expect(text.split("\n")[2]).toBe(lifecycleLayoutFixture.lead)
  expect(text).toContain(
    `Unsubscribe: ${lifecycleLayoutFixture.unsubscribeUrl}`,
  )
  expect(text).toContain(
    `Open your site setup: ${lifecycleLayoutFixture.cta.href}`,
  )
})

test("RFC 8058 headers need HTTPS", () => {
  expect(
    lifecycleUnsubscribeHeaders(
      "https://api.ewatrade.com/lifecycle/unsubscribe?token=a.b",
    ),
  ).toEqual({
    "List-Unsubscribe":
      "<https://api.ewatrade.com/lifecycle/unsubscribe?token=a.b>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  })
  expect(() =>
    lifecycleUnsubscribeHeaders("http://api.ewatrade.com/x"),
  ).toThrow()
})

test("sender never falls back to the login-code sender", () => {
  expect(lifecycleEmailSender({})).toBeNull()
  expect(
    lifecycleEmailSender({ LIFECYCLE_EMAIL_FROM: "not an address" }),
  ).toBeNull()
  expect(
    lifecycleEmailSender({
      LIFECYCLE_EMAIL_FROM: "Ishaq from EwaTrade <ishaq@mail.ewatrade.com>",
    }),
  ).toBe("Ishaq from EwaTrade <ishaq@mail.ewatrade.com>")
})

test("message carries headers, idempotency key and Resend-safe tags", () => {
  const message = createLifecycleEmailMessage({
    from: "Ishaq from EwaTrade <ishaq@mail.ewatrade.com>",
    to: "owner@example.com",
    subject: "Your site is one step away",
    content: lifecycleLayoutFixture,
    oneClickUnsubscribeUrl:
      "https://api.ewatrade.com/lifecycle/unsubscribe?token=t",
    messageId: "msg_1",
    playId: "P08_limit:products",
  })
  expect(message.headers["List-Unsubscribe-Post"]).toBe(
    "List-Unsubscribe=One-Click",
  )
  expect(message.idempotencyKey).toBe("lifecycle/msg_1")
  expect(message.tags).toContainEqual({
    name: "play",
    value: "P08_limit_products",
  })
  expect(lifecycleTagValue("a b/c")).toBe("a_b_c")
})
