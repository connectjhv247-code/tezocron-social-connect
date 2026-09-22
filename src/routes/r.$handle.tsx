import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState } from "react";

import { registerServiceWorker } from "@/lib/pwa";

const TezocronApp = lazy(() => import("@/tezocron/App"));

export const Route = createFileRoute("/r/$handle")({
  head: () => ({
    meta: [
      { title: "Relate on TEZOCRON" },
      {
        name: "description",
        content:
          "Open this TEZOCRON Relate Link to view the member's profile and send a Relate request in the TEZOCRON community app.",
      },
      { property: "og:title", content: "Relate on TEZOCRON" },
      {
        property: "og:description",
        content:
          "View this member's TEZOCRON profile and connect with them through Relate.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RelateLinkPage,
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

function RelateLinkPage() {
  const { handle } = Route.useParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    registerServiceWorker();
  }, []);

  if (!mounted) return <Splash />;

  return (
    <Suspense fallback={<Splash />}>
      <TezocronApp relateHandle={handle} />
    </Suspense>
  );
}
