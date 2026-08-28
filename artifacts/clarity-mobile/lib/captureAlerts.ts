import { Alert } from "react-native";

export function alertCaptureFailure(
  mode: "tasks" | "transcribe",
  status: number,
  detail: string,
) {
  if (status === 401) {
    Alert.alert("Session expired", "Log out in Settings, then sign in again.");
    return;
  }
  if (status === 415 || /unsupported audio/i.test(detail)) {
    Alert.alert("Couldn't read that recording", "Try speaking again for a couple of seconds.");
    return;
  }
  Alert.alert(
    mode === "transcribe" ? "Couldn't transcribe that" : "Couldn't turn that into tasks",
    detail || `Server returned ${status}. Check GEMINI_API_KEY on Railway.`,
  );
}
