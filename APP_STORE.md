# Publish Clarity with user accounts

This branch adds email/password signup so anyone can create their own account. Tasks stay private to that account. Use this checklist to ship it to Railway, then the App Store.

Live API / privacy URLs (current production):

- App: `https://workspaceapi-server-production-2b2a.up.railway.app`
- Privacy: `https://workspaceapi-server-production-2b2a.up.railway.app/privacy`
- Terms: `https://workspaceapi-server-production-2b2a.up.railway.app/terms`

Bundle ID: `com.skyspeak.lockin`  
EAS project: `@skyspeak/lockin`  
Apple team (from earlier builds): `2T8UT7AXMD`

---

## 0. What this branch changes

- New `users` table (email + hashed password).
- `POST /api/auth/signup` and `POST /api/auth/login` return a 30-day JWT.
- Capture, tasks, and refine stay on the same Bearer header — the token is now a user JWT instead of the shared `API_SECRET`.
- The old `API_SECRET` still works as a Bearer token (your previous personal data).
- Web and iPhone show **Create account / Sign in**. Signup also asks for an **invite code**, which is the Railway `API_SECRET`.
- **Delete account** is in Settings (iPhone) and the account bar (web). Apple requires this.
- Privacy Policy and Terms are public pages (needed for App Store Connect).

Existing tasks from the old shared API key stay on that legacy identity. New signups start with an empty task list.

---

## 1. Merge this branch and deploy Railway

Do this **before** the App Store build. The phone app will call the production API to create accounts.

```bash
git checkout main
git merge feature/user-accounts
git push origin main
```

Railway should rebuild `@workspace/api-server` from `main`. Wait until `GET /api/healthz` returns `200`.

Optional: confirm signup is live:

```bash
curl -sS -X POST https://workspaceapi-server-production-2b2a.up.railway.app/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"at-least-8","inviteCode":"YOUR_API_SECRET"}'
```

You should get `{ "token": "...", "user": { "id": "...", "email": "..." } }`.

---

## 2. Railway environment variables

Keep everything you already have (`DATABASE_URL`, `API_SECRET`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `NODE_ENV=production`).

The invite code for signup **is** `API_SECRET`. Share that value only with people you want to let in. Signing in later only needs email and password.

| Variable | Required | What it does |
|---|---|---|
| `JWT_SECRET` | Optional | 32+ random characters to sign login tokens. If unset, `API_SECRET` is used. Setting a dedicated secret is better. |
| `CORS_ORIGIN` | If the web app is ever hosted on another domain | Comma-separated origins. Same-origin Railway web UI does not need this. |

The `users` table is created automatically on API boot (`CREATE TABLE IF NOT EXISTS users`). You do not need a manual `drizzle-kit push` unless you prefer to run it against `DATABASE_PUBLIC_URL`.

---

## 3. Apple Developer Program

