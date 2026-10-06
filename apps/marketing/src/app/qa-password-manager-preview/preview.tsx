"use client"

import { StepOwner } from "@/components/signup/step-owner"

export function PasswordManagerPreview() {
  return (
    <main className="signup-page">
      <div style={{ maxWidth: 560, padding: 32, margin: "auto" }}>
        <p>Local preview · No account is created.</p>
        <StepOwner onNext={() => {}} onBack={() => {}} />
      </div>
    </main>
  )
}
