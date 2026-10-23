"use client";
import { useRef } from "react";
import type { StudioController } from "./controller";
import { Icon } from "./toolbar";
export function Actions({
  controller,
  exportImage,
}: {
  controller: StudioController;
  exportImage: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="studio-actions" role="toolbar" aria-label="Image actions">
      <input
        ref={input}
        hidden
        type="file"
        aria-label="Upload image file"
        accept="image/png,image/jpeg,image/webp,image/bmp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void controller.loadFile(file);
          e.target.value = "";
        }}
      />
      <button onClick={() => input.current?.click()}>
        <Icon name="upload" />
        Upload
      </button>
      {["Inspire", "Restyle", "Shuffle", "Library"].map((name) => (
        <button
          key={name}
          disabled
          title={`${name} is unavailable in this release`}
        >
          <Icon name={name.toLowerCase()} />
          {name}
        </button>
      ))}
      <button className="studio-export" onClick={exportImage}>
        <Icon name="export" />
        Export
      </button>
    </div>
  );
}
