# Debt Slayer

A debt payoff planner. Add each debt (balance, APR, minimum, due day). Compare snowball, avalanche, and a custom order side by side, with a month-by-month schedule, extra-payment and one-time windfall what-ifs, and a budget tied to income, expenses, and free cash flow.

## Your data stays in your browser
- Every visitor starts with an empty slate.
- Everything you enter is saved in your own browser's localStorage (key `debt-killer:v1`) on that device.
- With sync turned off, nothing is sent to a server. There is no analytics.
- Optional Supabase sync, described below, uploads that same save to a private row while you are signed in.
- Clearing browser data or switching devices means starting over, unless you have a backup or you are signed in to sync.

## Backup
Settings → **Export backup** downloads a dated JSON file. **Import backup** restores it, on this device or another one. You can also export your payments as CSV.

## Run it
It's static files with no build step. Open `index.html`, or serve the folder with any static host.

Payoff math lives in `engine.js` and is covered by `node --test` (or `npm test`). Interest is monthly: balance × APR ÷ 12, rounded to the cent, then the payment is applied. Snowball sends extra dollars to the smallest balance, avalanche to the highest APR, and a paid-off payment rolls to the next debt.

## Plan
The Plan tab stores the strategy on your existing `debt-killer:v1` save. Older saves keep working. If a save predates strategies, “Finish the current target in a set number of payments” stays on so the payment amounts you were shown don’t jump; turn it off for a classic minimum-plus-extra plan. Income, expenses, extra monthly payment, and a one-time windfall are optional fields on that same save.

A due day places that debt’s payment on that day of the month. It does not change the interest or the number of months. Debts with no due day are paid on the 1st. Day 31 clamps to the last day of a short month.

Logging a payment splits it into interest and principal. Interest since the last balance change is balance × APR ÷ 12 × days ÷ 30, rounded to the cent. The stored balance becomes balance + interest − payment. Payments already on disk are marked legacy: the app fills in interest and principal, and leaves the balance where it was. Manual balance edits are kept on the same save and show up in the balance history. The in-memory version is 3. The storage key does not change.

## Lender logos
If an account name matches a known lender, its logo shows in place of the initials. Card issuers and buy-now-pay-later providers take priority over networks and stores, so "Navy Federal Amex" shows Navy Federal and "Affirm (Target)" shows Affirm. Logo files are bundled in `/logos` and load from this site only; account names are never sent anywhere.

Logo credits: Navy Federal, Capital One, Affirm, Mission Lane and Synchrony icons come from each company's official website favicon/touch icon. American Express, Target, Chase, Discover, Klarna, Afterpay, PayPal, Wells Fargo, Bank of America and Apple come from [Simple Icons](https://simpleicons.org) (CC0). Citi and Best Buy come from Wikimedia Commons. All names and logos are trademarks of their respective owners. They're used only to identify accounts, and their use doesn't imply any affiliation or endorsement.

## Artwork credits
- Logo: skull/credit-card mark chosen by the owner (AI-generated concept). All icon sizes are built from `logos/app/master.png`.
- Anubis illustration: AI-generated for the owner (`logos/anubis/`).
- The "Killer" wordmark uses Pirata One by Rodrigo Fuenzalida & Nicolas Massi, under the SIL Open Font License (`fonts/OFL-PirataOne.txt`). It's self-hosted and subset to just those letters.

## Accounts, calendar and colors
- **Accounts** are grouped into collapsible category folders, laid out like the iPhone App Library. Each tile shows balance, APR, minimum, and a #1, #2… badge for its place in the current plan. Which folders are open or closed is a display preference saved in `debt-killer:ui`; it isn't account data.
- **Calendar tab**: a month grid of due dates, colored by category, with an Upcoming list for the next 7 days. Arrow keys move between days. Home and End move within the week. Page Up and Page Down change month. Enter or Space opens a day that has a payment due.
- **Category colors**: credit cards are blue, buy now pay later is violet, store cards are teal, auto loans are slate, student loans are green, personal loans are pink, medical is rose, and other is grey.
- **Due-date colors**: Overdue is maroon, Due today is red, 1–3 days is orange, 4–7 days is amber, and later is grey. A due date is **Overdue** when this month's due date has passed with no payment logged in the 30 days before it (or since) and the date is on or after the day the account was added.
- **Pace**: Aggressive gets an orange-amber tint with a flame icon, Moderate is soft blue, Conservative is soft teal, and Minimum (no pace set) has no tint.
- **Payoff celebration**: paying an account down to $0 shows a one-time illustrated celebration. With reduced motion turned on, it shows a still image instead.

## Layout
There's a floating glass tab bar at the bottom on phones (Home, Accounts, Plan, Calendar, Progress), and a left rail from tablet width up that also includes Summary. Add account sits in the header. Spacing follows a scale from `--sp-1` to `--sp-8` (4, 8, 12, 16, 24, 32, 48 and 64px).

## Home
Home opens with your total debt left, followed by the next target, this month's payments, the what-if simulator and the Debt Free / Paid / Next Target summary cards. Every account also has a **What if I pay extra?** preview, and logging a payment plays a quick Anubis strike clip, which you can turn off in Settings.

