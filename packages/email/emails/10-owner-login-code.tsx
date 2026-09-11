import { MobileOwnerOtpEmail } from "../templates/mobile-owner-otp"

export default function Preview() {
  return (
    <MobileOwnerOtpEmail
      input={{ code: "482913", expiresAtLabel: "4:20 PM WAT", mode: "login" }}
    />
  )
}
