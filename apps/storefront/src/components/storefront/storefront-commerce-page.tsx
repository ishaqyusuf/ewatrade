"use client"

import {
  CommerceStudioBody,
  CommerceStudioPageProvider,
  type CommerceStudioProps,
} from "@ewatrade/storefront-templates/commerce-studio"

export function CommerceStudioPage(props: CommerceStudioProps) {
  return (
    <CommerceStudioPageProvider
      snapshot={props.snapshot}
      customer={props.customer}
    >
      <CommerceStudioBody {...props} />
    </CommerceStudioPageProvider>
  )
}
