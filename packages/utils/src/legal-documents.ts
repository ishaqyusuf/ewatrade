/** Source versions stay immutable once approved and used for acceptance. */
export const LEGAL_DOCUMENT_VERSION = "2026-09-29-candidate-4"
export const LEGAL_DOCUMENT_STATUS: "draft" | "approved" = "draft"

export type LegalDocumentKey =
  | "terms"
  | "privacy"
  | "support"
  | "delete-account"
  | "billing-policy"
export type LegalSection = {
  title: string
  text: string
  contactEmail?: string
}
export type LegalDocument = {
  title: string
  description: string
  sections: LegalSection[]
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocument> = {
  terms: {
    title: "Terms of Service",
    description: "EwaTrade platform terms for merchants, staff and customers.",
    sections: [
      {
        title: "The platform and your business",
        text: "EwaTrade is operated by ZEROES AND ONE TECH HUB NIG LIMITED (RC 9264386), incorporated on 31 January 2026. Its CAC status report dated 1 February 2026 lists the registered address as 10 Old Jebba Road, Ilorin, Kwara State, Nigeria. EwaTrade provides software for catalog, inventory, orders, customer communications and service operations. A merchant is responsible for its business identity, authority to trade, catalog accuracy, prices, stock, fulfilment and staff permissions. EwaTrade platform terms are separate from each seller’s customer sale or service agreement.",
      },
      {
        title: "Accounts and access",
        text: "You must be at least 13 to create an EwaTrade account. Use accurate account information and only act for a business you are authorized to represent. A Store may be created by an eligible account holder aged 13 or older, but creating a Store does not itself establish a registered business or eligibility for payment services. You are responsible for the rules that apply to your business, contracts, staff, products and payments; a payment provider may require an adult account holder. Protect your sign-in credentials and report unauthorized access. Staff access is limited by the business's assigned permissions. Leaving a business, deleting a personal account and closing a business workspace are different actions.",
      },
      {
        title: "Customers and sellers",
        text: "Before accepting an order or booking, the seller must explain its identity and contact details, delivery or pickup costs and timing, cancellation, returns, refunds and any appointment or no-show terms. Raise fulfilment and product complaints with that seller; raise platform access and privacy issues with EwaTrade.",
      },
      {
        title: "Acceptable use",
        text: "Do not use EwaTrade for unlawful or prohibited goods, fraud, spam, unauthorized access, threats, harassment, bullying, hateful content, sexual exploitation, content that endangers children, or material that infringes another person's rights. Do not submit explicit sexual content or another person's private information without lawful authority. Report abusive messages or content through the available conversation controls or support channel.",
      },
      {
        title: "Material you submit",
        text: "You retain the rights you have in catalog images, descriptions, Store messages, attachments and other material you submit. Submit only material you own or are authorized to use and license in every country where you make it available through EwaTrade. A Store operator is responsible for material submitted by its authorized staff and must respect supplier, stock-image, brand and other third-party restrictions. You grant ZEROES AND ONE TECH HUB NIG LIMITED a non-exclusive permission to host, copy, format, transmit, display and process that material only to operate the features you use, deliver it to authorized participants, provide support, enforce safety rules and meet applicable obligations. This permission does not make private conversations public or authorize unrelated advertising or sale of your material. You may ask for correction or removal of material you control through the published support channel. We may restrict or remove material following a rights, abuse or safety report and ask for evidence of your authority. Limited records may remain under the effective Privacy Notice and approved retention policy.",
      },
      {
        title: "Pharmacy and prescriptions",
        text: "A pharmacy remains responsible for licensing, prescription review, professional decisions and lawful supply. Software or OCR output is not clinical advice or authorization to dispense. Regulated processing requires the applicable notices, access controls and operating approvals.",
      },
      {
        title: "Eligibility, account controls and disputes",
        text: "An account may be used only by a person who can lawfully use the service and, when acting for a business, has that business's authority. A merchant is responsible for its own customer sales, professional services and staff actions. We may restrict access when reasonably needed to address suspected misuse, security incidents, legal obligations or a material breach of these Terms, and will provide an appropriate way to contact us about the decision. You may stop using your personal account or request deletion through the published account process. Closing a business workspace and ending a personal login have different effects on other users and records. Please contact EwaTrade support about a platform dispute; transaction, fulfilment and professional-service disputes should first be raised with the seller or licensed provider identified in the transaction.",
      },
    ],
  },
  privacy: {
    title: "Privacy Notice",
    description:
      "How EwaTrade account, business and customer information is handled.",
    sections: [
      {
        title: "Account and operational information",
        text: "EwaTrade processes account identifiers and contact details, authentication and session records, business membership and permissions, catalog and inventory information, orders, payment references and service records. Customer conversations can contain messages, attachments and request details. Optional device permissions depend on the features you use.",
      },
      {
        title: "Age eligibility",
        text: "EwaTrade asks for an age range when a person enters account creation or Store chat. The choices distinguish ages 13–15, 16–17 and 18 or older; we record the selected range and time, not a date of birth. People under 13 cannot create an account or start a new Store chat. If you believe someone under 13 has provided personal information to EwaTrade, contact the privacy address below so we can investigate and handle it under the applicable law.",
      },
      {
        title: "Who is responsible",
        text: "ZEROES AND ONE TECH HUB NIG LIMITED operates EwaTrade and determines how personal information is used to create and secure platform accounts, provide support and administer the software. A merchant determines the purposes of its own customer sales and service records; a licensed pharmacy determines its professional handling of prescription and clinical records. EwaTrade supplies software and acts on their instructions for those business records where the applicable agreement makes it their processor. For a request about your platform account, use the published EwaTrade privacy contact. For a request about a seller's transaction or a pharmacy's clinical decision, contact that business; EwaTrade will help route a request we receive to the responsible party where appropriate.",
      },
      {
        title: "Purposes and providers",
        text: "We use account and business information to authenticate users, run the merchant workspace, process requested transactions and communications, prevent abuse, provide support and meet applicable obligations. We share the information needed for each task with the service providers used for hosting and databases, email, payments and sign-in, private media, messaging and operational diagnostics. App-store software purchases are not offered in this mobile release; if introduced later, the applicable store and verification provider will process the purchase. A pharmacy's prescription workflow may use additional approved processing services, including OCR, only when that workflow is enabled and the pharmacy's notices and controls apply. We do not treat acceptance of this notice as consent to optional marketing or clinical processing. The provider and location details for the active service are available through the published privacy contact.",
      },
      {
        title: "Sensitive information",
        text: "Prescription and pharmacy requests may include health information. Access must follow the pharmacy’s authority and workflow. OCR or AI processing, when enabled, requires specific disclosure and human review. Do not send prescriptions, payment credentials or identity documents in a general support request.",
      },
      {
        title: "Your choices and requests",
        text: "You may request access, correction, export or deletion of your personal information. Account deletion differs from closing a merchant workspace and from deleting an individual conversation. Requests require proportionate identity verification. A privacy notice is information about processing; it is not blanket consent for optional marketing or sensitive-data uses.",
      },
      {
        title: "Retention and deletion",
        text: "We keep personal information only for the purpose and period applicable to its category. Account access and device credentials are handled separately from a merchant's transaction history or a pharmacy's regulated clinical record. When you request deletion, we verify the request, remove or de-identify information that no longer needs to be kept, and explain any categories retained for a documented legal, safety, security or dispute reason. Access to retained information is restricted. We also instruct relevant service providers where required and account for backup expiry. A request receipt confirms that we received your request; it does not mean deletion has finished. We will send an outcome through the verified contact channel when processing is complete.",
      },
    ],
  },
  support: {
    title: "Support and contact",
    description:
      "Help with EwaTrade accounts, software billing and merchant transactions.",
    sections: [
      {
        title: "Platform support",
        text: "For general account access, software billing or abuse concerns, email the EwaTrade support address below. Include a short description and any error reference. Never send passwords, one-time codes, full card details or prescription documents.",
        contactEmail: "founders@ewatrade.com",
      },
      {
        title: "Merchant support",
        text: "For an order, delivery, pickup, refund or appointment, contact the seller shown in your transaction. The seller’s policies govern those services. For platform access or abuse concerns, use EwaTrade general support. A monitored privacy and deletion request channel must be confirmed before launch.",
      },
      {
        title: "Privacy and account requests",
        text: "For an EwaTrade account, privacy or account-deletion issue, use the privacy contact shown on this page or the account-deletion request form. Include the email associated with the account and enough context to identify the request; we may ask you to verify control of that address before changing or disclosing account information. Please do not send a password, one-time code, full payment-card information or prescription document by email. For an order or clinical-service question, contact the seller or licensed pharmacy shown in that request.",
        contactEmail: "founders@ewatrade.com",
      },
    ],
  },
  "delete-account": {
    title: "Delete your EwaTrade account",
    description:
      "Account-wide deletion, identity verification and business records.",
    sections: [
      {
        title: "What account deletion means",
        text: "Request deletion of your EwaTrade login and associated personal information across the platform. This is different from leaving one business, closing a business workspace or deleting a single conversation. A submitted request is not confirmation that erasure has completed.",
      },
      {
        title: "Business owners and staff",
        text: "A business owner may need to transfer responsibility for a workspace before account access is removed. Other staff, customers and their records must remain protected. Necessary business records must be reviewed separately from personal profile, sessions and device credentials.",
      },
      {
        title: "Verification and outcome",
        text: "The request process must verify your authority, track each relevant system and processor, revoke account access and provide an outcome explaining erased data and any retained categories and reasons. People unable to sign in must have an external request route.",
      },
      {
        title: "Submit and track a request",
        text: "You can start an account-deletion request in the EwaTrade app or on this page, including when you can no longer sign in. We verify the request using the account's contact channel and may need to resolve business ownership or regulated-record obligations before finishing. We will tell you the request status and send a result explaining which categories were deleted or de-identified and which were retained, with the reason. This first mobile release has no in-app EwaTrade software subscription. If one is offered in a later release, deleting your EwaTrade login will not automatically cancel a subscription billed by Apple or Google; manage that subscription through the applicable store. You can still request account deletion without waiting for its term to end.",
      },
    ],
  },
  "billing-policy": {
    title: "Software billing policy",
    description:
      "Current mobile pricing and separate merchant transaction payments.",
    sections: [
      {
        title: "Separate types of payment",
        text: "The EwaTrade mobile app is free to download. Its first release does not offer an in-app EwaTrade software subscription purchase. Payments to merchants for physical goods or services are separate transactions governed by the merchant’s sale, fulfilment and refund policies. Payment-provider charges may also be separate.",
      },
      {
        title: "Before purchase",
        text: "If paid EwaTrade mobile software plans are introduced in a later release, the purchase surface must show the selected plan, currency, billing interval, applicable taxes, renewal terms, any trial conversion and the cancellation process before confirmation. Published pricing must match checkout and the resulting entitlement. No such plan can be purchased in the current mobile release.",
      },
      {
        title: "Mobile software subscriptions",
        text: "No EwaTrade mobile software subscription is sold in this release. If mobile plans are later offered through Apple or Google, the applicable app store will manage purchase, renewal and cancellation, and EwaTrade will verify a purchase before granting a software entitlement. Merchant payments for goods or services remain separate from any future software plan.",
      },
      {
        title: "Renewals, cancellation and refunds",
        text: "The current mobile release has no EwaTrade software-subscription renewal or app-store software refund to manage. If a later release introduces a mobile software subscription, its app-store offer will show the price, currency, billing period and any introductory terms before purchase. Apple or Google will manage renewal, payment method and cancellation; cancel through the same store and use its refund process for that purchase. Cancellation of a software plan will not itself cancel an unrelated merchant order or close a business workspace. Contact EwaTrade support about a future software-entitlement mismatch. For a merchant order or service refund, contact the seller identified in that transaction.",
      },
    ],
  },
}
