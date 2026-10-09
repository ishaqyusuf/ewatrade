import { Fragment } from "react"
import type { CSSProperties, ReactNode } from "react"
import {
  type SampleBusiness,
  type SampleOrder,
  data,
  money,
} from "./sample-data"
const esc = (value: string | number) => value
const asset = (path: string) => `/${path}`
export type ScreenState = {
  sold?: boolean
  tickTo?: boolean
  press?: boolean
  created?: boolean
  synced?: boolean
  biz?: SampleBusiness
  phase?: number
  business?: typeof data.business
}
const P = (d: ReactNode) => (
  <>
    <svg
      viewBox={"0 0 24 24"}
      fill={"none"}
      stroke={"currentColor"}
      strokeWidth={"2"}
      strokeLinecap={"round"}
      strokeLinejoin={"round"}
      aria-hidden={"true"}
    >
      {d}
    </svg>
  </>
)
export const icons: Record<string, ReactNode> = {
  home: P(
    <path d={"M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"} />,
  ),
  orders: P(
    <>
      <path d={"M7 3h10l2 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6z"} />
      <path d={"M9 10h6M9 14h6"} />
    </>,
  ),
  plus: P(<path d={"M12 5v14M5 12h14"} />),
  catalog: P(
    <>
      <path d={"M4 7l8-4 8 4-8 4z"} />
      <path d={"M4 7v10l8 4 8-4V7"} />
      <path d={"M12 11v10"} />
    </>,
  ),
  more: P(
    <>
      <circle cx={"5"} cy={"12"} r={"1.4"} />
      <circle cx={"12"} cy={"12"} r={"1.4"} />
      <circle cx={"19"} cy={"12"} r={"1.4"} />
    </>,
  ),
  bell: P(
    <>
      <path d={"M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"} />
      <path d={"M10 20a2 2 0 0 0 4 0"} />
    </>,
  ),
  cart: P(
    <>
      <path d={"M3 4h2l2.4 11h10.2L20 7H6.2"} />
      <circle cx={"9"} cy={"19"} r={"1.5"} />
      <circle cx={"17"} cy={"19"} r={"1.5"} />
    </>,
  ),
  box: P(
    <>
      <path d={"M4 7l8-4 8 4v10l-8 4-8-4z"} />
      <path d={"M4 7l8 4 8-4M12 11v10"} />
    </>,
  ),
  users: P(
    <>
      <circle cx={"9"} cy={"8"} r={"3.5"} />
      <path d={"M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"} />
      <path d={"M16 4.5a3.5 3.5 0 0 1 0 7M21 20c0-2.6-1.6-4.8-4-5.6"} />
    </>,
  ),
  wallet: P(
    <>
      <path d={"M4 7h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"} />
      <path d={"M4 7l11-3v3"} />
      <circle cx={"16"} cy={"13"} r={"1.2"} />
    </>,
  ),
  check: P(<path d={"M5 12.5 10 17l9-10"} />),
  chat: P(<path d={"M4 5h16v11H9l-5 4z"} />),
  cloud: P(
    <path d={"M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.6 11 4 4 0 0 1 18 18z"} />,
  ),
  cloudoff: P(
    <>
      <path d={"M3 3l18 18"} />
      <path
        d={"M9 6.3A6 6 0 0 1 19.6 11a4 4 0 0 1 1 6.6M16 18H7a5 5 0 0 1-2.9-9.1"}
      />
    </>,
  ),
  lock: P(
    <>
      <rect x={"5"} y={"11"} width={"14"} height={"9"} rx={"2"} />
      <path d={"M8 11V8a4 4 0 0 1 8 0v3"} />
    </>,
  ),
  receipt: P(
    <>
      <path d={"M6 3h12v18l-3-2-3 2-3-2-3 2z"} />
      <path d={"M9 8h6M9 12h6"} />
    </>,
  ),
  calendar: P(
    <>
      <rect x={"4"} y={"5"} width={"16"} height={"15"} rx={"2"} />
      <path d={"M4 10h16M9 3v4M15 3v4"} />
    </>,
  ),
  egg: P(
    <path d={"M12 3c3.5 0 6 5.5 6 10a6 6 0 0 1-12 0c0-4.5 2.5-10 6-10z"} />,
  ),
  pill: P(
    <>
      <rect
        x={"3"}
        y={"9"}
        width={"18"}
        height={"6"}
        rx={"3"}
        transform={"rotate(-35 12 12)"}
      />
      <path d={"M9.5 8.5 14.5 15.5"} />
    </>,
  ),
  shirt: P(<path d={"M8 4 4 7l2 4 2-1v10h8V10l2 1 2-4-4-3a4 4 0 0 1-8 0z"} />),
  drop: P(<path d={"M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"} />),
  bread: P(
    <path
      d={
        "M5 11a4 4 0 0 1 2-7.5h10A4 4 0 0 1 19 11v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"
      }
    />,
  ),
  dots: P(
    <>
      <circle cx={"6"} cy={"12"} r={"1.5"} />
      <circle cx={"12"} cy={"12"} r={"1.5"} />
      <circle cx={"18"} cy={"12"} r={"1.5"} />
    </>,
  ),
  arrow: P(<path d={"M5 12h14M13 6l6 6-6 6"} />),
  send: P(<path d={"M4 12 20 4l-6 16-3-7z"} />),
  mail: P(
    <>
      <rect x={"3"} y={"5"} width={"18"} height={"14"} rx={"2"} />
      <path d={"m3 7 9 6 9-6"} />
    </>,
  ),
}
export const typeIcon: Record<string, ReactNode> = {
  poultry: icons.egg,
  pharmacy: icons.pill,
  boutique: icons.shirt,
  laundry: icons.drop,
  bakery: icons.bread,
  other: icons.dots,
}

