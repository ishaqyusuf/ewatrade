import type { ComponentGenerator } from "./generation"

/** Synthetic generator fixture, not a model result or a registry registration. */
export const offlineSampleBrief = {
  componentKey: "public-intro",
  intent:
    "A restrained public business introduction. Empty editable heading and description fall back to the public business profile. Contact appears only when a trusted conversation action is available.",
}
export const offlineSampleSource = {
  manifest: {
    sdkVersion: "1.0.0",
    runtimeVersion: 1,
    key: "public-intro",
    version: "1.0.0",
    name: "Public introduction",
    section: {
      key: "public-intro",
      version: 1,
      label: "Business introduction",
      allowedBlocks: [],
      resources: ["business"],
      capabilities: ["conversation"],
      fields: [
        {
          key: "heading",
          label: "Heading",
          kind: "text",
          maxLength: 120,
          default: "",
        },
        {
          key: "description",
          label: "Description",
          kind: "text",
          maxLength: 500,
          default: "",
        },
      ],
    },
    assetRefs: [],
    tokens: [
      "--sf-component-accent",
      "--sf-component-background",
      "--sf-component-font",
      "--sf-component-space-4",
    ],
  },
  source: `import {
  ComponentFrame,
  ComponentAction,
} from "@ewatrade/storefront-components/sdk"
import type { ComponentProps } from "@ewatrade/storefront-components/sdk"
export default function Component(props: ComponentProps) {
  return (
    <ComponentFrame>
      <h1>{props.settings.heading || props.data.business?.name || ""}</h1>
      <p>
        {props.settings.description || props.data.business?.description || ""}
      </p>
      {props.actions.find((action) => action.type === "openConversation") ? (
        <ComponentAction action={{ type: "openConversation" }}>
          Contact
        </ComponentAction>
      ) : null}
    </ComponentFrame>
  )
}
`,
  stylesheet:
    ".sf-component-public-intro { padding: var(--sf-component-space-4); background: var(--sf-component-background); color: var(--sf-component-accent); font-family: var(--sf-component-font); max-width: 800px; overflow-wrap: anywhere; } .sf-component-public-intro h1 { font-size: clamp(24px,5vw,48px); line-height: 1.1; margin: 0; } .sf-component-public-intro p { font-size: 18px; line-height: 1.6; max-width: 60ch; }",
}
export const offlineSampleGenerator: ComponentGenerator = {
  kind: "offline-fixture",
  async generate() {
    return {
      output: JSON.stringify(offlineSampleSource),
      generation: null,
      fixtureLabel: "public-intro-offline-sample-v1",
    }
  },
}
