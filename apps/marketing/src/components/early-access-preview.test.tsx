import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { EarlyAccessPreview } from "./early-access-preview"

test("production renders the QA continuation and sandboxed email preview", () => {
  const previousNodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, "NODE_ENV", "production")

  try {
    const markup = renderToStaticMarkup(
      <EarlyAccessPreview
        preview={{
          accessUrl: "https://www.ewatrade.com/signup?access_token=ea_fixture",
          emailHtml: "<p>QA confirmation</p>",
          expiresAt: "2026-10-08T12:00:00.000Z",
        }}
      />,
    )
    expect(markup).toContain("Continue setup")
    expect(markup).toContain(
      'href="https://www.ewatrade.com/signup?access_token=ea_fixture"',
    )
    expect(markup).toContain('sandbox=""')
    expect(markup).toContain("QA confirmation")
  } finally {
    if (previousNodeEnv === undefined)
      Reflect.deleteProperty(process.env, "NODE_ENV")
    else Reflect.set(process.env, "NODE_ENV", previousNodeEnv)
  }
})
