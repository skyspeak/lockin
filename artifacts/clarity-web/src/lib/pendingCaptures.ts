import { isRetryableCaptureStatus, retainPending } from "../../../../lib/integrations/src/pendingQueue";

export { isRetryableCaptureStatus };

const STORAGE_KEY = "lockin_pending_captures";
const DB_NAME = "lockin-pending";
const STORE = "audio";
const MAX_PENDING = 20;

export type PendingCapture = {
  id: string;
  mode: "tasks" | "transcribe";
  createdAt: number;
  text?: string;
  hasAudio?: boolean;
  mime?: string;
  filename?: string;
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribePendingCaptures(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readAll(): PendingCapture[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingCapture[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: PendingCapture[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_PENDING)));
  emit();
}

export function listPendingCaptures(): PendingCapture[] {
  return readAll();
}

export function pendingCaptureLabel(item: PendingCapture): string {
  if (item.text?.trim()) return item.text.trim();
  return "Voice note saved in this browser";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putAudio(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function takeAudio(id: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

async function deleteAudio(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function rememberPendingText(mode: "tasks" | "transcribe", text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const item: PendingCapture = {
    id: nextId(),
    mode,
    createdAt: Date.now(),
    text: trimmed,
  };
  writeAll([item, ...readAll()]);
}

export async function rememberPendingAudio(
  mode: "tasks" | "transcribe",
  blob: Blob,
  filename: string,
): Promise<void> {
  if (blob.size < 8) return;
  const item: PendingCapture = {
    id: nextId(),
    mode,
    createdAt: Date.now(),
    hasAudio: true,
    mime: blob.type || "audio/webm",
    filename,
  };
  await putAudio(item.id, blob);
  writeAll([item, ...readAll()]);
}

let flushing: Promise<number> | null = null;

export function flushPendingCaptures(apiKey: string, captureUrl: (mode: string) => string): Promise<number> {
  if (!apiKey.trim()) return Promise.resolve(0);
  if (flushing) return flushing;
  flushing = sendPending(apiKey, captureUrl).finally(() => {
    flushing = null;
  });
  return flushing;
}

async function sendPending(apiKey: string, captureUrl: (mode: string) => string): Promise<number> {
  let total = 0;

  for (let pass = 0; pass < 3; pass += 1) {
    const items = readAll();
    if (items.length === 0) break;
    const sentIds = new Set<string>();
    const dropIds = new Set<string>();
    let sent = 0;

    for (const item of [...items].reverse()) {
      try {
        let res: Response;
        if (item.text) {
          res = await fetch(captureUrl(item.mode), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: item.text }),
          });
        } else if (item.hasAudio) {
          const blob = await takeAudio(item.id);
          if (!blob) {
            dropIds.add(item.id);
            continue;
          }
          const form = new FormData();
          form.append("audio", blob, item.filename || "audio.webm");
          res = await fetch(captureUrl(item.mode), {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${apiKey}` },
          });
        } else {
          dropIds.add(item.id);
          continue;
        }
        if (res.ok) {
          sent += 1;
          sentIds.add(item.id);
          if (item.hasAudio) await deleteAudio(item.id).catch(() => {});
          continue;
        }
        if (!isRetryableCaptureStatus(res.status)) {
          dropIds.add(item.id);
          if (item.hasAudio) await deleteAudio(item.id).catch(() => {});
        }
      } catch {
        // Keep the note and try on a later flush.
      }
    }

    const next = retainPending(readAll(), sentIds, dropIds);
    writeAll(next);
    total += sent;
    const seen = new Set(items.map((item) => item.id));
    if (!next.some((item) => !seen.has(item.id))) break;
  }

  return total;
}
