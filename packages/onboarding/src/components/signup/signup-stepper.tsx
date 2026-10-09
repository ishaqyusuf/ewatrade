export function SignupStepper({
  currentStep,
  acceptanceRequired = true,
  entryStage,
}: {
  currentStep: number
  acceptanceRequired?: boolean
  entryStage?: "start" | "verify"
}) {
  const steps = [
    "Start",
    "Verify",
    "Business",
    "Account",
    ...(acceptanceRequired ? ["Terms & Privacy"] : []),
  ]
  const active =
    entryStage === "start" ? 0 : entryStage === "verify" ? 1 : currentStep
  return (
    <nav className="signup-progress" aria-label="Setup progress">
      <ol>
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={active === index ? "step" : undefined}
            className={active > index ? "complete" : undefined}
          >
            <span aria-hidden="true">{active > index ? "✓" : index + 1}</span>
            <b>{label}</b>
          </li>
        ))}
      </ol>
      <progress
        className="signup-mobile-progress"
        value={active + 1}
        max={steps.length}
        aria-label={`Step ${active + 1} of ${steps.length}: ${steps[active]}`}
      />
    </nav>
  )
}
