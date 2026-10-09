import type { CustomerChannelRecommendation } from "./types"

const STEP_LABELS = {
  assign_attendants: "Assign the people who will answer customers",
  configure_store_routing: "Confirm which Store receives each conversation",
  connect_whatsapp: "Connect and test a WhatsApp number",
  publish_entry_point: "Publish the Store link and QR code",
  review_vertical_policy: "Complete the separate category policy review",
} as const

export function getChannelRecommendationView(
  recommendation: CustomerChannelRecommendation,
) {
  return {
    attendantLabel:
      recommendation.attendantMode === "team_attendants"
        ? "Team attendants"
        : "Owner attendant",
    channelLabel: recommendation.recommendedChannels
      .map((channel) => (channel === "web" ? "Web" : "WhatsApp"))
      .join(" + "),
    routingLabel:
      recommendation.connectionMode === "central_with_branch_choice"
        ? "Central connection with branch choice"
        : "Store-specific connection",
    steps: recommendation.setupSteps.map((step) => STEP_LABELS[step]),
  }
}

export function ChannelRecommendationCard({
  recommendation,
}: {
  recommendation: CustomerChannelRecommendation
}) {
  const view = getChannelRecommendationView(recommendation)

  return (
    <section
      aria-labelledby="channel-recommendation-title"
      className="grid gap-5 rounded-xl border border-primary/25 bg-primary/5 p-5"
    >
      <div className="grid gap-2">
        <p className="w-fit rounded-full border border-primary/25 bg-background px-2.5 py-1 text-xs font-medium text-primary">
          Recommended from onboarding
        </p>
        <div>
          <h2 className="font-semibold" id="channel-recommendation-title">
            A practical starting setup
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            This suggestion uses the Store&apos;s business category, selected
            order channels, team size and branch count. You can configure a
            different setup.
          </p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <RecommendationFact label="Channels" value={view.channelLabel} />
        <RecommendationFact
          label="Customer routing"
          value={view.routingLabel}
        />
        <RecommendationFact
          label="Suggested coverage"
          value={view.attendantLabel}
        />
      </dl>

      <div>
        <h3 className="text-sm font-medium">Suggested order</h3>
        <ol className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          {view.steps.map((step, index) => (
            <li className="flex gap-2" key={step}>
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {recommendation.policyReviewRequired ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
          Pharmacy policy review is separate and must pass before regulated
          customer actions become available.
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Advisory only. This does not enable a channel, assign a role, satisfy
        policy, or publish the customer entry point.
      </p>
    </section>
  )
}

function RecommendationFact({
  label,
  value,
}: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}
