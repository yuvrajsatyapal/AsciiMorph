import Link from "next/link";
import type { ReactNode } from "react";
import "./creative.css";
export const CREATIVE_LINKS = [
  ["/type", "Typography"],
  ["/gallery", "Gallery"],
  ["/animate", "Animation"],
  ["/generate", "Generate"],
  ["/three", "3D"],
  ["/audio", "Audio"],
] as const;
export function CreativeShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="creative-page">
      <header className="creative-header">
        <Link className="wordmark" href="/">
          {"{ }"} AsciiMorph
        </Link>
        <nav aria-label="Creative tools">
          <Link href="/create">All tools</Link>
          <Link href="/studio">Studio</Link>
          <Link href="/convert">Image</Link>
          {CREATIVE_LINKS.map(([url, label]) => (
            <Link key={url} href={url}>
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="creative-heading">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </main>
  );
}
