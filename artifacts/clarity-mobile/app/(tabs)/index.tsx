import { SafeAreaView, StyleSheet } from "react-native";
import { VoiceCaptureHero, useVoiceCapture } from "@/components/VoiceCapture";

export default function SpeakScreen() {
  const { isRecording, isTranscribing, lastCaptured, onMicPress } = useVoiceCapture();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <VoiceCaptureHero
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        lastCaptured={lastCaptured}
        onMicPress={onMicPress}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fdfbf7" },
});
