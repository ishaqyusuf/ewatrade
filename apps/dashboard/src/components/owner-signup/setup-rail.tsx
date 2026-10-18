"use client"

import { OwnerBusinessAvatar } from "@ewatrade/onboarding/components/signup/signup-flow"
import type { OwnerSetupDraft } from "@ewatrade/utils/owner-signup"
import { OWNER_PLAN_LIMITS, businessLabel, typeLabel } from "./model"

export function OwnerSetupRail({ draft }: { draft: OwnerSetupDraft }) {
  const first = draft.businesses[0]
  const selected = draft.selectedTypeKeys ?? []
  const count = draft.businesses.length
  const limit = OWNER_PLAN_LIMITS[draft.planId]
  const plan =
    draft.planId === "starter"
      ? "Starter"
      : draft.planId === "growth"
        ? "Growth"
        : "Pro"
  return (
    <>
      <p className="owner-ref-gp-label">Your setup</p>
      {draft.step === "type" ? (
        <>
          <div className="owner-ref-rl-sec">Store link</div>
          <div className="owner-ref-gbiz">
            <OwnerBusinessAvatar
              typeKey={selected[0]}
              name={first?.name}
              size={34}
            />
            <div>
              <b>{first?.name || "Your business"}</b>
              <small>{first?.slug}.ewatrade.com</small>
            </div>
          </div>
          <div className="owner-ref-rl-sec">Picked · {selected.length}</div>
          {selected.length ? (
            <div className="owner-ref-rl-list">
              {selected.map((key) => (
                <div className="owner-ref-rl-item" key={key}>
                  <OwnerBusinessAvatar typeKey={key} size={28} />
                  <span>{typeLabel(key, draft.otherType)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="owner-ref-rl-empty">
              Pick one or more types. If they’re separate businesses, you’ll
              sort them next.
            </div>
          )}
        </>
      ) : (
        <>
          <div className="owner-ref-rl-sec">Businesses · {count}</div>
          <div className="owner-ref-gp-stack">
            {draft.businesses.map((business, index) => (
              <div className="owner-ref-gbiz" key={business.id}>
                <OwnerBusinessAvatar
                  typeKey={business.typeKeys[0]}
                  name={business.name}
                  size={40}
                />
                <div>
                  <b>{businessLabel(business, index)}</b>
                  <small>
                    {business.slug
                      ? `${business.slug}.ewatrade.com`
                      : "Store link appears as you type"}
                  </small>
                  <div className="owner-ref-gtypes">
                    {business.typeKeys.slice(0, 3).map((key) => (
                      <span key={key}>{typeLabel(key, draft.otherType)}</span>
                    ))}
                    {business.typeKeys.length > 3 && (
                      <span>+{business.typeKeys.length - 3}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {count > 1 && (
            <div className="owner-ref-meter">
              <div className="owner-ref-mrow">
                <b>{count} businesses</b>
                <small>
                  {plan}
                  {draft.planId !== "starter" ? " · free during launch" : ""}
                </small>
              </div>
              <span className="owner-ref-bar">
                <i
                  className={count > limit ? "owner-ref-over" : undefined}
                  style={{ width: `${Math.min(100, (count / limit) * 100)}%` }}
                />
              </span>
              <small>
                {count > limit
                  ? `${plan} includes ${limit}. ${count - limit} wait on Home.`
                  : `${plan} runs up to ${limit}.`}
              </small>
            </div>
          )}
        </>
      )}
      <p className="owner-ref-gp-cap owner-rail-caption">
        Each business gets its own free store link.
      </p>
    </>
  )
}
