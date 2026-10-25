# Debt Slayer audit

Reviewed the GitHub Pages app that serves https://chefwithdalens-source.github.io/debt-killer/ (`index.html`, `app.js`, `styles.css`, `sync.js`, `config.js`, `demo-data.js`, `supabase/schema.sql`). The live URL is the same static shell; the page body is drawn by JavaScript, so behavior was reviewed from source. Payoff math was checked against the standard monthly formula: interest = balance × APR / 12, then next balance = balance + interest − payment. For a single loan the month count is n = −ln(1 − rP/M) / ln(1+r), rounded up to the next month. A worked case used throughout: $5,000 at 18% APR with a $150 payment is 47 months.

Findings below are the state of the app before this change. The last section says what the accompanying work fixes and what is still open.

## P0 — payoff math and numbers the UI states as fact

1. **The only simulator was not classic snowball.** `simulate()` always ordered by smallest balance, then raised the first debt (unless it already had a pace tier) to `ceil(balance / defaultMonths)`, default 6. A $9,900 balance with a $310 minimum was planned near $1,650 a month. Debt-free dates were optimistic, and there was no way to plan “minimums plus extra.”
2. **No avalanche and no custom order.** Highest-APR-first and a user-chosen order did not exist, so the app could not show the interest difference those strategies exist to show.
3. **Interest was not rounded to the cent.** Each month used `balance * apr / 1200` as a float. A $1,000 balance at 19.99% is $16.6583…, which a statement rounds to $16.66. Over a long schedule the pennies drift, and two runs of the same balances were not guaranteed to match a lender’s amortization.
4. **Minimums below interest were a silent 600-month cap.** The loop stopped at 600 months with `freeDate` null and little explanation. A card whose minimum does not cover monthly interest looked like a far-off payoff instead of a balance that grows.
5. **Home copy compared this month to itself.** The hero said the amount paid this month was “less than last month” without reading last month. The “Debt reduced” cell was `max(0, payments this month − estimated interest on today’s balances)`, which is not principal paid and not a change versus last month. “On-track days” was a streak of calendar days that contained any logged payment.
6. **Monthly Summary labeled logged payments as debt reduced.** The total and the takeaway (“paid down”) summed payment amounts. A $200 payment on a card that accrued $40 of interest was described as $200 of debt reduced. The stored balance is also reduced by the full payment; the projection accrues interest separately. Those two models were never reconciled in the UI.
7. **A budget below the sum of planned payments was ignored.** The simulator only raised the pool when the budget was higher. A budget the user could not actually fund still produced the boosted plan, with no warning.
8. **“Interest saved” had no baseline.** There was no minimums-only projection (each debt paid in isolation, no rollover, no extra) to subtract from the plan.

## P0 — data the user can lose

9. **Erase while signed in did not clear the cloud copy and could restore it.** Erase removed the local key and reset memory, then the next sync pull wrote the cloud row back. There was no “device only” versus “also erase the cloud copy” choice, and sign-out always flushed the current state first.
10. **The storage banner always said the data stayed on the device.** That is true when Supabase is unset. When sync is configured, the whole profile (balances, payments, budget) is uploaded to one row. The banner did not say so.

## P1 — privacy and client secrets

11. **`config.js` holds a Supabase URL and a publishable key.** That key is meant to be public. Row Level Security in `supabase/schema.sql` is what keeps each user’s row private. A service-role key is not in the repo and must stay that way. The file is still a credential-shaped string in a public Pages repo; treat rotation and RLS reviews as ongoing work, not as a leaked secret.
12. **Financial data lives in `localStorage` under `debt-killer:v1`.** Any script that runs on the origin can read it. There is no Content-Security-Policy. Demo mode correctly uses `sessionStorage` and `?demo=1` and does not write that key.
13. **Magic-link sign-in uses the implicit flow.** Access tokens land in the URL fragment (`flowType: 'implicit'`). A PKCE flow would keep the code out of the address bar and out of history and referrer logs.
14. **“Add to Google Calendar” puts the debt name and minimum in a Google URL.** That is an intentional share, but it leaves the device.

## P1 — accessibility, mobile, and UX

