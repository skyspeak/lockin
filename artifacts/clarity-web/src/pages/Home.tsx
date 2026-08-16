import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetActionQueue,
  useUpdateAction,
  useDeleteAction,
  useSnoozeAction,
  getGetActionQueueUrl,
} from "@workspace/api-client-react";
import { ChevronUp } from "lucide-react";
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
  const snoozeAction = useSnoozeAction();
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(true);
  const [lastCaptured, setLastCaptured] = useState<{ title: string; nextSteps: string[] }[]>([]);
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
        const blobType = mr.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type: blobType });
        setIsTranscribing(true);
        try {
          const form = new FormData();
          const filename = blobType.includes("mp4") || blobType.includes("m4a") ? "audio.m4a" : "audio.webm";
          form.append("audio", blob, filename);
          const res = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/capture`, {
            method: "POST",
            body: form,
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) {
            let detail = "Couldn't turn that into tasks";
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
            transcript?: string;
            actions?: { title: string; nextSteps?: string[] }[];
          };
          const items = (json.actions ?? [])
            .map((a) => ({ title: a.title, nextSteps: a.nextSteps ?? [] }))
            .filter((a) => a.title);
          if (items.length === 0) {
            toast({ title: "Nothing captured", description: "Try speaking again." });
            return;
          }
          setLastCaptured(items);
          invalidate();
          toast({
            title: items.length === 1 ? "Task added" : `${items.length} tasks added`,
            description: items.map((item) => item.title).join(" · "),
          });
        } catch {
          toast({ title: "Couldn't turn that into tasks", variant: "destructive" });
        } finally {
          setIsTranscribing(false);
        }
      };
      mr.start();
      mediaRecorder.current = mr;
      setIsRecording(true);
    } catch {
      toast({
        title: "Microphone blocked",
        description: "Allow microphone access to capture tasks by voice.",
        variant: "destructive",
      });
    }
  }, [apiKey, invalidate, toast]);

  const stopRecording = useCallback(() => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  }, []);

  const onMic = isRecording ? stopRecording : startRecording;

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

  const queue = (data?.queue ?? []) as TaskItem[];

  const complete = async (id: number) => {
    await updateAction.mutateAsync({ id, data: { status: "done" } });
    invalidate();
  };
  const snooze = async (id: number, days: number) => {
    await snoozeAction.mutateAsync({ id, data: { days } });
    invalidate();
    toast({ title: days === 1 ? "Snoozed until tomorrow" : `Snoozed for ${days} days` });
  };
  const remove = async (id: number) => {
    if (!window.confirm("Delete this task?")) return;
    await deleteAction.mutateAsync({ id });
    invalidate();
  };
  const email = (title: string) => {
    window.open(`https://mail.google.com/mail/?view=cm&body=${encodeURIComponent(title)}`, "_blank");
  };
  const text = (title: string) => {
    window.open(`sms:?body=${encodeURIComponent(title)}`, "_self");
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#1a1715] flex flex-col">
      {/* Voice-first hero — default focus */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-10 pb-6 min-h-[55vh]">
        <header className="w-full max-w-xl mb-10 text-center relative">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#c8553d] mb-2">
            Voice first
          </p>
          <h1 className="text-4xl font-bold tracking-tight font-serif">
            Clarity
          </h1>
          <p className="mt-2 text-[#7a716b] text-sm max-w-sm mx-auto">
            Speak a thought. I'll turn it into tasks and next steps.
          </p>
        </header>

        <VoiceCaptureButton
          isRecording={isRecording}
          isTranscribing={isTranscribing}
          onPress={onMic}
        />

        {lastCaptured.length > 0 && !isRecording && !isTranscribing && (
          <div className="mt-8 max-w-md w-full rounded-2xl border border-[#c8553d33] bg-[#c8553d08] px-4 py-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#c8553d] mb-1">
              Just added
            </p>
            <ul className="space-y-3 text-left">
              {lastCaptured.map((item, index) => (
                <li key={`${index}-${item.title}`}>
                  <p className="text-sm font-medium text-[#1a1715] leading-snug">{item.title}</p>
                  {item.nextSteps.length > 0 && (
                    <ol className="mt-1 ml-4 list-decimal space-y-0.5">
                      {item.nextSteps.map((step) => (
                        <li key={step} className="text-xs text-[#7a716b] leading-snug">
                          {step}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Tasks — secondary panel, collapsed by default */}
      <section className="border-t border-[#ebe5dd] bg-white/80 backdrop-blur-sm rounded-t-3xl shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.08)]">
        <button
          type="button"
          onClick={() => setTasksOpen((o) => !o)}
          className="w-full flex items-center justify-between px-6 py-4 text-left"
          aria-expanded={tasksOpen}
        >
          <div>
            <p className="text-sm font-semibold text-[#1a1715]">Your tasks</p>
            <p className="text-xs text-[#7a716b]">
              {queue.length === 0
                ? "Nothing queued yet"
                : `${queue.length} ${queue.length === 1 ? "task" : "tasks"} waiting`}
            </p>
          </div>
          <ChevronUp
            className={`h-5 w-5 text-[#7a716b] transition-transform ${tasksOpen ? "" : "rotate-180"}`}
          />
        </button>

        {tasksOpen && (
          <div className="px-6 pb-8 max-w-xl mx-auto w-full">
            <TaskPanel
              tasks={queue}
              isLoading={isLoading}
              onComplete={complete}
              onSnooze={snooze}
              onDelete={remove}
              onEmail={email}
              onText={text}
              compact
            />
          </div>
        )}
      </section>
    </div>
  );
}
