# Connect Gmail to Lock In

Lock In sends your 9pm PT task list and creates calendar events through **one** Google account: `stuymusty@gmail.com`. You do this once. You cannot paste a Gmail password into the app.

Production origin: `https://workspaceapi-server-production-2b2a.up.railway.app`

## 1. Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (name it `lock-in`).
3. APIs & Services → Library → enable **Gmail API** and **Google Calendar API**.

## 2. OAuth consent screen

1. APIs & Services → OAuth consent screen.
2. User type: **External** → Create.
3. App name: `Lock In`. User support email: `stuymusty@gmail.com`.
4. Scopes → Add:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/userinfo.email`
5. Test users → Add `stuymusty@gmail.com`.
6. Save.

Until the app is published on Google’s OAuth screen, only test users can connect.

## 3. OAuth client

1. APIs & Services → Credentials → Create credentials → **OAuth client ID**.
2. Application type: **Web application**.
3. Authorized redirect URIs, add exactly:
   `https://workspaceapi-server-production-2b2a.up.railway.app/api/google/callback`
4. Create. Copy **Client ID** and **Client secret**.

## 4. Railway variables

On the API service, set:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the client id |
| `GOOGLE_CLIENT_SECRET` | the client secret |
| `DIGEST_EMAIL` | `stuymusty@gmail.com` |
| `PUBLIC_ORIGIN` | `https://workspaceapi-server-production-2b2a.up.railway.app` |

Redeploy after saving.

## 5. Sign in as that Gmail in Lock In

Create a Lock In account with **`stuymusty@gmail.com`** (invite code = your `API_SECRET`). The 9pm email looks up tasks for that account.

## 6. Connect

On the web app (same origin as the API), sign in, then click **Connect Gmail** in the account bar. Google will ask you to allow Lock In. When you land back on the site, the bar should say Gmail is connected.

If Google does not return a refresh token, open [Google Account → Third-party access](https://myaccount.google.com/connections), remove Lock In, and connect again.

## 7. Test the digest

```bash
curl -sS -X POST https://workspaceapi-server-production-2b2a.up.railway.app/api/cron/digest \
  -H "Authorization: Bearer $API_SECRET"
```

You should get `{ "sent": true, "count": N }` and an email. The same job runs by itself at **9:00pm America/Los_Angeles** every day.

## 8. Calendar from voice

Stay in **Tasks** mode (not Transcribe). Say something with a time, for example: “Meet Alex Friday at 3pm.” Lock In still makes a task, and also puts an event on this Gmail calendar. If you speak someone’s email, they get a calendar invite.