## Look
- **Palette:** cyberpunk neon. Neon magenta #FF2BD6, electric cyan #00F0FF, acid lime #B6FF2E, laser orange #FF6A1A, ultraviolet #8A3CFF and hot red #FF1F4B, with deeper shades in light mode so text keeps AA contrast.
- **Accent color:** pick one of 6 swatches in Settings. It changes buttons, links, the active tab and focus rings. Category, pace, due-date and progress colors don't change.
- **Background:** solid white (#FFFFFF) in light mode and solid charcoal (#141414) in dark mode. Dark cards sit slightly lighter (#1E1E1E).
- **Welcome screen:** a starfield with drifting shapes. You can add your first account or import a backup.

## Debt Slayer redesign
- **Name:** the app is now **Debt Slayer** (formerly Debt Killer). Your saved data stays under the same browser storage key, and backups exported by Debt Killer still import.
- **Logo:** a gold line-art Anubis head in a gold circle, cropped from the owner-supplied artwork, upscaled and sharpened (`logos/app/master.png`; every icon size is built from it). The skull mark is retired as the primary logo.
- **Look:** navy-charcoal frosted glass in dark mode, white with light frosted cards in light mode, with **Gold** as the default accent (still changeable in Settings). Green means paid or progress; red means interest.
- **Home:** a Total Debt hero with a balance sparkline, Activity, Next target, This month summary, Details, and a What-if grid with one tile per account. iPad and desktop get a left icon rail.

## Try the demo
Open **https://chefwithdalens-source.github.io/debt-killer/?demo=1** (or tap **Try the demo** on the welcome screen). The demo loads clearly fake sample accounts from `demo-data.js`. It is marked DEMO with a banner, lives only in that browser tab (sessionStorage), is never written to localStorage or the cloud, and has **Reset** and **Exit demo** buttons. Your own data on that device is never touched.

## Cross-device sync (optional, Supabase)
Debt Slayer works fully offline with no account. A service worker caches the static shell and uses it only when the network fails, so an open connection always loads the current HTML, CSS, and scripts. Supabase and other sites are not cached. Account data stays in localStorage.

If `config.js` has Supabase credentials, **Settings → Sync across devices** (and the welcome screen) offers email magic-link sign-in. The client uses PKCE, so the return URL carries `?code=` and the code verifier stays in the browser. While signed in, your data syncs to one private row per user; localStorage stays as the offline cache.

The page sets a Content-Security-Policy. Scripts load only from this site and from jsDelivr (supabase-js). Connections are limited to this site and `*.supabase.co`. A meta policy cannot set `frame-ancestors`.

- **First sign-in on a device:** if the cloud has data and this device is empty, the cloud copy is loaded. If both have different data, you choose which to keep. The dialog highlights the copy with the higher revision. The clock is only a hint, so a skewed clock cannot pick a winner by itself. Before a cloud copy replaces this device, the previous local copy is kept in a short backup on the device (`debt-killer:sync-backup`, up to five). If only this device has data, it is uploaded.
- **After that:** each saved copy carries a revision. A change uploads a moment after you make it, and only when this tab still has the revision it last synced. If this device and the cloud both moved on, the app asks instead of overwriting. A failed upload stays on this device and retries. Coming back to the tab downloads the cloud copy only when its revision is newer and this device has no unsynced edits.
- **Sign out:** waiting edits are sent first. If that upload fails, you stay signed in and the data stays on this device. You can also remove the on-device copy; the cloud copy stays.
- **Erase:** “Erase everything” clears this device. While signed in you can also erase the cloud copy. That writes an empty tombstone (a higher revision, not a deleted row) and clears this device only after the write succeeds. A failed cloud erase leaves the on-device accounts in place. An older device cannot recreate erased accounts by uploading over that tombstone.
- **Row Level Security:** the anon key cannot read or write another user’s row. `supabase/schema.sql` enables RLS, revokes `anon`, and the select, insert, update, and delete policies each require `auth.uid() = user_id`. The client sends only the signed-in user’s id. The service-role key is not in this repo. A tombstone is a normal upsert of that user’s own row. These are the assumptions the client relies on; this repo does not change the Supabase project’s settings.

### Setup
1. Create a Supabase project. In **SQL Editor**, run `supabase/schema.sql`. It creates the `user_state` table with Row Level Security so each signed-in user can only read and write their own row. Leave those policies as written: `anon` stays revoked, and the client never needs the service-role key.
2. **Authentication → Sign In / Providers → Email:** enable it. Magic links need no password.
3. **Authentication → URL Configuration:** set **Site URL** to `https://chefwithdalens-source.github.io/debt-killer/` and add the same URL under **Redirect URLs**. Magic links return to that URL with `?code=`.
4. **Project Settings → API:** copy the **Project URL** and the **anon public** key into `config.js`. The anon key is public by design; never put the `service_role` key in this repo.
5. Optional: under **Authentication → Emails → SMTP**, set up your own email sender. The built-in one is rate-limited to a few emails per hour.

supabase-js is loaded only when `config.js` is filled in, from jsDelivr, pinned to version 2.117.3 with a Subresource Integrity hash.
