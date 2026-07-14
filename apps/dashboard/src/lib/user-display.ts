type InitialsUser = {
  displayName: string | null
  email: string
  firstName: string | null
  lastName: string | null
}

export function getUserInitials(user: InitialsUser): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
  }

  if (user.displayName) {
    const parts = user.displayName.trim().split(" ")
    const first = parts[0] ?? ""
    const last = parts.length >= 2 ? (parts[parts.length - 1] ?? "") : ""

    if (parts.length >= 2 && first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }

    return first.slice(0, 2).toUpperCase()
  }

  return user.email.slice(0, 2).toUpperCase()
}
