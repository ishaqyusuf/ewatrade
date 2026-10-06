import EarlyAccessVerificationEmail from "../templates/early-access-verification"

export default function Preview() {
  return (
    <EarlyAccessVerificationEmail
      input={{
        email: "amina@example.com",
        expiresAt: "3 October 2026, 10:30 UTC",
        fullName: "Amina Bello",
        verificationUrl:
          "https://dashboard.ewatrade.com/api/early-access/verify?token=preview-only",
      }}
    />
  )
}
