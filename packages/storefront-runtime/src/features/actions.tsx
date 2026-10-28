"use client"

import { Button, buttonVariants } from "@ewatrade/ui"
import { CommerceLink } from "../commerce/navigation"
import { useStorefrontCommerce } from "../commerce/provider"

/** One behavior owner; the template chooses where these controls sit. */
export function StorefrontFeatureActions() {
  const { accounts, customer, ordering, bag, setBagOpen, href, preview } =
    useStorefrontCommerce()
  return (
    <div className="sf-feature-actions">
      {accounts || customer?.signedIn ? (
        <CommerceLink
          className={buttonVariants({ variant: "outline", size: "sm" })}
          href={href("/account")}
          onClick={(event) => {
            if (preview) event.preventDefault()
          }}
        >
          {customer?.signedIn ? "Your account" : "Login"}
        </CommerceLink>
      ) : null}
      {ordering ? (
        <Button variant="outline" size="sm" onClick={() => setBagOpen(true)}>
          Bag ({bag.lines.length})
        </Button>
      ) : null}
    </div>
  )
}
