import { Mic, Square, Loader2 } from "lucide-react";

type VoiceCaptureButtonProps = {
  isRecording: boolean;
  isTranscribing: boolean;
  onPress: () => void;
  hint?: string;
  size?: "default" | "large";
  voiceLevel?: number;
};

export function VoiceCaptureButton({
  isRecording,
  isTranscribing,
  onPress,
  hint,
  size = "large",
  voiceLevel = 0,
}: VoiceCaptureButtonProps) {
  const dim = size === "large" ? "h-32 w-32" : "h-28 w-28";
  const iconDim = size === "large" ? "h-10 w-10" : "h-9 w-9";
  const listening = isRecording && !isTranscribing;
  const glow = 1.06 + voiceLevel * 0.45;
  const glowOpacity = 0.14 + voiceLevel * 0.32;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex h-[18rem] w-[18rem] items-center justify-center">
        {listening ? (
          <>
            <span
              className="lockin-ripple pointer-events-none absolute h-32 w-32 rounded-full border-2 border-[#ff5a7a]"
              style={{ animationDelay: "0s" }}
            />
            <span
              className="lockin-ripple pointer-events-none absolute h-32 w-32 rounded-full border-2 border-[#3ecfc1]"
              style={{ animationDelay: "1.1s" }}
            />
            <span
              className="pointer-events-none absolute h-32 w-32 rounded-full bg-[#ff5a7a] will-change-transform"
              style={{
                transform: `scale(${glow})`,
                opacity: glowOpacity,
              }}
            />
          </>
        ) : null}
        <button
          onClick={onPress}
          disabled={isTranscribing}
          aria-label={isRecording ? "Lock in recording" : "Start listening"}
          className={`relative z-10 flex ${dim} items-center justify-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-60 ${
            isRecording ? "bg-[#e63e64] lockin-breathe" : "bg-[#ff5a7a] hover:bg-[#ff7a93]"
          }`}
          style={{ boxShadow: "0 14px 32px -10px rgba(255,90,122,0.45)" }}
        >
          {isTranscribing ? (
            <Loader2 className={`${iconDim} animate-spin`} />
          ) : isRecording ? (
            <Square className={`${iconDim} fill-white`} />
          ) : (
            <Mic className={iconDim} />
          )}
        </button>
      </div>
      <p className="text-sm text-[#a06d62] text-center max-w-xs -mt-6">
        {hint ??
          (isTranscribing
            ? "Cooking it…"
            : isRecording
              ? "Tap to lock it in — or press space"
              : "Tap if the mic is shy")}
      </p>
    </div>
  );
}
