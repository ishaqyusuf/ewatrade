import { MobileOwnerOtpEmail } from "../templates/mobile-owner-otp"

export default function Preview() {
  return (
    <MobileOwnerOtpEmail
      input={{
        code: "716204",
        expiresAtLabel: "4:20 PM WAT",
        mode: "sign_up",
      }}
    />
  )
}
