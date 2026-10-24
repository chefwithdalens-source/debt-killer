# Debt Slayer

A debt payoff planner. Add each debt (balance, APR, minimum, due day). Compare snowball, avalanche, and a custom order side by side, with a month-by-month schedule, extra-payment and one-time windfall what-ifs, and a budget tied to income, expenses, and free cash flow.

## Your data stays in your browser
- Every visitor starts with an empty slate.
- Everything you enter is saved only in your own browser's localStorage (key `debt-killer:v1`) on that device.
- No accounts, no sign-in, no cookies, no analytics, and no data is sent to any server.
- Clearing browser data or switching devices means starting over, unless you have a backup.

## Backup
Settings → **Export backup** downloads a dated JSON file. **Import backup** restores it, on this device or another one. You can also export your payments as CSV.

## Run it
It's static files with no build step. Open `index.html`, or serve the folder with any static host.

Payoff math lives in `engine.js` and is covered by `node --test` (or `npm test`). Interest is monthly: balance × APR ÷ 12, rounded to the cent, then the payment is applied. Snowball sends extra dollars to the smallest balance, avalanche to the highest APR, and a paid-off payment rolls to the next debt.

## Plan
The Plan tab stores the strategy on your existing `debt-killer:v1` save. Older saves keep working. If a save predates strategies, “Finish the current target in a set number of payments” stays on so the payment amounts you were shown don’t jump; turn it off for a classic minimum-plus-extra plan. Income, expenses, extra monthly payment, and a one-time windfall are optional fields on that same save.

## Lender logos
If an account name matches a known lender, its logo shows in place of the initials. Card issuers and buy-now-pay-later providers take priority over networks and stores, so "Navy Federal Amex" shows Navy Federal and "Affirm (Target)" shows Affirm. Logo files are bundled in `/logos` and load from this site only; account names are never sent anywhere.

Logo credits: Navy Federal, Capital One, Affirm, Mission Lane and Synchrony icons come from each company's official website favicon/touch icon. American Express, Target, Chase, Discover, Klarna, Afterpay, Wells Fargo, Bank of America and Apple come from [Simple Icons](https://simpleicons.org) (CC0). Citi and Best Buy come from Wikimedia Commons. All names and logos are trademarks of their respective owners. They're used only to identify accounts, and their use doesn't imply any affiliation or endorsement.

## Artwork credits
- Logo: skull/credit-card mark chosen by the owner (AI-generated concept). All icon sizes are built from `logos/app/master.png`.
- Anubis illustration: AI-generated for the owner (`logos/anubis/`).
- The "Killer" wordmark uses Pirata One by Rodrigo Fuenzalida & Nicolas Massi, under the SIL Open Font License (`fonts/OFL-PirataOne.txt`). It's self-hosted and subset to just those letters.

## Accounts, calendar and colors
- **Accounts** are grouped into collapsible category folders, laid out like the iPhone App Library. Each tile shows balance, APR, minimum, and a #1, #2… badge for its place in the current plan. Which folders are open or closed is a display preference saved in `debt-killer:ui`; it isn't account data.
- **Calendar tab**: a month grid of due dates, colored by category, with an Upcoming list for the next 7 days.
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
Debt Slayer works fully offline with no account. If `config.js` has Supabase credentials, **Settings → Sync across devices** (and the welcome screen) offers email magic-link sign-in. While signed in, your data syncs to one private row per user; localStorage stays as the offline cache.

- **First sign-in on a device:** if the cloud has data and this device is empty, the cloud copy is loaded. If both have different data, you choose which to keep (the newer one is the default). If only this device has data, it is uploaded.
- **After that:** changes upload a moment after you make them, and the app checks for newer data when you come back to the tab.
- **Sign out:** choose to keep the data on this device or remove it. The cloud copy stays.

### Setup
1. Create a Supabase project. In **SQL Editor**, run `supabase/schema.sql`. It creates the `user_state` table with Row Level Security so each user can only read and write their own row.
2. **Authentication → Sign In / Providers → Email:** enable it. Magic links need no password.
3. **Authentication → URL Configuration:** set **Site URL** to `https://chefwithdalens-source.github.io/debt-killer/` and add the same URL under **Redirect URLs**.
4. **Project Settings → API:** copy the **Project URL** and the **anon public** key into `config.js`. The anon key is public by design; never put the `service_role` key in this repo.
5. Optional: under **Authentication → Emails → SMTP**, set up your own email sender. The built-in one is rate-limited to a few emails per hour.

supabase-js is loaded only when `config.js` is filled in, from jsDelivr, pinned to version 2.117.3 with a Subresource Integrity hash.
