"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Braces,
  Check,
  MousePointer2,
  Sparkles,
} from "lucide-react";

export function orbitArt(symbol = "◆"): string {
  const width = 65,
    height = 26;
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const dx = (x - 32) / 1.9,
        dy = y - 12.5;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.abs(dy * 0.62 + dx * 0.38);
      if (ring < 0.65 && Math.abs(dx) < 26 && radius > 10.7) return symbol;
      if (radius < 10.9) {
        const shade = Math.sin(dx * 0.47 + dy * 0.32);
        return radius > 10.2
          ? symbol
          : shade > 0.6
            ? symbol
            : shade > -0.25
              ? ":"
              : ".";
      }
      if (
        (x === 7 && y === 5) ||
        (x === 56 && y === 4) ||
        (x === 51 && y === 22)
      )
        return "+";
      return " ";
    }).join(""),
  ).join("\n");
}
const colors = [
  { name: "amber", hex: "E9B86E" },
  { name: "mint", hex: "91D3BD" },
  { name: "lavender", hex: "BAADE5" },
  { name: "white", hex: "F0F1F3" },
];
export default function Home() {
  const [symbol, setSymbol] = useState("◆");
  const [color, setColor] = useState("E9B86E");
  return (
    <main className="home" id="main-content" tabIndex={-1}>
      <a className="skip-link" href="#home-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link prefetch={false} href="/" className="wordmark" aria-label="AsciiMorph home">
          <Braces size={25} />
          AsciiMorph<span className="wordmark-dot">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#playground">Playground</a>
          <a href="#possibilities">The possibilities</a>
          <Link prefetch={false} href="/create">Creative tools</Link>
        </nav>
        <Link prefetch={false} href="/app" className="header-studio">
          Open Studio <ArrowUpRight size={15} />
        </Link>
      </header>
      <section className="hero" id="home-content" tabIndex={-1}>
        <div className="hero-copy">
          <div className="eyebrow">
            <span /> A LITTLE CHARACTER GOES A LONG WAY
          </div>
          <h1 aria-label="Your Imagination. In Characters.">
            Your Imagination.
            <br />
            <span>In Characters.</span>
          </h1>
          <p>
            Create, convert, animate, and transform anything into stunning ASCII
            art.
          </p>
          <div className="hero-actions">
            <Link prefetch={false} href="/app" className="button primary">
              Launch Studio <ArrowUpRight size={18} />
            </Link>
            <a href="#playground" className="text-link">
              Try a little character <ArrowRight size={16} />
            </a>
          </div>
          <div className="hero-note">
            <span>No account. No setup.</span> Just you and a blank canvas.
          </div>
        </div>
        <div className="art-stage" id="playground">
          <div className="stage-top">
            <span>
              <span className="live-dot" /> LIVE CHARACTER STUDY
            </span>
            <span>001 — ORBIT</span>
          </div>
          <pre
            data-testid="ascii-demo"
            aria-label="Interactive ASCII planet artwork"
            className="orbit-art"
            style={{ color: `#${color}` }}
          >
            {orbitArt(symbol)}
          </pre>
          <div className="art-caption">
            <span>
              Small marks.
              <br />
              <strong>Infinite space.</strong>
            </span>
            <span className="art-coordinate">
              65 × 26
              <br />
              BUILT FROM CHARACTERS
            </span>
          </div>
          <div className="demo-controls">
            <div>
              <span className="control-caption">MAKE YOUR MARK</span>
              <div className="character-options">
                {["◆", "@", "+", "░"].map((char) => (
                  <button
                    key={char}
                    aria-label={`Use ${char} character`}
                    aria-pressed={symbol === char}
                    onClick={() => setSymbol(char)}
                  >
                    {char}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="control-caption">SET THE MOOD</span>
              <div className="color-options">
                {colors.map((c) => (
                  <button
                    key={c.hex}
                    aria-label={`Use ${c.name} color`}
                    aria-pressed={color === c.hex}
                    style={{ "--swatch": `#${c.hex}` } as React.CSSProperties}
                    onClick={() => setColor(c.hex)}
                  >
                    {color === c.hex && <Check size={13} />}
                  </button>
                ))}
              </div>
            </div>
            <Link prefetch={false}
              href={`/studio?demo=orbit&char=${encodeURIComponent(symbol)}&color=${color}`}
              className="demo-edit"
            >
              Edit this artwork <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </section>
      <section className="possibilities" id="possibilities">
        <div className="section-intro">
          <span className="eyebrow">A DIFFERENT KIND OF CREATIVE TOOL</span>
          <h2>
            Less pixels.
            <br />
            More personality.
          </h2>
          <p>
            One character is a mark. A few thousand are a world. Start somewhere
            small and see where it takes you.
          </p>
        </div>
        <div className="feature-list">
          <article>
            <MousePointer2 />
            <div>
              <h3>A canvas with character</h3>
              <p>
                Draw, compose, and find your own visual language on a precise
                character grid.
              </p>
              <Link prefetch={false} href="/studio">
                Make something <ArrowRight size={14} />
              </Link>
            </div>
          </article>
          <article>
            <Braces />
            <div>
              <h3>From the simple to the unexpected</h3>
              <p>
                Letters, symbols, blocks, and everything in between. Your
                palette is hiding on your keyboard.
              </p>
              <Link prefetch={false} href="/create">Explore creative tools <ArrowRight size={14} /></Link>
            </div>
          </article>
          <article>
            <Sparkles />
            <div>
              <h3>Find a new kind of texture</h3>
              <p>
                Turn a photograph into editable characters, with local image
                conversion and color controls.
              </p>
              <Link prefetch={false} href="/convert">
                Convert an image <ArrowRight size={14} />
              </Link>
            </div>
          </article>
        </div>
      </section>
      <footer className="site-footer">
        <Link prefetch={false} href="/" className="wordmark">
          <Braces size={19} />
          AsciiMorph.
        </Link>
        <span>Made for the joy of making.</span>
        <Link prefetch={false} href="/create">Explore all creative tools →</Link>
        <span className="footer-ascii">[ a little less ordinary ]</span>
      </footer>
    </main>
  );
}
