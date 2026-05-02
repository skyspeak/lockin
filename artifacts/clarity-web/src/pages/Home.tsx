import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetActionQueue,
  useUpdateAction,
  useDeleteAction,
  useSnoozeAction,
  useCreateAction,
  getGetActionQueueUrl,
} from "@workspace/api-client-react";
import { Mic, Square, Loader2, Check, Mail, MessageSquare, Moon, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Action = {
  id: number;
  title: string;
  status: string;
  priority: string;
  snoozedUntil?: string | null;
  createdAt: string;
};

export default function Home() {
  const qc = useQueryClient();
  const queueKey = getGetActionQueueUrl();
  const { data, isLoading } = useGetActionQueue();
  const updateAction = useUpdateAction();
  const deleteAction = useDeleteAction();
  const snoozeAction = useSnoozeAction();
  const createAction = useCreateAction();
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: [queueKey] });
  }, [qc, queueKey]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        setIsTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "audio.webm");
          const res = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/transcribe`, {
            method: "POST",
            body: form,
          });
          if (!res.ok) throw new Error("transcribe failed");
          const { text } = (await res.json()) as { text: string };
          const trimmed = text?.trim();
          if (!trimmed) {
            toast({ title: "Nothing captured", description: "Try speaking again." });
            return;
          }
          await createAction.mutateAsync({ data: { title: trimmed, priority: "medium" } });
          invalidate();
        } catch {
          toast({ title: "Transcription failed", variant: "destructive" });
        } finally {
          setIsTranscribing(false);
        }
      };
      mr.start();
      mediaRecorder.current = mr;
      setIsRecording(true);
    } catch {
      toast({ title: "Microphone blocked", description: "Allow microphone access to capture voice notes.", variant: "destructive" });
    }
  }, [createAction, invalidate, toast]);

  const stopRecording = useCallback(() => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  }, []);

  const onMic = isRecording ? stopRecording : startRecording;

  // Spacebar to record (push-to-talk-ish: tap to start, tap to stop)
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
  }, [onMic, isTranscribing]);

  const complete = async (id: number) => {
    await updateAction.mutateAsync({ id, data: { status: "done" } });
    invalidate();
  };
  const snooze = async (id: number) => {
    await snoozeAction.mutateAsync({ id, data: { days: 7 } });
    invalidate();
    toast({ title: "Snoozed for a week" });
  };
  const remove = async (id: number) => {
    await deleteAction.mutateAsync({ id });
    invalidate();
  };
  const email = (title: string) => {
    const body = encodeURIComponent(title);
    window.open(`https://mail.google.com/mail/?view=cm&body=${body}`, "_blank");
  };
  const text = (title: string) => {
    const body = encodeURIComponent(title);
    window.open(`sms:?body=${body}`, "_self");
  };

  const queue = (data?.queue ?? []) as Action[];

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#1a1715]">
      <div className="mx-auto max-w-xl px-6 pt-12 pb-24">
        <header className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Clarity</h1>
          <p className="mt-1 text-sm text-[#7a716b]">
            {queue.length === 0
              ? "Nothing on your mind."
              : `${queue.length} ${queue.length === 1 ? "thing" : "things"} to do`}
          </p>
        </header>

        <div className="flex flex-col items-center gap-4 mb-12">
          <button
            onClick={onMic}
            disabled={isTranscribing}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            className={`relative flex h-32 w-32 items-center justify-center rounded-full text-white shadow-xl transition-all active:scale-95 disabled:opacity-60 ${
              isRecording ? "bg-[#a8412e]" : "bg-[#c8553d] hover:bg-[#b34a35]"
            }`}
            style={{ boxShadow: "0 12px 28px -8px rgba(200,85,61,0.45)" }}
          >
            {isRecording && (
              <span className="absolute inset-0 rounded-full bg-[#c8553d] opacity-40 animate-ping" />
            )}
            {isTranscribing ? (
              <Loader2 className="h-10 w-10 animate-spin" />
            ) : isRecording ? (
              <Square className="h-10 w-10 fill-white" />
            ) : (
              <Mic className="h-10 w-10" />
            )}
          </button>
          <p className="text-sm text-[#7a716b]">
            {isTranscribing ? "Transcribing…" : isRecording ? "Tap to stop" : "Tap to speak — or press space"}
          </p>
        </div>

        <ul className="space-y-2">
          {queue.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-[#ebe5dd] bg-white p-4 group"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-[15px] leading-snug font-medium flex-1">{a.title}</p>
                <button
                  onClick={() => remove(a.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#7a716b] hover:text-[#c8553d]"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <PillBtn icon={<Check className="h-4 w-4" />} label="Done" tint="#5d7a4a" onClick={() => complete(a.id)} />
                <PillBtn icon={<Mail className="h-4 w-4" />} label="Email" tint="#3a6b8a" onClick={() => email(a.title)} />
                <PillBtn icon={<MessageSquare className="h-4 w-4" />} label="Text" tint="#c8553d" onClick={() => text(a.title)} />
                <PillBtn icon={<Moon className="h-4 w-4" />} label="Snooze 1w" tint="#b8862c" onClick={() => snooze(a.id)} />
              </div>
            </li>
          ))}
          {!isLoading && queue.length === 0 && (
            <li className="text-center text-sm text-[#7a716b] py-12">
              Speak something to capture your first action.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function PillBtn({
  icon,
  label,
  tint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-lg border bg-white py-2 text-xs font-semibold transition-colors hover:bg-[var(--tint-bg)] active:scale-95"
      style={
        {
          color: tint,
          borderColor: `${tint}33`,
          ["--tint-bg" as string]: `${tint}10`,
        } as React.CSSProperties
      }
    >
      {icon}
      {label}
    </button>
  );
}
