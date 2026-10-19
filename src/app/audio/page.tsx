import { CreativeShell } from "@/components/creative/shell";
import { AudioTool } from "@/components/creative/audio-tool";
export default function AudioPage() {
  return (
    <CreativeShell
      title="Sound, written in characters."
      description="Choose a local audio file or explicitly enable your microphone. Capture a still or record the live response."
    >
      <AudioTool />
    </CreativeShell>
  );
}
