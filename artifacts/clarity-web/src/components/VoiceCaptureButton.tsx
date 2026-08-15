import { Mic, Square, Loader2 } from "lucide-react";

type VoiceCaptureButtonProps = {
  isRecording: boolean;
  isTranscribing: boolean;
  onPress: () => void;
  hint?: string;
  size?: "default" | "large";
};

export function VoiceCaptureButton({
  isRecording,
  isTranscribing,
  onPress,
  hint,
  size = "large",
}: VoiceCaptureButtonProps) {
  const dim = size === "large" ? "h-36 w-36" : "h-28 w-28";
  const iconDim = size === "large" ? "h-11 w-11" : "h-9 w-9";

  return (
    <div className="flex flex-col items-center gap-5">
      <button
        onClick={onPress}
        disabled={isTranscribing}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
        className={`relative flex ${dim} items-center justify-center rounded-full text-white shadow-xl transition-all active:scale-95 disabled:opacity-60 ${
          isRecording ? "bg-[#a8412e]" : "bg-[#c8553d] hover:bg-[#b34a35]"
        }`}
        style={{ boxShadow: "0 16px 40px -10px rgba(200,85,61,0.5)" }}
      >
        {isRecording && (
          <span className="absolute inset-0 rounded-full bg-[#c8553d] opacity-40 animate-ping" />
        )}
        {isTranscribing ? (
          <Loader2 className={`${iconDim} animate-spin`} />
        ) : isRecording ? (
          <Square className={`${iconDim} fill-white`} />
        ) : (
          <Mic className={iconDim} />
        )}
      </button>
      <p className="text-sm text-[#7a716b] text-center max-w-xs">
        {hint ??
          (isTranscribing
            ? "Turning that into tasks…"
            : isRecording
              ? "Tap to stop"
              : "Tap to speak — or press space")}
      </p>
    </div>
  );
}
