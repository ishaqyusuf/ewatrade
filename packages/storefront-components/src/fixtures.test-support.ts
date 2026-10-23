import { createComponentInput } from "./contracts"

export const manifest = {
  sdkVersion: "1.0.0",
  runtimeVersion: 1,
  key: "local-banner",
  version: "1.0.0",
  name: "Local banner",
  section: {
    key: "local-banner",
    version: 1,
    label: "Banner",
    allowedBlocks: [],
    resources: ["business"],
    capabilities: ["conversation"],
    fields: [
      {
        key: "heading",
        label: "Heading",
        kind: "text",
        maxLength: 120,
        default: "Local fixture",
      },
    ],
  },
  assetRefs: [],
  tokens: [],
}
export const source = {
  manifest,
  source: `import {ComponentFrame,ComponentAction} from "@ewatrade/storefront-components/sdk";
import type {ComponentProps} from "@ewatrade/storefront-components/sdk";
export default function Component(props:ComponentProps){return <ComponentFrame><h2>{String(props.settings.heading)}</h2><ComponentAction action={{type:'openConversation'}}>Contact</ComponentAction></ComponentFrame>}`,
  stylesheet: ".sf-component-local-banner { padding: 16px; }",
}
export function input(overrides: Record<string, unknown> = {}) {
  return createComponentInput({
    manifest,
    settings: { heading: "Local fixture" },
    data: {
      business: { name: "Local fixture", slug: "local", description: null },
    },
    theme: {},
    availableActions: [{ type: "openConversation" }],
    approvedAssets: new Map(),
    ...overrides,
  })
}
