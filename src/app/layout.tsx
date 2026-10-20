import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";
import "@/components/workspace/workspace.css";
import { WorkspaceNavigation } from "@/components/workspace/navigation";
export const metadata: Metadata = {
  title: "AsciiMorph — Your Imagination. In Characters.",
  description:
    "A creative playground for ASCII art. Draw and compose something extraordinary, one character at a time.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <WorkspaceNavigation />
        {children}
      </body>
    </html>
  );
}