15. **No skip link.** Keyboard users tabbed through the sidebar or the phone tab bar before the main content.
16. **The phone tab bar was hard-coded for four tabs** (bubble width `100% / 4`). Adding a fifth destination misaligned the indicator. Summary is still absent from the phone bar (it is on the desktop sidebar and linked from Home), which is reasonable at this width but easy to miss.
17. **The calendar is only partly a grid.** The month container is `role="grid"`, weekday names are `aria-hidden`, empty days are inert, and days with dues are buttons without `role="gridcell"` or row structure. Arrow-key grid navigation is not implemented. The accessible name on each day is good.
18. **Due-in-a-week text `#5E5E00` on a light surface is weak.** Dark mode uses `#F5FF2E`, which is louder but still a non-token one-off. Several due colors are duplicated later in `styles.css` and override each other.
19. **Account tiles omitted APR and minimum** until the detail sheet. The list did not show the three facts a payoff plan is built from (balance, APR, minimum) next to the due date.
20. **Avatar images interpolated the account initial into an inline `onerror` script.** A name whose first character broke out of that JavaScript string could run as script. The rest of the UI escapes HTML.

## P2 — code quality and performance

21. **One file owns UI, storage, and math.** `app.js` was about 1,500 lines with no payoff tests. `sync.js` exports a merge helper that also had no tests.
22. **Dead copies of `ago` and `activityHTML`.** An earlier pair was redefined later in the same scope, so the first versions never ran. Other unused pieces remain: the globe background, `homeFeedHTML`, and the space theme path. `defOpen` is `S.accounts.length <= 8 || true`, so account folders always start open.
23. **Balance history rebuilds the past by adding logged payments back onto today’s balance.** It ignores interest and ignores a manual balance edit, so the mountain chart can rise when the user only corrected a balance.
24. **The monthly model ignores the due day.** Every debt is assumed to be paid once this calendar month, on the first. Biweekly paychecks and a due date late in the month do not change the schedule.
25. **Pace tiers still raise that account’s floor** (aggressive / moderate / conservative) and roll the leftover when it is paid off. They apply inside every strategy, so a “minimums” comparison can still be above the stated minimum.
26. **No service worker** despite `manifest.webmanifest`. Repeat visits re-download the scripts. Charts are hand-rolled SVG, which is the right call for a no-build Pages site; they are not a charting library to add.
27. **Import and export already round-trip the whole state**, and unknown account fields are kept. That is the right migration hook. New settings must keep the same storage key.

## What a complete debt app was missing

Side-by-side snowball, avalanche, and custom plans (payoff date, total interest, interest saved). A month-by-month amortization schedule. A one-time windfall that hits only the first month. Extra monthly dollars that sit on top of minimums. Income, expenses, and free cash flow that can become the debt budget. Payment logging existed; it did not show principal versus interest on the projection. Export and import existed.

## Addressed in this change

- `engine.js` is the payoff engine, tested with `node --test` (`test/engine.test.js`). Interest is rounded to the cent. Snowball, avalanche, and custom re-sort every month after interest. Leftover, including a paid-off floor, rolls to the next debt. Windfall is month one only. A budget above the sum of floors raises the commitment; a budget below it does not cut minimums. The 600-month cap remains, and the Plan screen says when a debt is stuck or underwater.
- The closed form is tested with rounding off: $5,000 at 18% and $150/month is 47 months. Cent rounding is the path the app uses. Principal is conserved in the rounded tests (payments = principal + interest, ending balance 0).
- The Plan tab compares the three strategies, charts total interest, lists this month’s split, and shows up to 240 months of the schedule, filterable by account. Extra monthly, windfall, income, expenses, and “use free cash flow as the debt budget” are on that screen. Home what-if extra stays session-only.
- Existing saves stay on `debt-killer:v1`. A save that has no `accelerateFocus` flag keeps the old boost (the “Pay $X” amount does not silently collapse) until the user turns it off. A brand-new blank state defaults the boost off, which is classic minimums plus any extra. Demo data has no flag, so the demo stays boosted and matches the previous demo.
- Logged payments still reduce the stored balance by the full amount. The schedule states that. Copy on Home and Summary now describes payments and “versus last month,” not “debt reduced.”
- Erase can stay on this device (sign out without flushing, then delete the local key) or also push an empty cloud row. The storage note mentions cloud sync when it is configured.
- Avatars no longer inject initials into inline scripts. A skip link was added. The tab indicator uses the live tab count. Account tiles show APR and minimum.

## Addressed in the follow-up

