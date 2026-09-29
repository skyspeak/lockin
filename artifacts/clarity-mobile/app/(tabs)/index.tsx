import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VoiceCaptureHero, useVoiceCapture } from "@/components/VoiceCapture";
import { pendingCaptureLabel } from "@/lib/pendingCaptures";

export default function SpeakScreen() {
  const {
    isRecording,
    isTranscribing,
    pending,
    onMicPress,
    captureFromText,
    energyAnim,
    stopOnly,
  } = useVoiceCapture();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <VoiceCaptureHero
          isRecording={isRecording}
          isTranscribing={isTranscribing}
          pendingLines={pending.map(pendingCaptureLabel)}
          onMicPress={onMicPress}
          onTypedSubmit={captureFromText}
          onDraftFocus={() => void stopOnly()}
          energyAnim={energyAnim}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff3e6" },
  flex: { flex: 1 },
});
