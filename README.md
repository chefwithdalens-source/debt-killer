# Debt Killer

A simple debt-snowball planner. Add each debt you owe; Debt Killer lines them up smallest balance first, tells you what to pay next, projects your debt-free month (including interest when you enter an APR), and tracks your progress with charts.

## Your data stays in your browser
- Every visitor starts with an empty slate.
- Everything you enter is saved only in your own browser's localStorage (key `debt-killer:v1`) on that device.
- No accounts, no sign-in, no cookies, no analytics, and no data is sent to any server.
- Clearing browser data or switching devices means starting over, unless you have a backup.

## Backup
Settings → **Export backup** downloads a dated JSON file. **Import backup** restores it, on this device or another one. You can also export your payments as CSV.

## Run it
It's static files with no build step. Open `index.html`, or serve the folder with any static host.

## Lender logos
If an account name matches a known lender, its logo shows in place of the initials. Card issuers and buy-now-pay-later providers take priority over networks and stores, so "Navy Federal Amex" shows Navy Federal and "Affirm (Target)" shows Affirm. Logo files are bundled in `/logos` and load from this site only; account names are never sent anywhere.

Logo credits: Navy Federal, Capital One, Affirm, Mission Lane and Synchrony icons come from each company's official website favicon/touch icon. American Express, Target, Chase, Discover, Klarna, Afterpay, Wells Fargo, Bank of America and Apple come from [Simple Icons](https://simpleicons.org) (CC0). Citi and Best Buy come from Wikimedia Commons. All names and logos are trademarks of their respective owners. They're used only to identify accounts, and their use doesn't imply any affiliation or endorsement.

## Artwork credits
- Logo: skull/credit-card mark chosen by the owner (AI-generated concept). All icon sizes are built from `logos/app/master.png`.
- Anubis illustration: AI-generated for the owner (`logos/anubis/`).
- The "Killer" wordmark uses Pirata One by Rodrigo Fuenzalida & Nicolas Massi, under the SIL Open Font License (`fonts/OFL-PirataOne.txt`). It's self-hosted and subset to just those letters.

## Accounts, calendar and colors
- **Accounts** are grouped into collapsible category folders, laid out like the iPhone App Library. Each tile shows a #1, #2… badge for its place in the snowball order. Which folders are open or closed is a display preference saved in `debt-killer:ui`; it isn't account data.
- **Calendar tab**: a month grid of due dates, colored by category, with an Upcoming list for the next 7 days.
- **Category colors**: credit cards are blue, buy now pay later is violet, store cards are teal, auto loans are slate, student loans are green, personal loans are pink, medical is rose, and other is grey.
- **Due-date colors**: Overdue is maroon, Due today is red, 1–3 days is orange, 4–7 days is amber, and later is grey. A due date is **Overdue** when this month's due date has passed with no payment logged in the 30 days before it (or since) and the date is on or after the day the account was added.
- **Pace**: Aggressive gets an orange-amber tint with a flame icon, Moderate is soft blue, Conservative is soft teal, and Snowball pace has no tint.
- **Payoff celebration**: paying an account down to $0 shows a one-time illustrated celebration. With reduced motion turned on, it shows a still image instead.

## Layout
There's a floating glass tab bar at the bottom on every screen size (Home, Accounts, Calendar, Progress), and Add account sits in the header. Spacing follows a scale from `--sp-1` to `--sp-8` (4, 8, 12, 16, 24, 32, 48 and 64px).

## Home
Home opens with your total debt left, followed by the next target, this month's payments, the what-if simulator and the Debt Free / Paid / Next Target summary cards. Every account also has a **What if I pay extra?** preview, and logging a payment plays a quick Anubis strike clip, which you can turn off in Settings.

## Look
- **Palette:** cyberpunk neon. Neon magenta #FF2BD6, electric cyan #00F0FF, acid lime #B6FF2E, laser orange #FF6A1A, ultraviolet #8A3CFF and hot red #FF1F4B, with deeper shades in light mode so text keeps AA contrast.
- **Accent color:** pick one of 6 swatches in Settings. It changes buttons, links, the active tab and focus rings. Category, pace, due-date and progress colors don't change.
- **Background:** solid white (#FFFFFF) in light mode and solid charcoal (#141414) in dark mode. Dark cards sit slightly lighter (#1E1E1E).
- **Welcome screen:** a starfield with drifting shapes. You can add your first account or import a backup.
