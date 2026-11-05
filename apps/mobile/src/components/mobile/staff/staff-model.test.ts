import { describe, expect, test } from "bun:test"
import {
  type StaffRow,
  emptyStaffDraft,
  findStaffDuplicate,
  prepareStaffInvite,
  staffDraftErrors,
} from "./staff-model"

const draft = (input: Partial<ReturnType<typeof emptyStaffDraft>>) => ({
  ...emptyStaffDraft(),
  ...input,
})

function row(input: Partial<StaffRow>): StaffRow {
  return {
    detail: "Cashier · invited 4 Nov",
    email: "",
    phone: "",
    phoneE164: "",
    inviteEmail: "",
    whatsapp: null,
    id: "membership",
    initials: "AO",
    name: "Ada Obi",
    statusLabel: "Pending",
    ...input,
  }
}

describe("staff invite draft", () => {
  test("each chosen contact is required, with the Workshop copy", () => {
    expect(staffDraftErrors(draft({ channel: "whatsapp" }))).toEqual({
      phone: "Add their WhatsApp number",
    })
    expect(staffDraftErrors(draft({ channel: "both" }))).toEqual({
      email: "Add their email address",
      phone: "Add their WhatsApp number",
    })
    expect(
      staffDraftErrors(draft({ channel: "both", email: "ada@", phone: "803" })),
    ).toEqual({
      email: "Enter a full email address, like name@example.com",
      phone: "Enter a full WhatsApp number, like 802 123 4567",
    })
  })

  test("sends only the chosen contacts, the phone as +E.164", () => {
    const prepared = prepareStaffInvite(
      draft({
        channel: "whatsapp",
        email: "ignored@example.com",
        phone: "0803 555 0142",
        name: " Ada Obi ",
      }),
      "store",
      "external",
    )
    expect(prepared).toEqual({
      input: {
        phone: "+2348035550142",
        name: "Ada Obi",
        role: "cashier",
        storeId: "store",
        externalId: "external",
      },
    })
    expect(
      prepareStaffInvite(
        draft({
          channel: "both",
          email: "Ada@Example.com",
          phone: "8035550142",
        }),
        "store",
        "external",
      ),
    ).toMatchObject({
      input: { email: "ada@example.com", phone: "+2348035550142" },
    })
  })

  test("finds an existing staff member by number or email", () => {
    const rows = [
      row({ phoneE164: "+2348035550142", statusLabel: "Active" }),
      row({ id: "m2", name: "Tunde", inviteEmail: "tunde@example.com" }),
    ]
    expect(
      findStaffDuplicate(
        draft({ channel: "whatsapp", phone: "803 555 0142" }),
        rows,
      ),
    ).toMatchObject({ via: "phone", row: { statusLabel: "Active" } })
    expect(
      findStaffDuplicate(
        draft({ channel: "email", email: "TUNDE@example.com" }),
        rows,
      ),
    ).toMatchObject({ via: "email", row: { name: "Tunde" } })
    expect(
      findStaffDuplicate(
        draft({ channel: "email", email: "new@example.com" }),
        rows,
      ),
    ).toBeNull()
  })
})
