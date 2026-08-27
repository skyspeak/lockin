import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { db, googleOAuthTable } from "@workspace/db";
import { logger } from "./logger";

const OPERATOR_ID = "operator";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function digestEmail(): string {
  return (process.env.DIGEST_EMAIL || "stuymusty@gmail.com").trim().toLowerCase();
}

export function publicOrigin(): string {
  return (
    process.env.PUBLIC_ORIGIN ||
    process.env.GOOGLE_REDIRECT_ORIGIN ||
    "https://workspaceapi-server-production-2b2a.up.railway.app"
  ).replace(/\/+$/, "");
}

export function googleRedirectUri(): string {
  return (process.env.GOOGLE_REDIRECT_URI || `${publicOrigin()}/api/google/callback`).trim();
}

function clientId(): string {
  return process.env.GOOGLE_CLIENT_ID?.trim() || "";
}

function clientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
}

export function googleConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

function oauthClient() {
  if (!googleConfigured()) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set.");
  }
  return new google.auth.OAuth2(clientId(), clientSecret(), googleRedirectUri());
}

export function signGoogleState(): string {
  const secret = process.env.API_SECRET || "";
  const payload = Date.now().toString();
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyGoogleState(state: string): boolean {
  const secret = process.env.API_SECRET || "";
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (expected.length !== sig.length) return false;
  const ageMs = Date.now() - Number(payload);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 15 * 60 * 1000) return false;
  try {
    return createHmac("sha256", secret).update(payload).digest("hex") === sig;
  } catch {
    return false;
  }
}

export function googleAuthUrl(): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: signGoogleState(),
  });
}

export async function saveGoogleTokens(code: string): Promise<string> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token. Disconnect the app in Google Account permissions and try again.");
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const me = await oauth2.userinfo.get();
  const email = me.data.email || digestEmail();

  const existing = await db.select({ id: googleOAuthTable.id }).from(googleOAuthTable).where(eq(googleOAuthTable.id, OPERATOR_ID)).limit(1);
  if (existing.length > 0) {
    await db
      .update(googleOAuthTable)
      .set({ email, refreshToken: tokens.refresh_token, updatedAt: new Date() })
      .where(eq(googleOAuthTable.id, OPERATOR_ID));
  } else {
    await db.insert(googleOAuthTable).values({
      id: OPERATOR_ID,
      email,
      refreshToken: tokens.refresh_token,
    });
  }
  return email;
}

async function authorizedClient() {
  const [row] = await db.select().from(googleOAuthTable).where(eq(googleOAuthTable.id, OPERATOR_ID)).limit(1);
  if (!row) return null;
  const client = oauthClient();
  client.setCredentials({ refresh_token: row.refreshToken });
  return { client, email: row.email };
}

export async function googleStatus(): Promise<{ connected: boolean; email: string | null; configured: boolean }> {
  if (!googleConfigured()) {
    return { connected: false, email: null, configured: false };
  }
  const auth = await authorizedClient();
  return { connected: Boolean(auth), email: auth?.email ?? null, configured: true };
}

export async function sendGmail(
  to: string | string[],
  subject: string,
  body: string,
): Promise<boolean> {
  const auth = await authorizedClient();
  if (!auth) {
    logger.warn("gmail send skipped: Google is not connected");
    return false;
  }
  const recipients = (Array.isArray(to) ? to : [to])
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes("@"));
  if (recipients.length === 0) {
    logger.warn("gmail send skipped: no recipients");
    return false;
  }
  const gmail = google.gmail({ version: "v1", auth: auth.client });
  const raw = Buffer.from(
    `To: ${recipients.join(", ")}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return true;
}

export type CalendarEventInput = {
  title: string;
  start: string;
  durationMinutes?: number;
  attendeeEmails?: string[];
};

export async function createCalendarEvents(events: CalendarEventInput[]): Promise<{ created: number; error?: string }> {
  if (events.length === 0) return { created: 0 };
  const auth = await authorizedClient();
  if (!auth) {
    return { created: 0, error: "Google Calendar is not connected." };
  }
  const calendar = google.calendar({ version: "v3", auth: auth.client });
  let created = 0;
  let lastError = "";
  for (const event of events) {
    const start = new Date(event.start);
    if (Number.isNaN(start.getTime())) {
      lastError = `Invalid start time: ${event.start}`;
      continue;
    }
    const minutes = event.durationMinutes && event.durationMinutes > 0 ? event.durationMinutes : 60;
    const end = new Date(start.getTime() + minutes * 60 * 1000);
    const attendees = (event.attendeeEmails ?? [])
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.includes("@"))
      .map((email) => ({ email }));
    try {
      await calendar.events.insert({
        calendarId: "primary",
        sendUpdates: attendees.length > 0 ? "all" : "none",
        requestBody: {
          summary: event.title,
          start: { dateTime: start.toISOString(), timeZone: "America/Los_Angeles" },
          end: { dateTime: end.toISOString(), timeZone: "America/Los_Angeles" },
          attendees: attendees.length > 0 ? attendees : undefined,
        },
      });
      created += 1;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Calendar insert failed";
      logger.warn({ err: lastError, title: event.title }, "calendar insert failed");
    }
  }
  return { created, error: created === 0 ? lastError || undefined : undefined };
}
