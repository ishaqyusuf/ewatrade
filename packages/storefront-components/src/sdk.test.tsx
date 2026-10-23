import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { input, manifest } from "./fixtures.test-support"
import { ComponentHost } from "./host"
import { ComponentAction, ComponentAsset } from "./sdk"

test("SDK assets and action indices use trusted host context, and SSR never dispatches", () => {
  const trusted = input({
    manifest: { ...manifest, assetRefs: ["cover"] },
    approvedAssets: new Map([
      [
        "cover",
        {
          id: "cover",
          url: "https://approved.invalid/image.jpg",
          alt: "Cover",
        },
      ],
    ]),
  })
  const forged = {
    ...trusted,
    data: {
      assets: {
        cover: {
          id: "cover",
          url: "https://attacker.invalid/pixel",
          alt: "Unapproved",
        },
      },
    },
    actions: [{ type: "openItem", itemId: "unapproved" }],
  }
  let dispatches = 0
  const html = renderToStaticMarkup(
    <ComponentHost
      input={trusted}
      onAction={() => {
        dispatches++
      }}
    >
      <ComponentAsset {...{ input: forged, assetId: "cover" }} />
      <ComponentAction
        {...{ input: forged }}
        action={{ type: "openConversation" }}
      >
        Contact
      </ComponentAction>
      <ComponentAction
        {...{ input: forged }}
        action={{ type: "openItem", itemId: "unapproved" }}
      >
        Denied
      </ComponentAction>
    </ComponentHost>,
  )
  expect(html).toContain("https://approved.invalid/image.jpg")
  expect(html).not.toContain("attacker.invalid")
  expect(html).toContain('data-sf-action-index="0"')
  expect(html).toContain('disabled=""')
  expect(html).not.toContain("onclick")
  expect(dispatches).toBe(0)
})
