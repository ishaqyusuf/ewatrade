/** Customer session facts the host may pass to the template. Never staff identity. */
export type StorefrontCustomerView = {
  signedIn: boolean
  label?: string
  channel?: "email" | "whatsapp"
} | null

export type AccountView =
  | {
      signedIn: false
      channels: readonly ("email" | "whatsapp")[]
      next: string | null
      testAdapter: boolean
      /** Guest-recovery reference to keep through WhatsApp verification. */
      find?: string | null
    }
  | {
      signedIn: true
      label: string
      channel: "email" | "whatsapp"
      history: {
        key: string
        reference: string
        kind: "order" | "service"
        stage: string
        createdAt: string
        summary: string
        href: string
      }[]
      linkable: {
        reference: string
        kind: "order" | "service"
        createdAt: string
      }[]
      /**
       * Server-resolved guest recovery: `href` only when the reference names a request
       * sent from this session's verified WhatsApp number in this Store.
       */
      lookup?: { reference: string; href: string | null } | null
    }
