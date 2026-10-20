import { it, expect } from "vitest";
import { generate, DEFAULT_GENERATOR } from "./generators";
import { renderMesh, CUBE } from "./mesh";
import { audioArtwork, audioFeatures } from "./audio";
import { serializeDocument } from "@/core/document";
import {
  parseFiglet,
  typographyDocument,
  placeTypography,
} from "@/typography/figlet";
import { saveCustomTemplate, readCustomTemplates } from "@/gallery/catalog";
import { readFileSync } from "node:fs";
it.runIf(process.env.ASCII_PROFILE === "1")(
  "profiles complete generation, serialization and reusable template workflows",
  () => {
    const report: Record<string, { ms: number; bytes: number }> = {};
    const measure = (name: string, work: () => number) => {
      const start = performance.now();
      const bytes = work();
      report[name] = { ms: +(performance.now() - start).toFixed(2), bytes };
    };
    measure("30 composed generator frames + project serialization", () =>
      Array.from(
        { length: 30 },
        (_, i) =>
          serializeDocument(
            generate(
              {
                ...DEFAULT_GENERATOR,
                combine: "particles",
                density: 64,
                loopSeconds: 3,
              },
              i / 10,
            ),
          ).length,
      ).reduce((a, b) => a + b, 0),
    );
    measure("36 mesh orbit frames + project serialization", () =>
      Array.from(
        { length: 36 },
        (_, i) =>
          serializeDocument(
            renderMesh(CUBE, (i * Math.PI) / 18, 0.4, 1, 1, "#e9b86e", {
              perspective: 0.8,
            }),
          ).length,
      ).reduce((a, b) => a + b, 0),
    );
    measure("120 FFT analyses + visual frames + project serialization", () => {
      const time = new Uint8Array(2048).fill(180),
        freq = new Uint8Array(1024).fill(100);
      let size = 0;
      for (let i = 0; i < 120; i++)
        size += serializeDocument(
          audioArtwork(
            audioFeatures(time, freq, {
              sampleRate: 48000,
              minHz: 20,
              maxHz: 8000,
            }),
            "bars",
            "#e9b86e",
            1,
          ),
        ).length;
      return size;
    });
    measure(
      "font parse + styled lettering + placement + template save/reload",
      () => {
        const font = parseFiglet(
          readFileSync("public/fonts/figlet/morph-grid.flf", "utf8"),
        );
        const lettering = typographyDocument(font, "ASCII", {
          outline: true,
          gradient: "#aabbcc",
          kerning: true,
        });
        const doc = placeTypography(
          generate(DEFAULT_GENERATOR),
          lettering,
          5,
          5,
        );
        const map = new Map<string, string>();
        const storage = {
          getItem: (k: string) => map.get(k) ?? null,
          setItem: (k: string, v: string) => {
            map.set(k, v);
          },
        };
        saveCustomTemplate(doc, ["benchmark"], "Profile", storage);
        return serializeDocument(readCustomTemplates(storage)[0].document)
          .length;
      },
    );
    console.info(
      "Creative CPU workflow profile (Vitest/jsdom; milliseconds; serialized bytes)",
      JSON.stringify(report),
    );
    expect(
      Object.values(report).every((value) => value.ms > 0 && value.bytes > 0),
    ).toBe(true);
  },
  30000,
);
