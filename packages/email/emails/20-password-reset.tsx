import { PasswordResetEmail } from "../templates/password-reset"

export default function PasswordResetPreview() {
  return (
    <PasswordResetEmail resetUrl="https://dash.ewatrade.com/reset-password#token=preview-only" />
  )
}
