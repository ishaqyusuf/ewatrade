# Telegram Workshop · Scenarios 1 and 2 screen plan

This plan details the first batch of the [Telegram assistant UI plan](./2026-11-12-telegram-assistant-ui-workshop.md). It covers the eight cases in **1 · Entry from the app** and **2 · First message (not connected)**. The WhatsApp reference is [Hybrid, direction 03](https://workshop.localhost/ewatrade/assistant/whatsapp-system/directions/03?rev=a8810486-c7b7-454d-9f7b-375f9710d843) (scenarios `e-fast` through `o-unknown`).

The WhatsApp design cannot be copied directly. WhatsApp connects inside the chat using an email code. The current Telegram product binds the chat only from a signed-in EwaTrade session using a five-minute, single-use, scoped `/start` link. That rule stays. Telegram's own features take over the parts WhatsApp handled with typed keywords and reply buttons.

## Telegram features used

Bot API details were checked against [core.telegram.org/bots/api](https://core.telegram.org/bots/api) and [bots/features](https://core.telegram.org/bots/features) on 12 November 2026.

| Feature | Bot API | Where it appears | Status |
| --- | --- | --- | --- |
| Empty chat card, “What can this bot do?” | `setMyDescription` (≤512 chars) plus an optional description photo | First open of the bot before Start (1a, 2a) | Proposed; BotFather setting only |
| Profile line and share text | `setMyShortDescription` (≤120 chars) | Bot profile and shared links | Proposed |
| Native **START** bar in place of the composer | Deep link `t.me/<bot>?start=<payload>`, payload ≤64 chars `[A-Za-z0-9_-]` | Every first contact. The current payload is 43 chars. | Current |
| Inline URL button | `InlineKeyboardButton.url` | “Open EwaTrade” on entry, claim and recovery messages | Proposed. Already used for review handoff. |
| Recognisable account on the EwaTrade side | `from.first_name`, `from.username` and `getUserProfilePhotos` on the `/start` update | Confirmation screen shows the Telegram name, @username and photo instead of only `••••1234` | Proposed. See the privacy note below. |
| Edit status in place | `editMessageText` / `editMessageReplyMarkup` on the bot's own message | The claim message changes from “Waiting for confirmation” to “Connected ✓” or “Closed”. Buttons disappear when the claim ends. | Proposed. Review buttons are already cleared today. |
| Pinned scope bar | `pinChatMessage` (any non-service message in a private chat) | After connecting, “Mama Ada Provisions · Yaba Main” pins to the top of the chat | Proposed |
| Command menu per chat | `setMyCommands` with a scope plus `setChatMenuButton` (`MenuButtonCommands`) | Unlinked: `/start`, `/help`. Linked: `/help`, `/scope`, `/disconnect`. | Proposed. Confirm `BotCommandScopeChat` before building. |
| Message effect | `message_effect_id` (private chats only) | One 🎉 effect on “Connected ✓” | Optional; owner decides |
| Typing indicator | `sendChatAction` `typing` (≤5 s) | Header shows “typing…” while a claim is checked | Proposed |
| Telegram sign-in button | `InlineKeyboardButton.login_url` (`LoginUrl`, domain set with BotFather `/setdomain`) | Direction 03 only: bot-first connect and phone confirmation | Proposal. Needs a domain and server-side hash check. |
| Copy button | `copy_text` (≤256 chars) | Not used in this batch | — |

Not used here: Mini Apps (later batches, forms only), reply keyboards, contact sharing (EwaTrade does not need the phone number) and reactions.

**Privacy note.** The Telegram name, @username and photo come from the update Telegram already sent with Start. Show them only on the confirmation screen during the five-minute claim. Do not store them after the claim ends. Keep the masked ID as the fallback when the account has no username or photo.

## Telegram styling in the kit

Build a Telegram kit beside the WhatsApp one. Keep the scene engine and config panel. Replace the chrome.

- **Client:** Telegram for Android first, since most merchants use Android. The light and dark themes follow Telegram's defaults. An iOS skin can come later if the owner wants it.
- **Header:** back arrow, round EwaTrade avatar, “EwaTrade” and a “bot” subtitle that becomes “typing…” during work, and the ⋮ menu. The Preview bot uses the purple Preview icon, so the kit takes the icon as a config value.
- **Chat:** Telegram pattern wallpaper. Bubbles with tails, white incoming and pale green outgoing in light mode, Telegram night colours in dark mode. Time inside the bubble, double checks on outgoing messages, and an “edited” label when a message changes in place.
- **Inline keyboard:** translucent rounded buttons attached under the bubble. URL buttons carry the ↗ corner mark.
- **Composer:** the blue **Menu** pill on the left, a text field, attach and mic icons. Before Start, the full-width **START** bar replaces it.
- **Empty chat:** a centred info card with the bot photo, “What can this bot do?” and the description.
- **Pinned bar:** a thin bar under the header with a blue accent line and “Pinned message” above the scope.
- **Link opening:** Telegram's in-app browser sheet with the `ewatrade.com` header and close button. Inside it, the EwaTrade Dashboard keeps its own styles.
- **Desktop:** Dashboard → Account → Telegram uses the current component layout with the QR. Sample colours from current Telegram screenshots during the build, and use no Telegram logos or brand assets beyond the client chrome.

## Directions

All three use the same cases, sample world (Mama Ada Provisions: Yaba Main and Surulere; Ada Fabrics: Balogun) and EwaTrade-side authority. Only the Telegram side differs.

| Direction | Idea | Scenario 1 | Scenario 2 |
| --- | --- | --- | --- |
| **01 · Today+** | Current bot with clearer copy | Masked `••••1234` compare. Separate text messages for each state. | Text points to account settings, with one URL button |
| **02 · Telegram-native** (recommended) | Same authority, using Telegram's own surfaces | Name, @username and photo on the confirmation screen. One claim message edited in place, pinned scope, scoped menu and optional effect. | Empty-chat card, START, one **Open EwaTrade** URL button, unlinked command menu |
| **03 · Telegram sign-in** | 02 plus `login_url` | Desktop QR path matches 02. On the phone path, Telegram's own “Log in to ewatrade.com” confirm replaces the compare step. | **Connect with EwaTrade** sign-in button. Telegram identity arrives signed, and the user signs in and picks the Business and Store in the in-app browser. No separate link is needed. |

02 is recommended for batch 1 because it needs only Bot API calls the product can make today. 03 is worth seeing because it removes the round trip in scenario 2, but it needs BotFather `/setdomain`, a Telegram hash check on the server and an EwaTrade sign-in inside Telegram's in-app browser.

## Cases and screens

Each case lists its states in order. Each state is a config panel jump. **TG** is the Telegram chat. **EW** is EwaTrade (Dashboard on desktop, or the in-app browser sheet on the phone).

### 1 · Entry from the app

| Case | States | Telegram detail (direction 02) |
| --- | --- | --- |
| **1a** `e-fast` | EW Account → Telegram (scope shown, **Connect Telegram**) → EW link created (QR + **Open Telegram**, “Waiting for you to start the bot…”) → TG empty-chat card + START → TG `/start` sent, typing… → TG claim message “Confirm this account in EwaTrade” with **Open EwaTrade ↗** → EW confirmation with name, @username and photo → **Confirm Telegram account** → TG claim message edited to “Connected ✓ Mama Ada Provisions · Yaba Main”, pinned, linked menu, optional effect → TG `/scope` reply | The bot never asks for credentials. On desktop, the EW states sit beside the phone so the QR scan reads as one flow. |
| **1b** `e-diff` | 1a through the claim → EW confirmation shows a **different** name and photo (“Ada's Work” @ada_work) → **This isn't me** → EW “Nothing was connected” + **Create a new link** → TG claim message edited to “This link was closed. Nothing was connected.” with no buttons → new link opened in the right account → 1a end | The mismatch is visible as a different person. 01 shows two different masks. Any existing grant stays. |
| **1c** `e-expired` | Two variants in one case, **Expired** and **Already used**: TG START → TG neutral reply “This link no longer works. Nothing changed.” + **Open EwaTrade ↗** → EW Account → Telegram with **Create a new link** | The same copy for both variants. An existing connection is not mentioned or changed. Current behaviour drops these silently, so this is a proposal. |

### 2 · First message (not connected)

| Case | States | Telegram detail (direction 02) |
| --- | --- | --- |
| **2a** `o-hello` | TG empty-chat card + START → TG `/start` with no payload → “Connect EwaTrade to use me here.” + **Open EwaTrade ↗** → user types “Hi” → the same reply, edited into the latest message rather than repeated | The unlinked menu shows only `/start` and `/help`. The current bot replies to bare `/start` and drops plain text. The greeting for plain text is proposed. |
| **2b** `o-one` | 2a → **Open EwaTrade** → in-app browser sheet: EW sign-in → EW Account → Telegram with the one Business and Store → 1a from link created onward | In 03: **Connect with EwaTrade** → Telegram login confirm → EW sign-in → confirm → TG “Connected ✓”, without the link and START round trip. |
| **2c** `o-many` | 2b through sign-in → EW Business and Store picker (Mama Ada Provisions → Yaba Main / Surulere; Ada Fabrics → Balogun) → link created → confirmation shows the picked scope → TG “Connected ✓ Mama Ada Provisions · Surulere”, pinned | The chat never lists businesses. Scope is picked only in EwaTrade. |
| **2d** `o-none` | 2b through sign-in → EW “No Business or Store you can use with the assistant yet” + **Create a business** → TG unchanged | The TG reply is identical to 2a. |
| **2e** `o-unknown` | 2a → **Open EwaTrade** → EW sign-in, where account existence is handled only by EwaTrade's normal sign-in → TG unchanged | The bot reveals nothing and collects no email, password or code. The scene repeats 2a's copy to prove it is identical. |

## Copy draft (direction 02)

All copy is short, phone-first and uses the product's existing words where they exist.

- Description: “EwaTrade's assistant for your business. Ask about sales, stock and customers, and record changes you review first. Connect from your EwaTrade account.”
- Short description: “Your EwaTrade business assistant.”
- Unlinked reply (2a, 2e and any text before connecting): “Connect EwaTrade to use me here.” Button: **Open EwaTrade**.
- Claim (1a): “Confirm this Telegram account in EwaTrade to connect Mama Ada Provisions · Yaba Main.” Button: **Open EwaTrade**. When the confirmation succeeds, this message is edited to “Connected ✓ Mama Ada Provisions · Yaba Main. Ask me anything, like *how many customers do I have?*” The second example stays within the enabled customer capabilities.
- Closed claim (1b): “This link was closed. Nothing was connected.”
- Stale link (1c): “This link no longer works. Nothing changed.” Button: **Open EwaTrade**.
- EW confirmation (1a, 1b): “Connect **Ada Okafor** (@ada_provisions) to **Mama Ada Provisions · Yaba Main**?” Buttons: **Confirm Telegram account** and **This isn't me**.

## Build plan

1. Create workshop `ewatrade/assistant/telegram-system`, with source in `workshop/work/ewatrade/assistant/telegram-system/`. Copy the WhatsApp `common/engine.js`, `scenario-nav.js` and workshop config files. Add `tg.css`, a Telegram chrome module and new data files for families 1–2. Copy them rather than linking, because the two workshops evolve separately.
2. Extend the engine with four primitives the WhatsApp kit lacks: an empty-chat card with a START bar, in-place message edits with the “edited” label, a pinned bar, and the in-app browser sheet. Also add per-state Menu pill contents.
3. Build the three directions on one scene graph, plus a comparison page, following the WhatsApp layout. The config panel provides direction, case (1a–2e), state, theme, mobile size, Preview or Production bot icon, and reset. No descriptions appear on the pages.
4. Author with Claude Opus 5.5 at high effort, as the owner requires. Publish once through the catalog helper, with the recommendation set on 02 and no selection.
5. QA: every case plays to its end in all three directions. Check that 1c expired and used are identical, that 2a and 2e copy is identical, a state jump, light and dark themes, a mobile size change, panel collapse and reopen, and preference retention across navigation. Serve the folder locally for screenshots, because the browser pane blocks catalog preview assets.

## Open decisions for the owner

1. Show the Telegram name, @username and photo during confirmation (02), or keep the masked ID only (01)?
2. Take direction 03 (`login_url`) forward as a proposal, given it needs `/setdomain` and sign-in inside Telegram's browser?
3. Use the 🎉 message effect on connect, or skip it?
4. Is Android-only chrome enough for review, or is an iOS skin also needed?
