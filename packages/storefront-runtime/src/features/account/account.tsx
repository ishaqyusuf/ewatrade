"use client"

import type { AccountView } from "@ewatrade/storefront-contracts/customer"
import { StorefrontFeatureFrame } from "../frame"
import { StorefrontRequestHistory } from "./request-history"
import { StorefrontSignIn } from "./sign-in-form"
export type { AccountView } from "@ewatrade/storefront-contracts/customer"
export function StorefrontAccount({ account }: { account: AccountView }) {
  return (
    <StorefrontFeatureFrame>
      <section className="sf-feature-section">
        <div className="sf-feature-wrap sf-feature-narrow">
          {account.signedIn ? (
            <StorefrontRequestHistory account={account} />
          ) : (
            <StorefrontSignIn account={account} />
          )}
        </div>
      </section>
    </StorefrontFeatureFrame>
  )
}
