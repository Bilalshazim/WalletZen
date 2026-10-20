# WalletZen

Personal cashbook PWA — accounts, income/expense heads, subscriptions & utility bills, Commattie tracker and a bulk screenshot scanner.
React + Vite + Tailwind + Recharts, with Firebase (Auth + Firestore) or a local-only fallback.

## Run locally

```bash
npm install
npm run dev        # opens http://localhost:5180/WalletZen/
```

Without Firebase keys the app runs in **guest mode**: data lives in this browser's localStorage.

## Guest mode & sign-in

Everyone starts as a **Guest**: the app works fully with data in this browser's localStorage, and the header shows
**Guest Mode (Sync Disabled)**. Cloud features (currently the screenshot scanner) open a **Login to Unlock Cloud Sync**
sheet for guests. Sign-in options: **Google**, **email link** (passwordless — Firebase Auth has no email OTP codes) and
**Pakistani mobile OTP** (+92, invisible reCAPTCHA, 60 s resend timer).

On sign-in, all guest accounts, transactions, bills and Commatties are **moved into the Firestore account automatically**
(same record ids, so a retried migration never duplicates) and removed from the device only after the upload succeeded.
Device preferences (theme, USD/EUR rates) stay on the device. Builds without Firebase keys stay in guest mode with every
feature available.

## Quick Lock (PIN / pattern + Face ID / fingerprint)

After the first sign-in (Google, email link or mobile OTP) users are offered **Set Quick Lock**: a 4-digit PIN or a
3×3 pattern, plus an optional **Face ID / Touch ID / fingerprint / Windows Hello** switch (WebAuthn platform
authenticator). It can also be set up, changed or turned off any time in **Settings → Quick Lock** (guests included).

- On launch, and when returning after **30 s in the background**, the app shows only the lock screen; biometrics are
  prompted automatically (iOS may need one tap), with **Use 4-Digit PIN / Pattern** and **Login with Account
  Credentials** (signed-in users — signs out and lets you set a new lock) as fallbacks.
- The PIN/pattern is never stored — only a salted PBKDF2-SHA-256 hash per user. Every 5 wrong tries pause input for
  30 s (doubling), and the pause survives reloads.
- This is an **app lock**, not encryption: it keeps people who pick up your unlocked phone out of WalletZen, but data in
  browser storage is not encrypted by the PIN. Biometric checks run on-device (no server verification).

## Enable Firebase sync

1. Create a Firebase project, add a Web app, and create **Firestore**.
2. **Authentication → Sign-in method**: enable **Google**, **Email/Password → Email link (passwordless sign-in)** and
   **Phone**. Phone SMS is billed by Google (the Blaze plan may be required); for development add test numbers there.
3. Put the web config in `.env.local` (`VITE_FIREBASE_*`, see `.env.example`) and restart `npm run dev`.
4. Publish `firestore.rules` (Firestore → Rules) so each user can only access `users/{uid}/…`.
5. **Authentication → Settings → Authorized domains**: add `localhost` and `<your-username>.github.io` (needed for Google
   popups, email links and reCAPTCHA).

Firestore runs with a persistent offline cache, so entries made offline sync when you reconnect.

## Screenshot scanner (Claude, via the backend)

Activity → **Scan screenshots & receipts** reads 1–50 bank/wallet screenshots or receipts at once and extracts the
institution, amount, debit/credit, date and remaining balance. Everything lands in a review modal first: edit any field,
untick duplicates (auto-detected), and choose whether to sync each account to the balance shown on its latest screenshot.

Images are downscaled on-device and sent, 6 per request, to the `scanScreenshots` Cloud Function, which checks the user
is signed in and asks Claude (`claude-opus-5-5`) to read them. The Anthropic key never ships in the website bundle.

## Backend (Firebase Cloud Functions)

User data and login already run on Firebase (Firestore + Auth). The `functions/` folder adds server code for things
that need a secret key. One-time setup:

1. Upgrade the Firebase project to the **Blaze** plan (Firebase Console → ⚙ → Usage and billing). It has a free monthly
   allowance; set a budget alert.
