"use client"

import { createComponentInput } from "@ewatrade/storefront-components/contracts"
import { ComponentHost } from "@ewatrade/storefront-components/host"
import { versionAvailable } from "@ewatrade/storefront-contracts/availability"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import { useNavigation } from "../../shared/commerce"
import { publicIntroManifest, publicIntroRegistration } from "../registry"
import Component from "./component"

/** Trusted public projection and existing typed navigation; generated code owns no authority. */
export function ReviewedIntroduction({
  snapshot,
  settings,
}: {
  snapshot: StorefrontClientSnapshot
  settings: Record<string, string | boolean | null>
}) {
  const navigation = useNavigation()
  if (!versionAvailable(publicIntroRegistration, "render"))
    throw new Error("This component version is unavailable.")
  const input = createComponentInput({
    manifest: publicIntroManifest,
    settings,
    data: { business: snapshot.resources.business },
    theme: snapshot.composition.theme,
    availableActions: snapshot.capabilities.conversation.available
      ? [{ type: "openConversation" }]
      : [],
    approvedAssets: new Map(),
  })
  return (
    <>
      <ComponentHost
        input={input}
        onAction={async (action) => {
          await navigation.run(action)
        }}
      >
        <Component {...input} />
      </ComponentHost>
      {navigation.notice ? <output>{navigation.notice}</output> : null}
    </>
  )
}
