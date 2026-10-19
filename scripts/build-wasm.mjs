import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync("cargo", ["build", "--manifest-path", "rust/Cargo.toml", "--target", "wasm32-unknown-unknown", "--release", "--offline"], { cwd: root, stdio: "inherit" });
if (result.status !== 0) {
  console.error("Install Rust and run rustup target add wasm32-unknown-unknown before building WASM.");
  process.exit(result.status || 1);
}
mkdirSync(new URL("../public/wasm/", import.meta.url), { recursive: true });
copyFileSync(new URL("../rust/target/wasm32-unknown-unknown/release/asciimorph_engine.wasm", import.meta.url), new URL("../public/wasm/asciimorph_engine.wasm", import.meta.url));
