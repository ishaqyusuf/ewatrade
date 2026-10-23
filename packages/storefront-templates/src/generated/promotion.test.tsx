import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { createComponentInput } from "@ewatrade/storefront-components/contracts"
import { ComponentHost } from "@ewatrade/storefront-components/host"
import { storefrontDesignResources } from "@ewatrade/storefront-runtime/design-assets"
import { renderToStaticMarkup } from "react-dom/server"
import {
  createStorefrontDesignBrief,
  validateStorefrontDesignOutput,
} from "../../../storefront-contracts/src/design"
import { fixture } from "../fixtures"
import {
  defaultComposition,
  getTemplateManifest,
  templateRegistry,
} from "../registry"
import { componentEditorialManifest } from "./manifest"
import Component from "./public-intro/component"
import { publicIntroManifest, reviewedComponentRegistry } from "./registry"

test("only the exact reviewed source/manifest/CSS enters the static registry and composition proposals", () => {
  const review = reviewedComponentRegistry[0].review
  for (const [name, digest] of [
    ["component.tsx", review.sourceHash],
    ["styles.css", review.stylesheetHash],
    ["manifest.json", review.manifestHash],
  ]) {
    const bytes = readFileSync(new URL(`public-intro/${name}`, import.meta.url))
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest)
  }
  const sdkFiles = ["sdk.tsx", "context.tsx", "host.tsx"].map((name) => ({
    path: name,
    sha256: createHash("sha256")
      .update(
        readFileSync(
          new URL(
            `../../../storefront-components/src/${name}`,
            import.meta.url,
          ),
        ),
      )
      .digest("hex"),
  }))
  expect(
    createHash("sha256").update(JSON.stringify(sdkFiles)).digest("hex"),
  ).toBe(review.sdkSourceHash)
  expect(review).toMatchObject({
    review: "accepted-exact-source",
    componentVersion: "1.0.0",
    localQualified: true,
    deployed: false,
    modelCallClaimed: false,
  })
  expect(
    getTemplateManifest(defaultComposition(componentEditorialManifest)),
  ).toEqual(componentEditorialManifest)
  const data = fixture("populated")
  data.resources.assets = storefrontDesignResources()
  const manifests = templateRegistry
    .filter((entry) => entry.manifest.version !== "2.0.0")
    .map((entry) => entry.manifest)
  const manifestFor = (key: string) => {
    const manifest = manifests.find((entry) => entry.key === key)
    if (!manifest) throw new Error("Missing test manifest")
    return manifest
  }
  const base = defaultComposition(manifestFor("catalog-v4"))
  const brief = createStorefrontDesignBrief({
    ...data,
    composition: base,
    baseRevision: 1,
    desiredJourney: "browse",
  })
  const keys = ["component-editorial", "retail-editorial", "service-desk"]
  const output = validateStorefrontDesignOutput(
    {
      baseRevision: 1,
      directions: keys.map((key, index) => ({
        id: ["01", "02", "03"][index],
        rationale: ["brand-led"],
        missingAssets: [],
        sourceReferences: [],
        composition: defaultComposition(manifestFor(key)),
      })),
    },
    brief,
    manifests,
  )
  expect(output.directions[0]?.composition.template).toEqual({
    key: "component-editorial",
    version: "1.0.0",
  })
})

test("reviewed static component renders current public facts and only host-approved Contact", () => {
  for (const name of ["populated", "unavailable"] as const) {
    const data = fixture(name)
    const input = createComponentInput({
      manifest: publicIntroManifest,
      settings: { heading: "", description: "" },
      data: { business: data.resources.business },
      theme: {},
      availableActions: data.capabilities.conversation.available
        ? [{ type: "openConversation" }]
        : [],
      approvedAssets: new Map(),
    })
    const html = renderToStaticMarkup(
      <ComponentHost input={input} onAction={() => {}}>
        <Component {...input} />
      </ComponentHost>,
    )
    expect(html).toContain("<h1>Fixture Store</h1>")
    expect(html.includes(">Contact</button>")).toBe(name === "populated")
  }
})
