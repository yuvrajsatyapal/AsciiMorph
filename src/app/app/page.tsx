import Studio from "@/components/effects-studio/studio";
import "@/components/effects-studio/studio.css";
export default function StudioPage() {
  return (
    <>
      <link
        rel="stylesheet"
        href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap"
      />
      <Studio />
    </>
  );
}