1. Enroll at [developer.apple.com/programs](https://developer.apple.com/programs/) with the Apple ID you want as the seller ($99/year).
2. Wait for Apple to approve the enrollment (sometimes minutes, sometimes a couple of days).
3. In [App Store Connect](https://appstoreconnect.apple.com) → **Users and Access**, make sure this Apple ID is Admin or Account Holder.
4. Confirm the team id still matches `2T8UT7AXMD` (or update EAS with the new team if it does not).

You do **not** need Sign in with Apple. That is only required if you also offer Google/Facebook/etc. This app is email + password only.

---

## 4. Create the App Store Connect listing

1. App Store Connect → **My Apps** → **+** → **New App**.
2. Platform: iOS.
3. Name: **Clarity** (or another name if Clarity is taken — the name must be unique on the store).
4. Primary language: English.
5. Bundle ID: **com.skyspeak.lockin** (create the identifier in the Developer portal first if it is not listed).
6. SKU: `clarity` (internal; not shown to users).
7. User access: Full Access.

### App Information

- Privacy Policy URL: `https://workspaceapi-server-production-2b2a.up.railway.app/privacy`
- Category: **Productivity**
- Content Rights: you own the app.
- Age Rating: complete the questionnaire. Voice notes + user-generated tasks is usually **4+**. Answer honestly; do not claim you have no user-generated content.
- Encryption: **ITSAppUsesNonExemptEncryption = false** is already in `app.json` (HTTPS only). In the questionnaire choose the standard HTTPS exemption.

### Pricing

- Free, available in the countries you want.

### App Privacy (nutrition labels)

Declare:

- **Contact Info → Email Address** — used for Account.
- **User Content → Audio Data** — used for App Functionality. Not used for tracking. Linked to identity (the account). Not used for advertising.
- **User Content → Other User Content** (tasks) — App Functionality.

Do **not** check tracking. There is no ATT prompt in the app.

### Version / What’s New

Example: `Create your own Clarity account and keep tasks private.`

### Description (draft)

Clarity is a voice-first capture app. Open it, speak a thought, and tap to send. Clarity turns what you said into tasks with next steps, tagged for work, family, hobbies, or extracurriculars.

- Create an account with your email
- Speak to capture; tap to send
- Swipe tasks done or delete them
- Refine a task with a note or another voice clip

### Keywords

`voice,tasks,todo,notes,capture,reminders,productivity,dictate`

### Support URL

Use the same Railway site, or a page you control. Apple requires a working URL. Privacy URL can double as support if needed: the `/privacy` page includes a contact line.

### Screenshots (required)

You need iPhone screenshots **before** you can submit.

Minimum for a modern iPhone listing:

- **6.7" display** (iPhone 15 Pro Max / 16 Pro Max): at least one screenshot. Apple currently also wants **6.5" or 6.9"** depending on the form. App Store Connect will show exactly which sizes are missing.
- Take them from a real device or Simulator:
  - Speak screen listening
  - A task list with a few items
  - Settings (so reviewers see Delete account)

Tips: use a light home-screen-adjacent look, no debug banners, no TestFlight watermark.

### Review notes (paste this)

```
Clarity is a voice-first task app. New accounts require an invite code.
Please use the demo account below instead of creating a new one.

Demo account:
Email: [create this on production before submit]
Password: [strong password]

The mic permission is used only when the Speak tab is open, to capture a thought.
Account deletion is in Settings → Delete account.

Privacy policy: https://workspaceapi-server-production-2b2a.up.railway.app/privacy
```

Create that demo account on production **before** you submit, and do not delete it while the app is In Review.

---

## 5. Build and upload with EAS

From your Mac, Node 22, in the repo:

```bash
cd artifacts/clarity-mobile
npx eas-cli@latest whoami
npx eas-cli@latest build --platform ios --profile production
```

`eas.json` production already sets `EXPO_PUBLIC_API_URL` to the Railway API so store users never type a server URL.

When the build is **Finished** in expo.dev:

```bash
npx eas-cli@latest submit --platform ios --profile production
```

First submit will ask you to log in with the Apple ID, pick the team, and pick the App Store Connect app. EAS can store an App Store Connect API key so later submits are non-interactive.

If submit fails with “bundle version already used”, bump `ios.buildNumber` in `app.json` (production profile also has `autoIncrement: true`).

Wait for **Processing** in App Store Connect (10–60 minutes), then the build appears under that version.

---

## 6. Submit for review

1. Attach the processed build to the version.
2. Complete Export Compliance (HTTPS exemption).
3. Advertising Identifier: **No**.
4. Confirm you have a way to delete accounts (Settings → Delete account).
5. Add the demo account in Review Information.
6. **Add for Review** → **Submit**.

Typical first review: 24–48 hours. Apple may reject for:

- Missing privacy URL or a URL that does not load
- No way to delete the account
- Mic permission string that does not match usage (already set)
- Crashes on launch (usually the API URL is wrong or Railway is asleep — turn **sleep** off on the Railway service)
- “Sign in with Apple required” — only if you later add Google/Facebook login. Do not add those without Apple Sign In.

Fix, bump build number, rebuild, resubmit.

---

## 7. After it is Approved

- Release manually or automatically (you choose in the version page).
- Keep Railway Hobby **sleep off**.
- Watch Gemini/OpenRouter spend; every capture costs model usage.
- If you rotate `API_SECRET` or `JWT_SECRET`, everyone is signed out (JWTs become invalid if `JWT_SECRET` changes).

---

## 8. Play Store (optional, later)

Production EAS Android is set to `app-bundle` (required by Google Play). You still need a Google Play Developer account ($25 one-time), a store listing, and:

```bash
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest submit --platform android --profile production
```

---

## 9. Local smoke test before you submit

1. Railway deploy of this branch is live.
2. Web: open the Railway URL → Create account (email, password, invite code = `API_SECRET`) → speak → see a task.
3. Web: Delete account, confirm you are signed out and cannot log in.
4. iPhone TestFlight build from this branch → Create account → Speak auto-listens → send.
5. Settings → Privacy Policy opens. Settings → Delete account works.
6. A second account cannot see the first account’s tasks.