/* -------------------------------------------------------------- */
/* App screens (faithful to the Green Till mobile workshop)         */
/* -------------------------------------------------------------- */
const markSrc = () => asset("brand/ewatrade-mark-precision-rise-v1-reverse.svg")
const orderRow = (o: SampleOrder, isNew?: boolean) => (
  <>
    {"\n    "}
    <div className={`a-orow${isNew ? " is-new" : ""}`}>
      {"\n      "}
      <span className={`a-ini ${o.tone}`}>{o.ini}</span>
      {"\n      "}
      <span className={"a-om"}>
        <b>{esc(o.who)}</b>
        <small>
          {"#"}
          {o.id}
          {" · "}
          {esc(o.meta)}
        </small>
      </span>
      {"\n      "}
      <span className={"a-oamt"}>
        {money(o.amt)}
        <span className={`ew-pill ${o.pill[1]}`}>{esc(o.pill[0])}</span>
      </span>
      {"\n    "}
    </div>
  </>
)

export const screens = {
  home(s: ScreenState = {}) {
    const b = s.business ?? data.business
    const sold = s.sold ? data.sale.qty * data.sale.price : 0
    const rows = [...data.orders]
    if (s.sold)
      rows.unshift({
        id: data.sale.id,
        who: data.sale.customer,
        ini: "TB",
        tone: "t-amber",
        meta: "2 crates · now",
        amt: sold,
        pill: ["Paid", "t-mint"],
      })
    return (
      <>
        {"\n      "}
        <div className={"a-head"}>
          {"\n        "}
          <span className={"a-avatar"}>{b.initials}</span>
          {"\n        "}
          <span>
            <span className={"a-hello"}>
              {"Good morning, "}
              {b.owner}
            </span>
            <div className={"a-biz"}>{b.name}</div>
          </span>
          {"\n        "}
          <span className={"a-iconbtn"}>{icons.bell}</span>
          {"\n      "}
        </div>
        {"\n      "}
        <div className={"a-hero"}>
          {"\n        "}
          <img className={"wm"} src={markSrc()} alt={""} />
          {"\n        "}
          <div className={"a-row"}>
            <span className={"a-label"}>{"Today’s sales"}</span>
            <span className={"a-sync"}>{"Synced 10:42"}</span>
          </div>
          {"\n        "}
          <div className={"a-amt"} data-tick={"sales"}>
            {money(data.today.sales + (s.tickTo ? 0 : sold))}
          </div>
          {"\n        "}
          <div className={"a-delta"}>
            <b>{"▲ 12%"}</b>
            {" vs last Thursday"}
          </div>
          {"\n        "}
          <div className={"a-stats"}>
            {"\n          "}
            <div>
              <small>{"Orders"}</small>
              <b data-tick={"orders"}>{data.today.orders + (s.sold ? 1 : 0)}</b>
            </div>
            {"\n          "}
            <div>
              <small>{"Owed to you"}</small>
              <b>{money(data.today.owed)}</b>
            </div>
            {"\n          "}
            <div>
              <small>{"Eggs in stock"}</small>
              <b>{data.stock.eggs - (s.sold ? data.sale.qty : 0)}</b>
            </div>
            {"\n        "}
          </div>
          {"\n      "}
        </div>
        {"\n      "}
        <div className={"a-quick"}>
          {"\n        "}
          <span className={"a-qa gold"}>
            <i>{icons.plus}</i>
            {"New sale"}
          </span>
          {"\n        "}
          <span className={"a-qa"}>
            <i>{icons.box}</i>
            {"Stock"}
          </span>
          {"\n        "}
          <span className={"a-qa"}>
            <i>{icons.users}</i>
            {"Customers"}
          </span>
          {"\n        "}
          <span className={"a-qa"}>
            <i>{icons.wallet}</i>
            {"Close day"}
          </span>
          {"\n      "}
        </div>
        {"\n      "}
        <div className={"a-sec"}>
          {"Recent orders "}
          <span>{"See all"}</span>
        </div>
        {"\n      "}
        <div className={"a-list"}>
          {rows.slice(0, 3).map((o, i) => (
            <Fragment key={o.id}>{orderRow(o, s.sold && i === 0)}</Fragment>
          ))}
        </div>
      </>
    )
  },
  sale(s: ScreenState = {}) {
    const total = data.sale.qty * data.sale.price
    return (
      <>
        {"\n      "}
        <div className={"a-title"}>
          <span className={"a-back"}>{"‹"}</span>
          {"New sale"}
        </div>
        {"\n      "}
        <div className={"a-steps"}>
          <i className={"on"} />
          <i className={"on"} />
          <i className={"on"} />
        </div>
        {"\n      "}
        <div className={"a-card"}>
          {"\n        "}
          <div className={"a-line"}>
            <span className={"a-thumb t-amber"}>{icons.egg}</span>
            <span className={"a-om"}>
              <b>{"Crate of eggs"}</b>
              <small>
                {money(data.sale.price)}
                {" · 120 in stock"}
              </small>
            </span>
            <span className={"a-qty"}>
              <span>{"−"}</span>
              {data.sale.qty}
              <span>{"+"}</span>
            </span>
          </div>
          {"\n        "}
          <div className={"a-line"}>
            <span className={"a-thumb t-lilac"}>{"TB"}</span>
            <span className={"a-om"}>
              <b>{data.sale.customer}</b>
              <small>{"Customer · 0803 412 7781"}</small>
            </span>
          </div>
          {"\n      "}
        </div>
        {"\n      "}
        <div className={"a-seg"}>
          <span className={"on"}>{"Cash"}</span>
          <span>{"Transfer"}</span>
          <span>{"POS"}</span>
          <span>{"Later"}</span>
        </div>
        {"\n      "}
        <div className={"a-card"}>
          <div className={"a-total"}>
            <span>{"Total"}</span>
            <b>{money(total)}</b>
          </div>
        </div>
        {"\n      "}
        <div className={`a-cta gold${s.press ? " is-press" : ""}`}>
          {"Record sale · "}
          {money(total)}
        </div>
      </>
    )
  },
  created() {
    return (
      <>
        {"\n      "}
        <div className={"a-done"}>
          {"\n        "}
          <div className={"a-check"}>{icons.check}</div>
          {"\n        "}
          <h4>{"Sale recorded"}</h4>
          {"\n        "}
          <p>
            {"Order #"}
            {data.sale.id}
            {" · "}
            {data.sale.customer}
          </p>
          {"\n        "}
          <div className={"a-states"}>
            {"\n          "}
            <div className={"t-mint"}>
              {"Payment"}
              <b>{"Paid"}</b>
            </div>
            {"\n          "}
            <div className={"t-amber"}>
              {"Fulfilment"}
              <b>{"Preparing"}</b>
            </div>
            {"\n        "}
          </div>
          {"\n      "}
        </div>
        {"\n      "}
        <div
          className={"a-card"}
          style={{ marginTop: "16px" } as CSSProperties}
        >
          <div className={"a-line"}>
            <span className={"a-om"}>
              <b>{"2 × Crate of eggs"}</b>
              <small>{"Stock 120 → 118"}</small>
            </span>
            <span
              className={"p"}
              style={{ fontWeight: "800" } as CSSProperties}
            >
              {money(11000)}
            </span>
          </div>
        </div>
        {"\n      "}
        <div className={"a-cta"}>{"Share receipt"}</div>
      </>
    )
  },
  stock() {
    return (
      <>
        {"\n      "}
        <div className={"a-title"}>
          <span className={"a-back"}>{"‹"}</span>
          {"Stock"}
        </div>
        {"\n      "}
        <div className={"a-card"}>
          {"\n        "}
          <div className={"a-line"}>
            <span className={"a-thumb t-amber"}>{icons.egg}</span>
            <span className={"a-om"}>
              <b>{"Crate of eggs"}</b>
              <small>{"Counted 7:05 today"}</small>
            </span>
            <span className={"a-oamt"}>
              {"118"}
              <span className={"ew-pill t-mint"}>{"Healthy"}</span>
            </span>
          </div>
          {"\n        "}
          <div className={"a-line"}>
            <span className={"a-thumb t-sky"}>{icons.box}</span>
            <span className={"a-om"}>
              <b>{"Layer feed 25kg"}</b>
              <small>{"Reorder at 10 bags"}</small>
            </span>
            <span className={"a-oamt"}>
              {"6"}
              <span className={"ew-pill t-rose"}>{"Low"}</span>
            </span>
          </div>
          {"\n        "}
          <div className={"a-line"}>
            <span className={"a-thumb t-lilac"}>{icons.egg}</span>
            <span className={"a-om"}>
              <b>{"Live broiler"}</b>
              <small>{"1 bird = 1 unit"}</small>
            </span>
            <span className={"a-oamt"}>
              {"40"}
              <span className={"ew-pill t-mint"}>{"Healthy"}</span>
            </span>
          </div>
          {"\n      "}
        </div>
        {"\n      "}
        <div className={"a-sec"}>{"Convert units"}</div>
        {"\n      "}
        <div className={"a-card"}>
          <div className={"a-line"}>
            <span className={"a-om"}>
              <b>{"1 crate → 30 eggs"}</b>
              <small>{"Sell crates or single eggs"}</small>
            </span>
            <span className={"ew-pill t-sky"}>{"Units"}</span>
          </div>
        </div>
      </>
    )
  },
  owed() {
    return (
      <>
        {"\n      "}
        <div className={"a-title"}>
          <span className={"a-back"}>{"‹"}</span>
          {"Customers"}
        </div>
        {"\n      "}
        <div
          className={"a-hero"}
          style={{ padding: "14px 16px" } as CSSProperties}
        >
          <div className={"a-label"}>{"Owed to you"}</div>
          <div
            className={"a-amt"}
            style={{ fontSize: "28px" } as CSSProperties}
          >
            {money(42000)}
          </div>
          <div className={"a-delta"}>{"3 customers · oldest 6 days"}</div>
        </div>
        {"\n      "}
        <div
          className={"a-list"}
          style={{ marginTop: "12px" } as CSSProperties}
        >
          {"\n        "}
          {(
            [
              ["Kunle Adeyemi", "KA", "t-sky", 9000, "6 days"],
              ["Grace Eze", "GE", "t-lilac", 21000, "3 days"],
              ["Musa Bello", "MB", "t-mint", 12000, "today"],
            ] as const
          ).map(([n, i, t, a, d]) => (
            <Fragment key={n}>
              <div className={"a-orow"}>
                <span className={`a-ini ${t}`}>{i}</span>
                <span className={"a-om"}>
                  <b>{n}</b>
                  <small>
                    {"Since "}
                    {d}
                  </small>
                </span>
                <span className={"a-oamt"}>
                  {money(a)}
                  <span className={"ew-pill t-amber"}>{"Owes"}</span>
                </span>
              </div>
            </Fragment>
          ))}
          {"\n      "}
        </div>
      </>
    )
  },
  closeday() {
    return (
      <>
        {"\n      "}
        <div className={"a-title"}>
          <span className={"a-back"}>{"‹"}</span>
          {"Close day"}
        </div>
        {"\n      "}
        <div className={"a-card"}>
          {"\n        "}
          <div className={"a-line"}>
            <span className={"a-om"}>
              <b>{"Expected cash"}</b>
              <small>{"From 24 orders"}</small>
            </span>
            <b className={"ew-num"}>{money(126000)}</b>
          </div>
          {"\n        "}
          <div className={"a-line"}>
            <span className={"a-om"}>
              <b>{"Counted"}</b>
              <small>{"By Bisi · 18:40"}</small>
            </span>
            <b className={"ew-num"}>{money(125500)}</b>
          </div>
          {"\n        "}
          <div className={"a-line"}>
            <span className={"a-om"}>
              <b>{"Difference"}</b>
              <small>{"Add a note before closing"}</small>
            </span>
            <span className={"ew-pill t-amber"}>{"−₦500"}</span>
          </div>
          {"\n      "}
        </div>
        {"\n      "}
        <div className={"a-cta"}>{"Close today"}</div>
      </>
    )
  },
  offline(s: ScreenState = {}) {
    const synced = s.synced
    return (
      <>
        {"\n      "}
        <div className={"a-title"}>
          <span className={"a-back"}>{"‹"}</span>
          {"Orders"}
        </div>
        {"\n      "}
        <div
          className={`a-card ${synced ? "t-mint" : "t-amber"}`}
          style={
            {
              display: "flex",
              gap: "10px",
              alignItems: "center",
              transition: "background .5s",
            } as CSSProperties
          }
        >
          {"\n        "}
          <span style={{ width: "22px" } as CSSProperties}>
            {synced ? icons.cloud : icons.cloudoff}
          </span>
          {"\n        "}
          <span className={"a-om"}>
            <b>{synced ? "All sales synced" : "No signal · 2 sales saved"}</b>
            <small style={{ color: "inherit", opacity: ".8" } as CSSProperties}>
              {synced
                ? "Synced 14:07"
                : "They will sync when you’re back online"}
            </small>
          </span>
          {"\n      "}
        </div>
        {"\n      "}
        <div
          className={"a-list"}
          style={{ marginTop: "10px" } as CSSProperties}
        >
          {"\n        "}
          {["Bola Ajayi|BA|t-sky|5500", "Walk-in|WI|t-mint|8000"].map((r) => {
            const [n, i, t, a] = r.split("|")
            return (
              <Fragment key={n}>
                <div className={"a-orow"}>
                  <span className={`a-ini ${t}`}>{i}</span>
                  <span className={"a-om"}>
                    <b>{n}</b>
                    <small>{"14:02"}</small>
                  </span>
                  <span className={"a-oamt"}>
                    {money(Number(a))}
                    <span
                      className={`ew-pill ${synced ? "t-mint" : "t-amber"}`}
                    >
                      {synced ? "Synced" : "Waiting to sync"}
                    </span>
                  </span>
                </div>
              </Fragment>
            )
          })}
          {"\n      "}
        </div>
      </>
    )
  },
  assistant(s: ScreenState = {}) {
    const biz = s.biz || data.businesses[0]
    const shown = s.phase || 0
    return (
      <>
        {"\n      "}
        <div className={"a-title"}>
          <span className={"a-back"}>{"‹"}</span>
          {"Set up your catalogue"}
        </div>
        {"\n      "}
        <div className={"a-chat"}>
          {"\n        "}
          <div className={"a-bub it"}>
            {
              "What do you sell? Type each item with its price and how many you have."
            }
          </div>
          {"\n        "}
          {shown >= 1 ? (
            <>
              <div className={"a-bub me"}>{biz.lines.map(esc).join("\n")}</div>
            </>
          ) : (
            ""
          )}
          {"\n        "}
          {shown === 2 ? (
            <>
              <div className={"a-typing"}>
                <i />
                <i />
                <i />
              </div>
            </>
          ) : (
            ""
          )}
          {"\n        "}
          {shown >= 3 ? (
            <>
              <div className={"a-bub it"}>
                {"Here’s what I found. Check each item before adding."}
              </div>
              {biz.items.map((it, i) => (
                <Fragment key={String(it[0])}>
                  <div
                    className={"a-draft"}
                    style={{ "--d": `${i * 120}ms` } as CSSProperties}
                  >
                    <span
                      className={"a-thumb t-mint"}
                      style={{ width: "32px", height: "32px" } as CSSProperties}
                    >
                      {typeIcon[biz.key]}
                    </span>
                    <span>
                      <b>{esc(it[0])}</b>
                      <small>
                        {it[1]}
                        {" · "}
                        {esc(it[3])}
                      </small>
                    </span>
                    <span className={"p"}>{money(it[2])}</span>
                  </div>
                </Fragment>
              ))}
            </>
          ) : (
            ""
          )}
          {"\n      "}
        </div>
        {"\n      "}
        {shown >= 3 ? (
          <>
            <div className={`a-cta${shown >= 4 ? " " : " gold"}`}>
              {shown >= 4 ? "✓ Added to your business" : "Add to my business"}
            </div>
          </>
        ) : (
          ""
        )}
      </>
    )
  },
}

