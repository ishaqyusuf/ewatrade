export type StaffOnboardingPresentationProps = {
  businessName: string
  canSubmit: boolean
  displayName: string
  email: string
  isSubmitting: boolean
  name: string
  onChangeDisplayName: (value: string) => void
  onChangeName: (value: string) => void
  onSubmit: () => void
  roleLabel: string
  submitError?: string | null
}
