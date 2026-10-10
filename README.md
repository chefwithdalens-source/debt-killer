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

## App logo
The Anubis logo artwork was provided by the app's owner. App icons and favicons are cropped from it and live in `/logos/app/`.