export const NAV = [
  ["overview", "Overview"],
  ["sale", "Orders"],
  ["catalog", "Catalogue"],
  ["stock", "Stock"],
  ["owed", "Customers"],
  ["closeday", "Finance"],
  ["reports", "Reports"],
  ["team", "Staff"],
] as const
export const navFor = {
  overview: "overview",
  sale: "sale",
  created: "sale",
  stock: "stock",
  owed: "owed",
  team: "team",
  closeday: "closeday",
  assistant: "catalog",
}
export const webViews = {
  overview(s: ScreenState = {}) {
    const bars = [42, 55, 38, 61, 70, 52, 66, 48, 74, 58, 63, s.sold ? 92 : 80]
    const rows = [...data.orders]
    if (s.sold)
      rows.unshift({
        id: data.sale.id,
        who: data.sale.customer,
        ini: "TB",
        tone: "t-amber",
        meta: "2 crates · now",
        amt: 11000,
        pill: ["Paid", "t-mint"],
      })
    return {
      title: "Overview",
      sub: `${data.business.name} · Ibadan store · Today`,
      action: "+ New order",
      body: (
        <>
          {"\n        "}
          <div className={"ew-kpis"}>
            {"\n          "}
            <div className={"ew-kpi hero"}>
              <small>{"Sales today"}</small>
              <b data-k={"sales"}>
                {money(data.today.sales + (s.sold ? 11000 : 0))}
              </b>
            </div>
            {"\n          "}
            <div className={"ew-kpi"}>
              <small>{"Orders"}</small>
              <b>{data.today.orders + (s.sold ? 1 : 0)}</b>
            </div>
            {"\n          "}
            <div className={"ew-kpi"}>
              <small>{"Owed to you"}</small>
              <b>{money(data.today.owed)}</b>
            </div>
            {"\n          "}
            <div className={"ew-kpi"}>
              <small>{"Low stock"}</small>
              <b>{"1 item"}</b>
            </div>
            {"\n        "}
          </div>
          {"\n        "}
          <div className={"ew-dash-grid"}>
            {"\n          "}
            <div className={"ew-chart"}>
              <b>{"Sales, last 12 days"}</b>
              <div className={"ew-chart-bars"}>
                {bars.map((h, i) => (
                  <Fragment key={`day-${i + 1}`}>
                    <i
                      style={{ "--h": `${h}%` } as CSSProperties}
                      className={i === bars.length - 1 ? "today" : ""}
                    />
                  </Fragment>
                ))}
              </div>
            </div>
            {"\n          "}
            <div className={"ew-table"}>
              {rows.slice(0, 3).map((o, i) => (
                <Fragment key={o.id}>
                  <div
                    className={`ew-trow${s.sold && i === 0 ? " is-new" : ""}`}
                  >
                    <span className={"id"}>
                      {"#"}
                      {o.id}
                    </span>
                    <span>{esc(o.who)}</span>
                    <b>{money(o.amt)}</b>
                    <span className={`ew-pill ${o.pill[1]}`}>
                      {esc(o.pill[0])}
                    </span>
                  </div>
                </Fragment>
              ))}
            </div>
            {"\n        "}
          </div>
        </>
      ),
    }
  },
  sale(s: ScreenState = {}) {
    const items = [
      ["Crate of eggs", 5500, "118 crates", "t-amber", "egg"],
      ["Live broiler", 8000, "40 birds", "t-lilac", "egg"],
      ["Layer feed 25kg", 14500, "6 bags", "t-sky", "box"],
      ["Dressing & cutting", 1500, "Service", "t-mint", "receipt"],
    ] as const
    return {
      title: s.created ? `Order #${data.sale.id}` : "New order",
      sub: s.created
        ? `${data.sale.customer} · just now`
        : "Ibadan store · Bisi",
      action: s.created ? "Share receipt" : "Save draft",
      body: (
        <>
          {"\n        "}
          <div className={"ew-web-split"}>
            {"\n          "}
            <div className={"ew-panel"}>
              {"\n            "}
              <div className={"ew-search"}>
                {"Search products and services"}
              </div>
              {"\n            "}
              {items.map(([n, p, st, t, ic], i) => (
                <Fragment key={n}>
                  <div className={`ew-prow${i === 0 ? " on" : ""}`}>
                    <span className={`ew-ic ${t}`}>{icons[String(ic)]}</span>
                    <span className={"ew-pm"}>
                      <b>{n}</b>
                      <small>{st}</small>
                    </span>
                    <b className={"ew-num"}>{money(p)}</b>
                  </div>
                </Fragment>
              ))}
              {"\n          "}
            </div>
            {"\n          "}
            <div className={"ew-panel"}>
              {"\n            "}
              <div className={"ew-kv"}>
                <span>{"Customer"}</span>
                <b>{data.sale.customer}</b>
              </div>
              {"\n            "}
              <div className={"ew-kv"}>
                <span>{"2 × Crate of eggs"}</span>
                <b className={"ew-num"}>{money(11000)}</b>
              </div>
              {"\n            "}
              <div className={"ew-kv"}>
                <span>{"Payment"}</span>
                <b>{"Cash"}</b>
              </div>
              {"\n            "}
              <div className={"ew-kv ew-tot"}>
                <span>{"Total"}</span>
                <b className={"ew-num"}>{money(11000)}</b>
              </div>
              {"\n            "}
              {s.created ? (
                <>
                  <div className={"ew-states"}>
                    <div className={"t-mint"}>
                      {"Payment"}
                      <b>{"Paid"}</b>
                    </div>
                    <div className={"t-amber"}>
                      {"Fulfilment"}
                      <b>{"Preparing"}</b>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className={`ew-webcta${s.press ? " is-press" : ""}`}>
                    {"Record order · "}
                    {money(11000)}
                  </div>
                </>
              )}
              {"\n          "}
            </div>
            {"\n        "}
          </div>
        </>
      ),
    }
  },
  stock() {
    const rows = [
      ["Crate of eggs", "118", "crates", "Counted 07:05", "Healthy", "t-mint"],
      ["Live broiler", "40", "birds", "Counted 07:05", "Healthy", "t-mint"],
      ["Layer feed 25kg", "6", "bags", "Reorder at 10", "Low", "t-rose"],
      ["Day-old chicks", "200", "chicks", "Received Mon", "Healthy", "t-mint"],
    ] as const
    return {
      title: "Stock",
      sub: "Ibadan store · 4 items tracked",
      action: "Record stock",
      body: (
        <>
          {"\n        "}
          <div className={"ew-panel ew-tablefull"}>
            {"\n          "}
            <div className={"ew-th"}>
              <span>{"Item"}</span>
              <span>{"In stock"}</span>
              <span>{"Note"}</span>
              <span>{"Status"}</span>
            </div>
            {"\n          "}
            {rows.map(([n, q, u, note, st, t]) => (
              <Fragment key={n}>
                <div className={"ew-tr"}>
                  <b>{n}</b>
                  <span className={"ew-num"}>
                    <b>{q}</b> {u}
                  </span>
                  <span className={"ew-mute"}>{note}</span>
                  <span className={`ew-pill ${t}`}>{st}</span>
                </div>
              </Fragment>
            ))}
            {"\n        "}
          </div>
          {"\n        "}
          <div className={"ew-note t-sky"}>
            {
              "Unit conversion: 1 crate = 30 eggs. Sell by the crate or the egg; stock stays exact."
            }
          </div>
        </>
      ),
    }
  },
  owed() {
    const rows = [
      ["Grace Eze", "GE", "t-lilac", 21000, "3 days", "2 orders"],
      ["Musa Bello", "MB", "t-mint", 12000, "today", "1 order"],
      ["Kunle Adeyemi", "KA", "t-sky", 9000, "6 days", "1 order"],
    ] as const
    return {
      title: "Customers",
      sub: "Customer book · 128 customers",
      action: "+ Add customer",
      body: (
        <>
          {"\n        "}
          <div
            className={"ew-kpis"}
            style={
              {
                gridTemplateColumns: "repeat(3,minmax(0,1fr))",
              } as CSSProperties
            }
          >
            {"\n          "}
            <div
              className={"ew-kpi"}
              style={
                {
                  background: "var(--ew-amber)",
                  color: "var(--ew-amber-fg)",
                  border: "0",
                } as CSSProperties
              }
            >
              <small
                style={{ color: "inherit", opacity: ".8" } as CSSProperties}
              >
                {"Owed to you"}
              </small>
              <b>{money(42000)}</b>
            </div>
            {"\n          "}
            <div className={"ew-kpi"}>
              <small>{"Customers owing"}</small>
              <b>{"3"}</b>
            </div>
            {"\n          "}
            <div className={"ew-kpi"}>
              <small>{"Oldest balance"}</small>
              <b>{"6 days"}</b>
            </div>
            {"\n        "}
          </div>
          {"\n        "}
          <div className={"ew-panel ew-tablefull"}>
            {"\n          "}
            <div className={"ew-th"}>
              <span>{"Customer"}</span>
              <span>{"Balance"}</span>
              <span>{"Since"}</span>
              <span />
            </div>
            {"\n          "}
            {rows.map(([n, i, t, a, d, o]) => (
              <Fragment key={n}>
                <div className={"ew-tr"}>
                  <span className={"ew-who"}>
                    <span className={`ew-ini ${t}`}>{i}</span>
                    <b>{n}</b>
                  </span>
                  <b className={"ew-num"}>{money(a)}</b>
                  <span className={"ew-mute"}>
                    {d}
                    {" · "}
                    {o}
                  </span>
                  <span className={"ew-pill t-amber"}>{"Owes"}</span>
                </div>
              </Fragment>
            ))}
            {"\n        "}
          </div>
        </>
      ),
    }
  },
  team() {
    const rows = [
      ["Bisi Adebayo", "Owner", "t-mint", 98500, "All orders"],
      ["Halima Musa", "Sales rep", "t-lilac", 61000, "Only their own sales"],
      ["Chidi Okafor", "Sales rep", "t-sky", 36000, "Only their own sales"],
    ] as const
    return {
      title: "Staff",
      sub: "Ibadan store · 3 people",
      action: "+ Invite",
      body: (
        <>
          {"\n        "}
          <div className={"ew-panel ew-tablefull"}>
            {"\n          "}
            <div className={"ew-th"}>
              <span>{"Person"}</span>
              <span>{"Role"}</span>
              <span>{"Sales today"}</span>
              <span>{"Sees"}</span>
            </div>
            {"\n          "}
            {rows.map(([n, r, t, a, v]) => (
              <Fragment key={n}>
                <div className={"ew-tr"}>
                  <span className={"ew-who"}>
                    <span className={`ew-ini ${t}`}>
                      {String(n)
                        .split(" ")
                        .map((w) => w[0])
                        .join("")}
                    </span>
                    <b>{n}</b>
                  </span>
                  <span>{r}</span>
                  <b className={"ew-num"}>{money(a)}</b>
                  <span className={"ew-mute"}>{v}</span>
                </div>
              </Fragment>
            ))}
            {"\n        "}
          </div>
          {"\n        "}
          <div className={"ew-setting"}>
            <span>
              <b>{"Sales reps can see"}</b>
              <small>{"Set per store. Enforced on every device."}</small>
            </span>
            <span className={"ew-seg2"}>
              <i className={"on"}>{"Only their own sales"}</i>
              <i>{"All orders in this store"}</i>
            </span>
          </div>
        </>
      ),
    }
  },
  closeday() {
    return {
      title: "Close the day",
      sub: "Thursday · Ibadan store",
      action: "Close today",
      body: (
        <>
          {"\n        "}
          <div className={"ew-web-split"}>
            {"\n          "}
            <div className={"ew-panel"}>
              {"\n            "}
              <div className={"ew-kv"}>
                <span>{"Expected cash"}</span>
                <b className={"ew-num"}>{money(126000)}</b>
              </div>
              {"\n            "}
              <div className={"ew-kv"}>
                <span>{"Counted by Bisi · 18:40"}</span>
                <b className={"ew-num"}>{money(125500)}</b>
              </div>
              {"\n            "}
              <div className={"ew-kv"}>
                <span>{"Difference"}</span>
                <span className={"ew-pill t-amber"}>{"−₦500"}</span>
              </div>
              {"\n            "}
              <div className={"ew-kv"}>
                <span>{"Note"}</span>
                <span className={"ew-mute"}>{"Change given to walk-in"}</span>
              </div>
              {"\n          "}
            </div>
            {"\n          "}
            <div className={"ew-panel"}>
              {"\n            "}
              <b>{"Takings by method"}</b>
              {"\n            "}
              {(
                [
                  ["Cash", 126000, 64],
                  ["Transfer", 52500, 27],
                  ["POS", 17000, 9],
                ] as const
              ).map(([m, a, p]) => (
                <Fragment key={m}>
                  <div className={"ew-meth"}>
                    <span>{m}</span>
                    <i style={{ "--w": `${p}%` } as CSSProperties} />
                    <b className={"ew-num"}>{money(a)}</b>
                  </div>
                </Fragment>
              ))}
              {"\n          "}
            </div>
            {"\n        "}
          </div>
        </>
      ),
    }
  },
  assistant(s: ScreenState = {}) {
    const biz = s.biz || data.businesses[0]
    const p = s.phase || 0
    return {
      title: "Set up your catalogue",
      sub: "Setup assistant · typed",
      action: "Catalogue",
      body: (
        <>
          {"\n        "}
          <div className={"ew-web-split"}>
            {"\n          "}
            <div className={"ew-panel ew-chatw"}>
              {"\n            "}
              <div className={"a-bub it"}>
                {
                  "What do you sell? Type each item with its price and how many you have."
                }
              </div>
              {"\n            "}
              {p >= 1 ? (
                <>
                  <div className={"a-bub me"}>
                    {biz.lines.map(esc).join("\n")}
                  </div>
                </>
              ) : (
                ""
              )}
              {"\n            "}
              {p === 2 ? (
                <>
                  <div className={"a-typing"}>
                    <i />
                    <i />
                    <i />
                  </div>
                </>
              ) : (
                ""
              )}
              {"\n            "}
              {p >= 3 ? (
                <>
                  <div className={"a-bub it"}>
                    {"Here’s what I found. Check each item before adding."}
                  </div>
                </>
              ) : (
                ""
              )}
              {"\n          "}
            </div>
            {"\n          "}
            <div className={"ew-panel"}>
              {"\n            "}
              <b>{"Draft items"}</b>
              {"\n            "}
              {p >= 3 ? (
                biz.items.map((it, i) => (
                  <Fragment key={String(it[0])}>
                    <div
                      className={"a-draft"}
                      style={{ "--d": `${i * 120}ms` } as CSSProperties}
                    >
                      <span
                        className={"a-thumb t-mint"}
                        style={
                          { width: "32px", height: "32px" } as CSSProperties
                        }
                      >
                        {typeIcon[biz.key]}
                      </span>
                      <span>
                        <b>{esc(it[0])}</b>
                        <small>
                          {it[1]}
                          {" · "}
                          {esc(it[3])}
                        </small>
                      </span>
                      <span className={"p"}>{money(it[2])}</span>
                    </div>
                  </Fragment>
                ))
              ) : (
                <>
                  <p
                    className={"ew-mute"}
                    style={{ margin: "8px 0 0" } as CSSProperties}
                  >
                    {"Drafts appear here."}
                  </p>
                </>
              )}
              {"\n            "}
              {p >= 3 ? (
                <>
                  <div className={`ew-webcta${p >= 4 ? " done" : ""}`}>
                    {p >= 4 ? "✓ Added to your business" : "Add to my business"}
                  </div>
                </>
              ) : (
                ""
              )}
              {"\n          "}
            </div>
            {"\n        "}
          </div>
        </>
      ),
    }
  },
}
