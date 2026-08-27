import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VoiceCaptureHero, useVoiceCapture } from "@/components/VoiceCapture";

export default function SpeakScreen() {
  const {
    isRecording,
    isTranscribing,
    lastCaptured,
    lastTranscript,
    captureMode,
    setCaptureMode,
    onMicPress,
    energyAnim,
  } = useVoiceCapture();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <VoiceCaptureHero
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        lastCaptured={lastCaptured}
        lastTranscript={lastTranscript}
        captureMode={captureMode}
        onCaptureModeChange={setCaptureMode}
        onMicPress={onMicPress}
        energyAnim={energyAnim}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff3e6" },
});
