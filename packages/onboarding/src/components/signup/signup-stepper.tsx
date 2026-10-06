export function SignupStepper({
  currentStep,
  acceptanceRequired = true,
}: { currentStep: number; acceptanceRequired?: boolean }) {
  const STEPS = [
    "Address",
    "Business",
    "Account",
    ...(acceptanceRequired ? ["Terms & Privacy"] : []),
  ]
  return (
    <nav className="signup-progress" aria-label="Setup progress">
      <ol>
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={
              index > 0 && currentStep === index + 1 ? "step" : undefined
            }
            className={
              index > 0 && currentStep > index + 1 ? "complete" : undefined
            }
          >
            {index === 0 ? (
              <button
                type="button"
                disabled
                className="signup-step-pending"
                aria-label="Address setup pending, coming later"
              >
                <span className="signup-pending-icon" aria-hidden="true">
                  ◷
                </span>
                <span>
                  Address<small>Coming later</small>
                </span>
              </button>
            ) : (
              <>
                <span aria-hidden="true">
                  {currentStep > index + 1 ? "✓" : index}
                </span>{" "}
                {label}
              </>
            )}
          </li>
        ))}
      </ol>
      <p className="signup-progress-note">
        Storefront and POS setup are coming later.
      </p>
    </nav>
  )
}