- A Content-Security-Policy meta tag allows this origin, jsDelivr for supabase-js, and `https://*.supabase.co` / `wss://*.supabase.co` for sync. `script-src` has no `unsafe-inline`. The sidebar Settings button is a real button with a listener. `style-src` still allows inline styles because the page sets layout that way. A meta tag cannot set `frame-ancestors`; GitHub Pages does not offer response headers, so that limit stays.
- Magic-link sign-in uses PKCE (`flowType: 'pkce'`). The client exchanges `?code=` and keeps the code verifier in its own storage. A link that was already emailed under the old implicit flow (a `#access_token` fragment) will not complete; signing in again sends a new link. An existing session already stored in the browser keeps working.
- The calendar is a grid: weekday headers and day cells are rows, arrow keys move a roving tabindex, Home and End move within the week, Page Up and Page Down change month, and Enter or Space opens a day that has a payment due.
- “Due this week” text is `#3E3400` on white, on `#f4f2ee`, and on the chip `#FFF3B0`. Dark mode is `#F6E7A1` on `#121419`, on `#1B1E26`, and on the chip `#3A3418`. Each pair is at least 4.5:1 and locked by `test/a11y.test.js`. The earlier `#5E5E00` on white was already about 6.8:1; the new colors also cover the chip and dark mode, which were the weak pairs. Older `.due-week` rules remain in the file and lose to `.due.due-week`.
- Balance history walks each account from its starting balance through payments and manual edits. A legacy payment shows the interest that had accrued, then drops by the full payment, which is what that save already did. The series ends on the stored balance, so an old edit that was never written down does not leave a gap. “Check my balances” and editing an account record a balance change. Creating an account does not.
- Logged payments now store interest and principal. Interest between two dates uses the same monthly charge as the schedule, scaled by days / 30, so 30 days matches one month. The balance becomes balance + interest − payment. Payments saved before this change are marked legacy and annotated in place: interest + principal = the amount, and `account.balance` is not rewritten. Removing a new payment puts the interest back and the principal back. Removing a legacy payment still adds the full amount back, with the old cap. The in-memory version is 3. The storage key is still `debt-killer:v1`. A save is rewritten when it is missing the version, the accelerate-focus flag, numeric interest and principal, or the adjustments list.
- The schedule places each debt’s payment, and its payoff date, on its due day. No due day means the 1st. Day 31 in a short month clamps to the last day. Interest math and the month count are unchanged. Rows in a month are ordered by due day.
- `sw.js` precaches the static shell and serves it only when the network fails. A successful load replaces the cached copy. Activating a new worker deletes caches that are not `debt-slayer-shell-v3`. Other origins, including Supabase, are not intercepted. Navigations are stored under `index.html`, so a magic-link `?code=` is not kept as a cache key. Account data stays in localStorage.

## Still open

- Biweekly schedules. Pace tiers can still raise a floor inside every strategy, including the minimums comparison. The Plan screen says when the accelerate-focus boost is on.
- Duplicate `.due-week` rules earlier in `styles.css` are unused once `.due.due-week` matches. The globe background, `homeFeedHTML`, and the space theme path are still unused.

## Sync safety

`test/sync.test.js` covers `decideMerge` and the sync flow: first sign-in, two devices, a stale tab, erase, sign-out, demo suspension, v1–v3 migration, network retry, and clock skew. A push is compare-and-swap on the revision stored in `data._sync`, not last-write-wins on `updated_at`. Pulling keeps a local backup first. Erasing the cloud writes a tombstone and clears this device only after that write succeeds. The service worker cache is `debt-slayer-shell-v7` so the offline shell picks up `sync.js` and the screenshot parser. Row Level Security is unchanged; the assumptions are comments in `supabase/schema.sql` and the README.

## Update from a screenshot

`ocr.js` parses bank-app text (balance, APR, minimum, due date, credit limit, last payment, last four, lender) and matches it to an account. The review screen is the only way those values are saved. A balance change is an adjustment; a new last payment can be logged, and it does not subtract again when the screenshot balance is saved with it. Tesseract.js 5.1.1, its worker, the LSTM WebAssembly core, and English trained data live under `vendor/tesseract/` (Apache-2.0) and are fetched only when the feature is opened. `script-src` adds `'wasm-unsafe-eval'` so that compile can run. The worker is same-origin (`workerBlobURL: false`); `worker-src 'self'` was already set.
- Do not put a service-role key, or any other secret, in this repository.
