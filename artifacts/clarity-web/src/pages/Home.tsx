import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetActionQueue,
  useUpdateAction,
  useDeleteAction,
  getGetActionQueueUrl,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useApiKey } from "@/lib/auth-context";
import { VoiceCaptureButton } from "@/components/VoiceCaptureButton";
import { TaskPanel, type TaskItem } from "@/components/TaskPanel";

export default function Home() {
  const apiKey = useApiKey();
  const qc = useQueryClient();
  const queueKey = getGetActionQueueUrl();
  const { data, isLoading } = useGetActionQueue();
  const updateAction = useUpdateAction();
  const deleteAction = useDeleteAction();
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [draft, setDraft] = useState("");
  const [captureMode, setCaptureModeState] = useState<"tasks" | "transcribe">(() => {
    const stored = localStorage.getItem("lockin_capture_mode");
    return stored === "transcribe" ? "transcribe" : "tasks";
  });
  const captureModeRef = useRef(captureMode);
  captureModeRef.current = captureMode;
  const [refiningId, setRefiningId] = useState<number | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const captureSession = useRef<{ discard: boolean } | null>(null);
  const chunks = useRef<Blob[]>([]);
  const refineRecorder = useRef<MediaRecorder | null>(null);
  const refineChunks = useRef<Blob[]>([]);
  const mountedRef = useRef(true);
  const recordingRef = useRef(false);
  const transcribingRef = useRef(false);
  const apiKeyRef = useRef(apiKey);
  const toastRef = useRef(toast);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const levelRaf = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  apiKeyRef.current = apiKey;
  toastRef.current = toast;

  const stopLevelMeter = useCallback(() => {
    if (levelRaf.current != null) cancelAnimationFrame(levelRaf.current);
    levelRaf.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
    setVoiceLevel(0);
  }, []);

  const startLevelMeter = useCallback(
    (stream: MediaStream) => {
      stopLevelMeter();
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let last = 0;
      let lastTs = 0;
      const tick = (ts: number) => {
        levelRaf.current = requestAnimationFrame(tick);
        if (ts - lastTs < 100) return;
        lastTs = ts;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const next = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
        if (Math.abs(next - last) < 0.04) return;
        last = next;
        setVoiceLevel(next);
      };
      levelRaf.current = requestAnimationFrame(tick);
    },
    [stopLevelMeter],
  );

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: [queueKey] });
  }, [qc, queueKey]);
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

  const startRecordingRef = useRef<() => Promise<void>>(async () => {});

  const startRecording = useCallback(async () => {
    if (recordingRef.current || transcribingRef.current || !mountedRef.current) return;
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      try {
        if (captureSession.current) captureSession.current.discard = true;
        mediaRecorder.current.stop();
      } catch {
        // ignore
      }
      mediaRecorder.current = null;
    }
    recordingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || transcribingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        recordingRef.current = false;
        return;
      }
      const mr = new MediaRecorder(stream);
      const session = { discard: false };
      captureSession.current = session;
      chunks.current = [];
      startLevelMeter(stream);
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (mediaRecorder.current === mr) mediaRecorder.current = null;
        recordingRef.current = false;
        setIsRecording(false);
        stopLevelMeter();
        if (session.discard || !mountedRef.current) return;

        transcribingRef.current = true;
        setIsTranscribing(true);
        const blobType = mr.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type: blobType });
        try {
          const form = new FormData();
          const filename = blobType.includes("mp4") || blobType.includes("m4a") ? "audio.m4a" : "audio.webm";
          form.append("audio", blob, filename);
          const mode = captureModeRef.current;
          const res = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/capture?mode=${mode}`, {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${apiKeyRef.current}` },
          });
          if (!res.ok) {
            let detail = mode === "transcribe" ? "Couldn't transcribe that" : "Couldn't turn that into tasks";
            try {
              const body = (await res.json()) as { error?: string };
              if (body.error) detail = body.error;
            } catch {
              detail = `Server returned ${res.status}`;
            }
            toastRef.current({ title: detail, variant: "destructive" });
            return;
          }
          const json = (await res.json()) as {
            transcript?: string;
            actions?: { title: string; nextSteps?: string[] }[];
            calendarCreated?: number;
            calendarError?: string;
            emails?: Array<{ title: string; subject: string; to: string[]; sent: boolean; error?: string }>;
            research?: Array<{ title: string; type?: string; answer: string }>;
          };
          const items = (json.actions ?? [])
            .map((a) => ({ title: a.title, nextSteps: a.nextSteps ?? [] }))
            .filter((a) => a.title);
          const text = json.transcript?.trim() || "";
          if (mode === "transcribe") {
            if (!text && items.length === 0) {
              toastRef.current({ title: "Nothing captured", description: "Try speaking again." });
              return;
            }
            invalidateRef.current();
            toastRef.current({ title: "Saved" });
            return;
          }
          if (items.length === 0) {
            toastRef.current({ title: "Nothing captured", description: "Try speaking again." });
            return;
          }
          invalidateRef.current();

          const sentEmails = (json.emails ?? []).filter((e) => e.sent);
          const blockedEmails = (json.emails ?? []).filter((e) => !e.sent);
          const researchBits = json.research ?? [];

          if (researchBits.length > 0) {
            toastRef.current({
              title: researchBits.length === 1 ? "Research ready" : "Research locked in",
              description: researchBits.map((r) => r.answer.slice(0, 180)).join(" · "),
            });
          } else if (sentEmails.length > 0) {
            toastRef.current({
              title: sentEmails.length === 1 ? "Email sent" : "Emails sent",
              description: sentEmails.map((e) => `${e.subject} → ${e.to.join(", ")}`).join(" · "),
            });
          } else if (blockedEmails.length > 0) {
            toastRef.current({
              title: "Draft saved",
              description: blockedEmails[0]?.error || "Need a recipient email before sending.",
            });
          } else {
            toastRef.current({
              title: items.length === 1 ? "Solve map ready" : `${items.length} items locked in`,
              description: items.map((item) => item.title).join(" · "),
            });
          }
          if (json.calendarCreated && json.calendarCreated > 0) {
            toastRef.current({
              title: json.calendarCreated === 1 ? "Event added to calendar" : `${json.calendarCreated} events added`,
            });
          } else if (json.calendarError) {
            toastRef.current({
              title: "Task saved",
              description: "Calendar invite did not send. Connect Gmail first.",
            });
          }
        } catch {
          toastRef.current({ title: "Couldn't turn that into tasks", variant: "destructive" });
        } finally {
          transcribingRef.current = false;
          setIsTranscribing(false);
        }
      };
      mr.start();
      mediaRecorder.current = mr;
      setIsRecording(true);
    } catch {
      recordingRef.current = false;
      setIsRecording(false);
      stopLevelMeter();
      toastRef.current({
        title: "Microphone blocked",
        description: "Allow microphone access, then tap the button to start listening.",
        variant: "destructive",
      });
    }
  }, [startLevelMeter, stopLevelMeter]);
  startRecordingRef.current = startRecording;

  const stopOnly = useCallback(() => {
    if (!recordingRef.current && !(mediaRecorder.current && mediaRecorder.current.state !== "inactive")) return;
    if (captureSession.current) captureSession.current.discard = true;
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      try {
        mediaRecorder.current.stop();
      } catch {
        // ignore
      }
    }
    recordingRef.current = false;
    setIsRecording(false);
  }, []);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    if (captureSession.current) captureSession.current.discard = false;
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      try {
        mediaRecorder.current.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  const onMic = () => {
    if (isTranscribing) return;
    if (isRecording) stopRecording();
    else void startRecording();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopLevelMeter();
      if (captureSession.current) captureSession.current.discard = true;
      if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
        try {
          mediaRecorder.current.stop();
        } catch {
          // ignore
        }
      }
      mediaRecorder.current = null;
      recordingRef.current = false;
    };
  }, [stopLevelMeter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (isTranscribing) return;
      onMic();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRecording, isTranscribing]);

  const queue = (data?.queue ?? []) as TaskItem[];

  const complete = async (id: number) => {
    await updateAction.mutateAsync({ id, data: { status: "done" } });
    invalidate();
  };
  const remove = async (id: number) => {
    await deleteAction.mutateAsync({ id });
    invalidate();
  };

  const sendRefine = useCallback(
    async (id: number, blob: Blob) => {
      setIsRefining(true);
      try {
        const form = new FormData();
        const blobType = blob.type || "audio/webm";
        const filename = blobType.includes("mp4") || blobType.includes("m4a") ? "audio.m4a" : "audio.webm";
        form.append("audio", blob, filename);
        const res = await fetch(`/api/actions/${id}/refine`, {
          method: "POST",
          body: form,
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) {
          let detail = "Couldn't refine that";
          try {
            const body = (await res.json()) as { error?: string };
            if (body.error) detail = body.error;
          } catch {
            detail = `Server returned ${res.status}`;
          }
          toast({ title: detail, variant: "destructive" });
          return;
        }
        invalidate();
        toast({ title: "Task refined" });
        setNotes((current) => ({ ...current, [id]: "" }));
      } catch {
        toast({ title: "Couldn't refine that", variant: "destructive" });
      } finally {
        setIsRefining(false);
        setRefiningId(null);
      }
    },
    [apiKey, invalidate, toast],
  );

  const onRefineText = useCallback(
    async (id: number, note: string) => {
      const trimmed = note.trim();
      if (!trimmed) {
        toast({ title: "Add a note", description: "Type how you want this task refined." });
        return;
      }
      if (isRefining) return;
      setIsRefining(true);
      try {
        const res = await fetch(`/api/actions/${id}/refine`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ note: trimmed }),
        });
        if (!res.ok) {
          let detail = "Couldn't refine that";
          try {
            const body = (await res.json()) as { error?: string };
            if (body.error) detail = body.error;
          } catch {
            detail = `Server returned ${res.status}`;
          }
          toast({ title: detail, variant: "destructive" });
          return;
        }
        setNotes((current) => ({ ...current, [id]: "" }));
        invalidate();
        toast({ title: "Task refined" });
      } catch {
        toast({ title: "Couldn't refine that", variant: "destructive" });
      } finally {
        setIsRefining(false);
      }
    },
    [apiKey, invalidate, isRefining, toast],
  );

  const onRefineVoice = useCallback(
    async (id: number) => {
      if (isRefining) return;
      if (refiningId === id) {
        refineRecorder.current?.stop();
        return;
      }
      stopOnly();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        refineChunks.current = [];
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) refineChunks.current.push(e.data);
        };
        mr.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(refineChunks.current, { type: mr.mimeType || "audio/webm" });
          await sendRefine(id, blob);
        };
        mr.start();
        refineRecorder.current = mr;
        setRefiningId(id);
      } catch {
        toast({
          title: "Microphone blocked",
          description: "Allow microphone access to refine a task.",
          variant: "destructive",
        });
      }
    },
    [isRefining, refiningId, sendRefine, stopOnly, toast],
  );

  const submitTyped = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isTranscribing) return;
    stopOnly();
    transcribingRef.current = true;
    setIsTranscribing(true);
    try {
      const mode = captureModeRef.current;
      const res = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/capture?mode=${mode}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKeyRef.current}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        let detail = mode === "transcribe" ? "Couldn't save that note" : "Couldn't turn that into a task";
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) detail = body.error;
        } catch {
          detail = `Server returned ${res.status}`;
        }
        toast({ title: detail, variant: "destructive" });
        return;
      }
      const json = (await res.json()) as {
        actions?: { title: string }[];
        calendarCreated?: number;
        calendarError?: string;
        emails?: Array<{ title: string; subject: string; to: string[]; sent: boolean; error?: string }>;
        research?: Array<{ title: string; type?: string; answer: string }>;
      };
      const items = (json.actions ?? []).filter((a) => a.title);
      if (mode !== "transcribe" && items.length === 0) {
        toast({ title: "Nothing captured", description: "Try a more specific to-do." });
        return;
      }
      setDraft("");
      invalidate();
      const sentEmails = (json.emails ?? []).filter((e) => e.sent);
      const blockedEmails = (json.emails ?? []).filter((e) => !e.sent);
      const researchBits = json.research ?? [];
      if (researchBits.length > 0) {
        toast({
          title: researchBits.length === 1 ? "Research ready" : "Research locked in",
          description: researchBits.map((r) => r.answer.slice(0, 180)).join(" · "),
        });
      } else if (sentEmails.length > 0) {
        toast({
          title: sentEmails.length === 1 ? "Email sent" : "Emails sent",
          description: sentEmails.map((e) => `${e.subject} → ${e.to.join(", ")}`).join(" · "),
        });
      } else if (blockedEmails.length > 0) {
        toast({
          title: "Draft saved",
          description: blockedEmails[0]?.error || "Need a recipient email before sending.",
        });
      } else {
        toast({
          title: mode === "transcribe" ? "Saved" : items.length === 1 ? "Added" : `${items.length} items added`,
          description: items.map((item) => item.title).join(" · ") || undefined,
        });
      }
      if (json.calendarCreated && json.calendarCreated > 0) {
        toast({
          title: json.calendarCreated === 1 ? "Event added to calendar" : `${json.calendarCreated} events added`,
        });
      } else if (json.calendarError) {
        toast({
          title: "Task saved",
          description: "Calendar invite did not send. Connect Gmail first.",
        });
      }
    } catch {
      toast({ title: "Couldn't save that", variant: "destructive" });
    } finally {
      transcribingRef.current = false;
      setIsTranscribing(false);
    }
  };

  return (
    <div className="min-h-screen lockin-shell text-[#3a241e] flex flex-col">
      <section className="px-6 pt-8 pb-4 flex flex-col items-center">
        <h1 className="text-3xl font-bold tracking-tight font-serif">Lock In</h1>
        <p className="mt-1 text-[#a06d62] text-sm">
          {isTranscribing
            ? "Saving…"
            : isRecording
              ? "Listening — tap when you’re done"
              : "Speak or type a to-do"}
        </p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCaptureModeState("tasks");
              localStorage.setItem("lockin_capture_mode", "tasks");
            }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              captureMode === "tasks"
                ? "border-[#ff5a7a] bg-[#ff5a7a14] text-[#ff5a7a]"
                : "border-[#f5d5c4] text-[#a06d62] bg-white/70"
            }`}
          >
            Tasks
          </button>
          <button
            type="button"
            onClick={() => {
              setCaptureModeState("transcribe");
              localStorage.setItem("lockin_capture_mode", "transcribe");
            }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              captureMode === "transcribe"
                ? "border-[#ff5a7a] bg-[#ff5a7a14] text-[#ff5a7a]"
                : "border-[#f5d5c4] text-[#a06d62] bg-white/70"
            }`}
          >
            Notes
          </button>
        </div>

        <div className="mt-4">
          <VoiceCaptureButton
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            onPress={onMic}
            voiceLevel={voiceLevel}
            hint={isRecording ? "Tap to save" : isTranscribing ? "Saving…" : "Tap to speak"}
          />
        </div>

        <form onSubmit={(e) => void submitTyped(e)} className="mt-2 w-full max-w-md">
          <div className="flex items-end gap-2 rounded-2xl border border-[#f5d5c4] bg-white p-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={stopOnly}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitTyped();
                }
              }}
              placeholder="Type a to-do…"
              disabled={isTranscribing}
              rows={2}
              className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-[#3a241e] outline-none placeholder:text-[#a06d62]"
            />
            <button
              type="submit"
              disabled={isTranscribing || !draft.trim()}
              className="shrink-0 rounded-full bg-[#ff5a7a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="flex-1 px-6 pb-8 max-w-xl mx-auto w-full">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-[#3a241e]">Tasks</p>
          <p className="text-xs text-[#a06d62]">
            {queue.length === 0 ? "None yet" : `${queue.length}`}
          </p>
        </div>
        <TaskPanel
          tasks={queue}
          isLoading={isLoading}
          onComplete={complete}
          onDelete={remove}
          onRefineVoice={onRefineVoice}
          onRefineText={onRefineText}
          notes={notes}
          onNoteChange={(id, note) => setNotes((current) => ({ ...current, [id]: note }))}
          refiningId={refiningId}
          isRefining={isRefining}
        />
      </section>
    </div>
  );
}
