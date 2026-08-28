import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  type AudioRecorder,
} from "expo-audio";

/** Always pass options into prepare so iOS recreates AVAudioRecorder after a real stop. */
export const RECORD_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export const MIN_RECORDING_MS = 350;
const URI_POLL_MS = 60;
const URI_POLL_ATTEMPTS = 6;

export function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function recorderIsLive(recorder: AudioRecorder): boolean {
  return recorder.getStatus().isRecording;
}

export function recordingDurationMillis(recorder: AudioRecorder): number {
  const status = recorder.getStatus();
  const fromStatus = status.durationMillis;
  const fromClock = Math.round((recorder.currentTime || 0) * 1000);
  return Math.max(fromStatus, fromClock);
}

export async function configureAudioForRecording() {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: "doNotMix",
  });
}

export async function releaseAudioSession() {
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    });
  } catch {
    // best-effort — another screen may reclaim the session
  }
}

export async function ensureMicPermission(): Promise<boolean> {
  const status = await AudioModule.requestRecordingPermissionsAsync();
  return status.granted;
}

/** Read the file URI after stop — expo-audio can populate `uri` or `getStatus().url`. */
export async function readRecordingUri(recorder: AudioRecorder): Promise<string | null> {
  for (let attempt = 0; attempt < URI_POLL_ATTEMPTS; attempt += 1) {
    if (recorder.uri) return recorder.uri;
    const url = recorder.getStatus().url;
    if (url) return url;
    if (attempt < URI_POLL_ATTEMPTS - 1) {
      await wait(URI_POLL_MS);
    }
  }
  return recorder.uri ?? recorder.getStatus().url;
}

/**
 * Stop an active recording and return the saved file URI.
 * Never call stop() on a prepared-but-idle recorder — that breaks iOS capture.
 */
export async function stopActiveRecording(recorder: AudioRecorder): Promise<{
  uri: string | null;
  durationMillis: number;
}> {
  const durationMillis = recordingDurationMillis(recorder);
  const status = recorder.getStatus();

  if (status.isRecording) {
    try {
      await recorder.stop();
    } catch {
      // already finalized
    }
    await wait(URI_POLL_MS);
  }

  return { uri: await readRecordingUri(recorder), durationMillis };
}

/**
 * Prepare a fresh file for the next take. Only stops a *live* recording first.
 */
export async function prepareFreshRecording(recorder: AudioRecorder): Promise<void> {
  if (recorderIsLive(recorder)) {
    await stopActiveRecording(recorder);
    await wait(60);
  }
  await recorder.prepareToRecordAsync(RECORD_OPTIONS);
}

/** Permission + session + prepare + record. Throws MIC_PERMISSION_DENIED on deny. */
export async function beginRecording(recorder: AudioRecorder): Promise<void> {
  if (!(await ensureMicPermission())) {
    throw new Error("MIC_PERMISSION_DENIED");
  }
  await configureAudioForRecording();
  await prepareFreshRecording(recorder);
  recorder.record();
  if (!recorderIsLive(recorder)) {
    throw new Error("RECORD_FAILED");
  }
}

export function mimeForRecordingUri(uri: string): { ext: string; mime: string } {
  const ext = uri.split(".").pop()?.toLowerCase() || "m4a";
  if (ext === "m4a" || ext === "mp4" || ext === "caf") {
    return { ext, mime: "audio/mp4" };
  }
  return { ext, mime: `audio/${ext}` };
}

export function recordingTooShort(durationMillis: number): boolean {
  // iOS sometimes reports 0 until after stop — don't block those clips here.
  return durationMillis > 0 && durationMillis < MIN_RECORDING_MS;
}

export async function uploadCaptureAudio(
  apiBase: string,
  apiKey: string,
  uri: string,
  mode: "tasks" | "transcribe",
): Promise<Response> {
  const form = new FormData();
  const { ext, mime } = mimeForRecordingUri(uri);
  // @ts-ignore — React Native FormData file upload
  form.append("audio", { uri, name: `audio.${ext}`, type: mime });

  return fetch(`${apiBase}/capture?mode=${mode}`, {
    method: "POST",
    body: form,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}
