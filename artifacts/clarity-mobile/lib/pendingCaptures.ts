import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { persistRecordingCopy, uploadCaptureAudio, uploadCaptureText } from "@/lib/recording";
import {
  isNetworkCaptureError,
  isRetryableCaptureStatus,
  retainPending,
} from "../../../lib/integrations/src/pendingQueue";

export { isNetworkCaptureError, isRetryableCaptureStatus };

const STORAGE_KEY = "lockin_pending_captures";
const MAX_PENDING = 20;

export type PendingCapture = {
  id: string;
  mode: "tasks" | "transcribe";
  createdAt: number;
  text?: string;
  audioUri?: string;
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribePendingCaptures(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function readAll(): Promise<PendingCapture[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingCapture[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(items: PendingCapture[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_PENDING)));
  emit();
}

export async function listPendingCaptures(): Promise<PendingCapture[]> {
  return readAll();
}

export async function rememberPendingCapture(input: {
  mode: "tasks" | "transcribe";
  text?: string;
  audioUri?: string;
}): Promise<void> {
  const text = input.text?.trim();
  let audioUri = input.audioUri?.trim();
  if (!text && !audioUri) return;

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (audioUri) {
    try {
      audioUri = await persistRecordingCopy(audioUri, id);
    } catch {
      // Keep the original URI; flush may still succeed if the temp file lives.
    }
  }

  const current = await readAll();
  const next: PendingCapture = {
    id,
    mode: input.mode,
    createdAt: Date.now(),
    text: text || undefined,
    audioUri: audioUri || undefined,
  };
  await writeAll([next, ...current]);
}

export function pendingCaptureLabel(item: PendingCapture): string {
  if (item.text?.trim()) return item.text.trim();
  return "Voice note saved on this phone";
}

async function dropMissingAudio(item: PendingCapture): Promise<boolean> {
  if (!item.audioUri || item.text) return false;
  try {
    const info = await FileSystem.getInfoAsync(item.audioUri);
    return !info.exists;
  } catch {
    return true;
  }
}

let flushing: Promise<number> | null = null;

export function flushPendingCaptures(apiBase: string, apiKey: string): Promise<number> {
  if (!apiKey.trim()) return Promise.resolve(0);
  if (flushing) return flushing;
  flushing = sendPending(apiBase, apiKey).finally(() => {
    flushing = null;
  });
  return flushing;
}

async function sendPending(apiBase: string, apiKey: string): Promise<number> {
  let total = 0;

  for (let pass = 0; pass < 3; pass += 1) {
    const items = await readAll();
    if (items.length === 0) break;
    const sentIds = new Set<string>();
    const dropIds = new Set<string>();
    let sent = 0;

    for (const item of [...items].reverse()) {
      try {
        if (await dropMissingAudio(item)) {
          dropIds.add(item.id);
          continue;
        }
        let res: Response;
        if (item.text) {
          res = await uploadCaptureText(apiBase, apiKey, item.text, item.mode);
        } else if (item.audioUri) {
          res = await uploadCaptureAudio(apiBase, apiKey, item.audioUri, item.mode);
        } else {
          dropIds.add(item.id);
          continue;
        }
        if (res.ok) {
          sent += 1;
          sentIds.add(item.id);
          continue;
        }
        if (!isRetryableCaptureStatus(res.status)) dropIds.add(item.id);
      } catch {
        // Keep the note and try on a later flush.
      }
    }

    const latest = await readAll();
    const next = retainPending(latest, sentIds, dropIds);
    await writeAll(next);
    total += sent;
    const seen = new Set(items.map((item) => item.id));
    if (!next.some((item) => !seen.has(item.id))) break;
  }

  return total;
}

export function usePendingCaptureList(): PendingCapture[] {
  const [pending, setPending] = useState<PendingCapture[]>([]);
  const refresh = useCallback(() => {
    void listPendingCaptures().then(setPending);
  }, []);

  useEffect(() => {
    refresh();
    return subscribePendingCaptures(refresh);
  }, [refresh]);

  return pending;
}
