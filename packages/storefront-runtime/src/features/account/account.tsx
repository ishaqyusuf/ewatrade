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

/**
 * The same code login, inside another page (checkout). No page heading and no guest
 * recovery; `onSignedIn` runs after a verified code instead of leaving the page.
 */
export function StorefrontQuickLogin({
  channels,
  onSignedIn,
}: {
  channels: readonly ("email" | "whatsapp")[]
  onSignedIn(): void
}) {
  return (
    <StorefrontSignIn
      account={{ signedIn: false, channels, next: null, testAdapter: false }}
      embedded
      onSignedIn={onSignedIn}
    />
  )
}