2. Install the CLI and log in: `npm install -g firebase-tools` then `firebase login`.
3. Store the Anthropic key (from https://console.anthropic.com/settings/keys) as a secret:
   `firebase functions:secrets:set ANTHROPIC_API_KEY`
4. Deploy: `cd functions && npm install && cd .. && firebase deploy --only functions`

Logs: `firebase functions:log`. The project id is in `.firebaserc`.

## Bills & subscriptions

Planner → **Bills & subscriptions** manages digital subscriptions (PKR, USD or EUR, monthly/yearly), utility bills and other
bills. **Pay & Sync Balance** logs the expense, debits the linked wallet and schedules the next cycle in one atomic write.
USD and EUR amounts convert to PKR at the rates set in Settings (gear icon). Items due within 3 days pop up once a day on open.

### Utility auto-fetch (live electricity bills)

Planner → Add → **Utility bill**: pick the biller, enter the **Reference no.** (14 digits + U/R) or **Customer ID**
(11 digits) and tap **Fetch Latest Bill**. For electricity companies (LESCO, FESCO, IESCO, GEPCO, MEPCO, PESCO, HESCO,
QESCO, SEPCO, TESCO) the app shows the real bill from the official PITC web bill: amount payable, due date, late amount,
paid / unpaid (with amount and date paid), units, the meter owner's name, father/husband name, address, meter no.,
tariff and sub-division, and the previous 12 months. Unpaid bills are added to *Upcoming*, and **Pay & Deduct from
Wallet** pays them. Gas (SNGPL), PTCL and internet still use demo figures (tagged **Demo**) or a manual amount.

Pending utility bills are re-polled on app open (at most every 12 h per bill) and via **Refresh** on the Utilities tab.

**The WalletZen API (Cloudflare Worker, free).** `worker/` is a small backend: `POST /bills/inquiry` checks the user's
Firebase sign-in, submits the PITC search form, reads the bill page and returns JSON (contract in
`src/services/billAggregatorApi.js`). One-time setup:

1. Create a free account at https://dash.cloudflare.com/sign-up (no card needed).
2. `cd worker && npm install && npx wrangler login && npx wrangler deploy`
3. Copy the printed `https://walletzen-api.<you>.workers.dev` URL into `VITE_BILL_API_URL` (`.env` for local dev, and
   the deploy workflow for GitHub Pages), then rebuild.

Allowed site origins are set in `worker/wrangler.toml` (`ALLOWED_ORIGINS`). Logs: `npx wrangler tail`.

## Bank & wallet icons

`getAccountIcon(name)` in `src/utils/accountIcons.js` maps free-text names ("HBL", "Habib Bank Limited", "Meezan Current",
"Easypaisa", "Cash in Hand"…) to an institution with its brand color. Account cards, transaction history and the scanner
review show the institution's own website logo, falling back to a brand-colored initials badge (offline or no logo) and to
a generic bank building for unknown names. Add a bank by adding one entry to `INSTITUTIONS`.

## Deploy to GitHub Pages

1. Set `homepage` in `package.json` to `https://<your-username>.github.io/WalletZen/`.
2. If the repo isn't named `WalletZen`, build with `VITE_BASE=/<repo-name>/` (see `vite.config.js`).
3. `npm run deploy` — builds and pushes `dist/` to the `gh-pages` branch.
4. In the repo settings, set **Pages → Source** to the `gh-pages` branch.

## Structure

```
src/
  components/
    common/        Button, Modal, Card, GlassContainer, IconCircle, SegmentedControl, BrandLogo, ThemeToggle, LogoBadge, AccountIcon,
                   FormField, EmptyState, Toast, BottomNav, AuthScreen, SettingsModal
    dashboard/     Header, NetWorthSummary, CashFlowChart, SpendingDonut
    accounts/      AccountCard, AddAccountModal, AccountList
    transactions/  TransactionForm, TransactionHistory, CategoryBadge
    planner/       SubscriptionsPlanner, CommattieTracker, UpcomingExpenses, BillFormModal, BrandIcon,
                   DueReminderModal, CommitteeFormModal, StatusTag
    scanner/       BulkScreenshotScanner, TransactionPreviewModal
  context/         AuthContext, FinanceContext, ThemeContext, SettingsContext
  services/        firebase.js, storageService.js, screenshotScanApi.js, billAggregatorApi.js
  utils/           constants.js, formatters.js, analytics.js, accountIcons.js
```

Every balance-changing action (transactions, Mark as Paid, Commattie installments/payouts) is committed
as one atomic batch, so a transaction and its account balance can never drift apart.

## Branding & themes

The app follows the system light/dark setting, with a System → Light → Dark toggle in the header.
Theme colors live as CSS variables in `src/index.css` (`--ink`, `--surface`, `--accent`, glass tokens).

Logo sources are in `brand/` (light and dark artwork). After replacing one, run `npm run icons` to rebuild
the transparent in-app logos (`public/brand/`), theme-aware favicons and the PWA/Apple install icons.
