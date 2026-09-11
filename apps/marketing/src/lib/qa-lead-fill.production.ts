export function createLeadDraft(_input: {
  domain: string
  testerIdentity: string
}) {
  return {
    companyName: "",
    email: "",
    fullName: "",
    message: "",
    phone: "",
    roleTitle: "",
  }
}
