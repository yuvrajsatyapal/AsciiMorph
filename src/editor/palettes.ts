export const symbolPalettes: Record<string, string> = {
  "Standard ASCII": " .,:;!?#@%&*+-=/\\|_~`'\"()[]{}<>^$",
  "Letters and numbers":
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  "Box drawing": "─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╭╮╰╯╱╲╳",
  "Block elements": "█▓▒░▀▄▌▐▁▂▃▅▆▇▖▗▘▙▚▛▜▝▞▟",
  Geometric: "○●◐◑◒◓□■▢▣◇◆△▲▽▼◁◀▷▶◎◉",
  Arrows: "←↑→↓↔↕↖↗↘↙⇐⇑⇒⇓⇔⇕➔➜➤",
  Stars: "☆★✦✧✩✪✫✬✭✮✯✰✱✳✴✵✶✷✸✹✺",
  Mathematics: "±×÷=≠≈≤≥∞√∑∏∫∂∆∇∈∉∪∩⊂⊃αβγδπθλΩ",
  Braille: Array.from({ length: 256 }, (_, i) =>
    String.fromCodePoint(0x2800 + i),
  ).join(""),
  "Unicode art": "☺☻♥♦♣♠☀☁☂☃☄☕☘☯☮♫♪⚑⚐⚙⚡⌂⌘⏣⎔",
};
export const ANSI = [
  "#000000",
  "#AA0000",
  "#00AA00",
  "#AA5500",
  "#0000AA",
  "#AA00AA",
  "#00AAAA",
  "#AAAAAA",
  "#555555",
  "#FF5555",
  "#55FF55",
  "#FFFF55",
  "#5555FF",
  "#FF55FF",
  "#55FFFF",
  "#FFFFFF",
];
export const STAMPS: Record<string, string> = {
  Star: "  *  \n *** \n*****\n *** \n  *  ",
  Cat: " /\\_/\\\n( o.o )\n > ^ <",
  Heart: " ** ** \n*******\n ***** \n  ***  \n   *   ",
  Box: "┌─────┐\n│     │\n└─────┘",
};
export interface Preferences {
  favorites: string[];
  custom: Record<string, string>;
  recent: string[];
  saved: string[][];
}
export const defaultPreferences: Preferences = {
  favorites: [],
  custom: {},
  recent: [],
  saved: [],
};
export function readPreferences(): Preferences {
  try {
    const v = JSON.parse(
      localStorage.getItem("asciimorph-preferences") || "null",
    );
    if (!v) return defaultPreferences;
    return {
      favorites: Array.isArray(v.favorites)
        ? v.favorites
            .filter((x: unknown) => typeof x === "string")
            .slice(0, 256)
        : [],
      custom:
        v.custom && typeof v.custom === "object"
          ? (Object.fromEntries(
              Object.entries(v.custom).filter(
                ([k, x]) =>
                  k.length <= 40 && typeof x === "string" && x.length < 4096,
              ),
            ) as Record<string, string>)
          : {},
      recent: Array.isArray(v.recent)
        ? v.recent
            .filter(
              (x: unknown) =>
                typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x),
            )
            .slice(0, 12)
        : [],
      saved: Array.isArray(v.saved)
        ? v.saved
            .filter(
              (a: unknown) =>
                Array.isArray(a) &&
                a.every(
                  (x) => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x),
                ),
            )
            .slice(0, 12)
        : [],
    };
  } catch {
    return defaultPreferences;
  }
}
export function storePreferences(p: Preferences) {
  localStorage.setItem("asciimorph-preferences", JSON.stringify(p));
}
