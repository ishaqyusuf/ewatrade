"use client"
import { Button, Checkbox, Input } from "@ewatrade/ui"
import { normalizeStoreLink } from "@ewatrade/utils/store-link"
import { useSignupChat } from "./use-signup-chat"
import "../../styles/signup-chat.css"

export function SignupChat({ marketingUrl }: { marketingUrl: string }) {
  const {
    details,
    setDetails,
    review,
    settings,
    stage,
    consent,
    setConsent,
    code,
    setCode,
    pending,
    error,
    retryAt,
    now,
    slugEdited,
    title,
    enabled,
    edit,
    reviewDetails,
    sendCode,
    verifyAndCreate,
    openDashboard,
  } = useSignupChat(marketingUrl)
  return (
    <main className="signup-chat">
      <section className="signup-chat-card" aria-busy={pending}>
        <h2 ref={title} tabIndex={-1}>
          {stage === "details"
            ? "Start your business"
            : stage === "review"
              ? "Review your registration"
              : stage === "code"
                ? "Verify & create your business"
                : stage === "success"
                  ? "Your business is ready"
                  : "Check your signup status"}
        </h2>
        {stage === "details" && (
          <>
            <p>
              Register here in the chat. These details and your code stay out of
              the AI conversation.
            </p>
            {!settings ? (
              <output>Loading secure signup…</output>
            ) : !enabled ? (
              <p>
                Public signup is currently unavailable.{" "}
                <a
                  href={`${marketingUrl}/contact`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Talk to our team
                </a>
                .
              </p>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void reviewDetails()
                }}
              >
                <label htmlFor="signup-chat-business">
                  Business name
                  <Input
                    id="signup-chat-business"
                    required
                    autoComplete="organization"
                    maxLength={120}
                    value={details.businessName}
                    onChange={(event) => {
                      const businessName = event.target.value
                      setDetails((previous) => ({
                        ...previous,
                        businessName,
                        ...(!slugEdited.current
                          ? { requestedSlug: normalizeStoreLink(businessName) }
                          : {}),
                      }))
                    }}
                  />
                </label>
                <label htmlFor="signup-chat-name">
                  Your name
                  <Input
                    id="signup-chat-name"
                    required
                    autoComplete="name"
                    maxLength={120}
                    value={details.name}
                    onChange={(event) =>
                      setDetails((previous) => ({
                        ...previous,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label htmlFor="signup-chat-email">
                  Email
                  <Input
                    id="signup-chat-email"
                    required
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={details.email}
                    onChange={(event) =>
                      setDetails((previous) => ({
                        ...previous,
                        email: event.target.value,
                      }))
                    }
                  />
                </label>
                <label htmlFor="signup-chat-slug">
                  Store link
                  <Input
                    id="signup-chat-slug"
                    required
                    minLength={2}
                    maxLength={40}
                    autoComplete="off"
                    value={details.requestedSlug}
                    onChange={(event) => {
                      slugEdited.current = true
                      setDetails((previous) => ({
                        ...previous,
                        requestedSlug: event.target.value.toLowerCase(),
                      }))
                    }}
                  />
                </label>
                <label>
                  Your age
                  <select
                    required
                    value={details.ageBand}
                    onChange={(event) =>
                      setDetails((previous) => ({
                        ...previous,
                        ageBand: event.target.value,
                      }))
                    }
                  >
                    <option value="">Choose age range</option>
                    <option value="UNDER_13">Under 13</option>
                    <option value="AGE_13_TO_15">13–15</option>
                    <option value="AGE_16_TO_17">16–17</option>
                    <option value="ADULT">18+</option>
                  </select>
                </label>
                <Button
                  className="signup-chat-primary"
                  type="submit"
                  disabled={pending}
                >
                  {pending ? "Checking…" : "Review registration"}
                </Button>
              </form>
            )}
          </>
        )}
        {(stage === "review" || stage === "code") && review && (
          <>
            <dl>
              {[
                ["Business", review.businessName],
                ["Owner", review.name],
                ["Email", review.email],
                ["Store link", review.requestedSlug],
                [
                  "Age",
                  review.ageBand === "ADULT"
                    ? "18+"
                    : review.ageBand === "AGE_13_TO_15"
                      ? "13–15"
                      : "16–17",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {stage === "review" ? (
              <>
                <label
                  className="signup-chat-consent"
                  htmlFor="signup-chat-consent"
                >
                  <Checkbox
                    id="signup-chat-consent"
                    checked={consent}
                    onCheckedChange={(value) => setConsent(value === true)}
                    disabled={pending}
                  />
                  <span>
                    I agree to the{" "}
                    <a
                      href={`${marketingUrl}/terms`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Terms
                    </a>{" "}
                    and acknowledge the{" "}
                    <a
                      href={`${marketingUrl}/privacy`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Privacy Notice
                    </a>
                    .
                  </span>
                </label>
                <p>
                  No account or business is created until you verify the code
                  and confirm the next step.
                </p>
                <Button
                  className="signup-chat-primary"
                  type="button"
                  disabled={pending || !consent || !enabled}
                  onClick={() => void sendCode()}
                >
                  {pending ? "Sending code…" : "Send verification code"}
                </Button>
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void verifyAndCreate()
                }}
              >
                <p>
                  We sent a code to your email. Confirming below verifies your
                  contact and creates the reviewed account and business
                  together.
                </p>
                <label htmlFor="signup-chat-code">
                  Verification code
                  <Input
                    id="signup-chat-code"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </label>
                <Button
                  className="signup-chat-primary"
                  type="submit"
                  disabled={pending || !/^\d{6}$/.test(code)}
                >
                  {pending
                    ? "Verifying & creating…"
                    : "Verify & create business"}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  disabled={pending || now < retryAt}
                  onClick={() => void sendCode()}
                >
                  {now < retryAt
                    ? `Resend in ${Math.max(0, Math.ceil((retryAt - now) / 1000))}s`
                    : "Resend code"}
                </Button>
              </form>
            )}
            <Button
              variant="ghost"
              type="button"
              disabled={pending}
              onClick={edit}
            >
              Edit details
            </Button>
          </>
        )}
        {stage === "success" && (
          <>
            <p>
              Your email is verified and your first business has been created.
              Continue setup to add its type, products and Store details.
            </p>
            <a
              className="signup-chat-primary"
              href="/setup"
              onClick={openDashboard}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open your business →
            </a>
          </>
        )}
        {stage === "unknown" && (
          <>
            <p>
              We couldn’t confirm the final result. Your account may have been
              created. Open your dashboard or sign in before trying registration
              again.
            </p>
            <a
              className="signup-chat-primary"
              href="/setup"
              onClick={openDashboard}
              target="_blank"
              rel="noopener noreferrer"
            >
              Check your dashboard
            </a>
            <a href="/login" target="_blank" rel="noopener noreferrer">
              Sign in
            </a>
          </>
        )}
        {error && (
          <p className="signup-chat-error" role="alert">
            {error}
          </p>
        )}
        <p className="signup-chat-note">
          Secure EwaTrade registration · No password in chat
        </p>
      </section>
    </main>
  )
}
