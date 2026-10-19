import Link from "next/link";
import { CreativeShell } from "@/components/creative/shell";
const tools = [
  [
    "/studio",
    "Draw",
    "+—◆—+",
    "Paint character by character, with layers, palettes and undo.",
  ],
  [
    "/convert",
    "Convert images",
    "░▒▓█",
    "Turn local images into editable ASCII with Rust processing.",
  ],
  [
    "/type",
    "Typography",
    "Aa_",
    "Create character lettering with a licensed FIGlet font.",
  ],
  [
    "/gallery",
    "Gallery",
    "[ * ]",
    "Find original templates, favorites and your saved creations.",
  ],
  [
    "/animate",
    "Animation",
    "| ▷ |",
    "Import video/GIF or build frames, set timing and export motion.",
  ],
  [
    "/generate",
    "Generative art",
    "~≈~",
    "Explore seeded noise, waves, particles and fractals.",
  ],
  [
    "/three",
    "3D ASCII",
    "◇ / ◇",
    "Orbit local OBJ/GLB meshes and shade them in characters.",
  ],
  [
    "/audio",
    "Audio reactive",
    "▁▃▆█",
    "Make characters respond to local audio or your microphone.",
  ],
];
export default function CreatePage() {
  return (
    <CreativeShell
      title="A character for every idea."
      description="Draw, transform, animate and explore. Your files and creations stay on this device."
    >
      <div className="creative-cards">
        {tools.map(([url, title, art, copy]) => (
          <Link className="creative-card" key={url} href={url}>
            <span className="mono" aria-hidden="true">
              {art}
            </span>
            <h2>{title} →</h2>
            <p>{copy}</p>
          </Link>
        ))}
      </div>
    </CreativeShell>
  );
}
