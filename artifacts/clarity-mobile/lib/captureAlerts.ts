import { Alert } from "react-native";
import { presentCaptureError } from "../../../lib/integrations/src/captureError";

export function alertCaptureFailure(
  mode: "tasks" | "transcribe",
  status: number,
  detail: string,
) {
  const message = presentCaptureError(detail, status);
  if (status === 401) {
    Alert.alert("Session expired", message);
    return;
  }
  if (status === 415 || /unsupported audio/i.test(detail)) {
    Alert.alert("Couldn't read that recording", message);
    return;
  }
  if (status === 429) {
    Alert.alert("Slow down a second", message);
    return;
  }
  Alert.alert(
    mode === "transcribe" ? "Couldn't transcribe that" : "Couldn't turn that into tasks",
    message,
  );
}
