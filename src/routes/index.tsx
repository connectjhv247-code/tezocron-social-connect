import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState } from "react";

import { registerServiceWorker } from "@/lib/pwa";

const TezocronApp = lazy(() => import("@/tezocron/App"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TEZOCRON — Social Crypto Chat & Community" },
      {
        name: "description",
        content:
          "TEZOCRON is a real-time social crypto app: community chat, direct messages, connections and notifications in one installable app.",
      },
      { property: "og:title", content: "TEZOCRON — Social Crypto Chat & Community" },
      {
        property: "og:description",
        content:
          "Join the TEZOCRON community: real-time chat, direct messages and connections in one installable social crypto app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020817]">
      <div className="flex flex-col items-center gap-4">
        <img src="/icon-192.png" alt="TEZOCRON" className="h-20 w-20 animate-pulse rounded-2xl" />
        <p className="text-sm tracking-[0.3em] text-[#7c3aed]">TEZOCRON</p>
      </div>
    </div>
  );
}

function Index() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    registerServiceWorker();
  }, []);

  if (!mounted) return <Splash />;

  return (
    <Suspense fallback={<Splash />}>
      <TezocronApp />
    </Suspense>
  );
}
