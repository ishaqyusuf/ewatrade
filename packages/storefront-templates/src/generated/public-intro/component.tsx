import {
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
