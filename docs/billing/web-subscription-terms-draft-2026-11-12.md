# Draft Terms wording for website subscriptions — 12 November 2026

Status: owner approved 12 Nov 2026 and published as version
`2026-11-12-web-subscriptions-1` (c45752c5c), with support@ewatrade.com and a
14-day review window. The wording went into the Software billing policy, which is
published with the Terms under one version.

Publishing changes the Terms version. Every user then accepts the new Terms once:
owners do it on Plan and billing before paying (added in 79505bbc5), and mobile
users on the existing terms screen. To publish after approval, an agent updates
`packages/utils/src/legal-documents.ts` and the approval constants in
`packages/utils/src/legal-approval.ts` (version, effective date, approved hash,
approval reference) in one commit.

## Proposed changes to "Separate types of payment"

Replace the first two sentences with:

> The EwaTrade mobile app is free to download. A business owner can pay for a paid
> EwaTrade software plan (Starter, Growth or Pro) on the EwaTrade website by card
> through our payment provider, Paystack. Payments to merchants for physical goods
> or services are separate transactions governed by the merchant's sale, fulfilment
> and refund policies. Payment-provider charges may also be separate.

## New section: "Website software subscriptions"

> Paid plans bought on the EwaTrade website are monthly subscriptions in Nigerian
> naira (NGN). The checkout shows the plan, price and billing interval before you
> pay. Your card is charged when you subscribe and then once a month on the same
> date until you cancel. A paid plan covers the number of businesses your plan
> allows; you choose which of your businesses it applies to on Plan and billing.
>
> If a renewal payment fails, your paid plan ends at the end of the period you
> have already paid for, and the business goes back to the plan it had before you
> paid (for new businesses, the Free plan). Your data stays in your account.
>
> Cancel at any time from Plan and billing → Manage subscription. Cancelling stops
> future charges; you keep the paid plan until the end of the period you already
> paid for. We do not give partial refunds for unused days. If you were charged in
> error, contact EwaTrade support within 14 days and we will review it. A refunded
> payment ends the plan it paid for.
>
> If we change a plan's price, we will tell you before your next renewal at the new
> price, and you can cancel before then.

## Proposed change to "Renewals, cancellation and refunds"

Start the section with:

> For website subscriptions, see "Website software subscriptions" above.

Keep the rest of the section, which covers app-store plans.

## Questions for the owner

1. Is 14 days the right window for "charged in error" reviews, or another number?
2. Which support email should the Terms name for billing questions?
3. Should outside-Africa customers be told about the NGN 6,000 / 18,000 / 36,000
   prices in the Terms, or only on the pricing page and checkout? (The draft
   says only that prices are in NGN and shown at checkout.)
