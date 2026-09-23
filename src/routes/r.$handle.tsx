import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy short link: keeps older shared links working. */
export const Route = createFileRoute("/r/$handle")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/relate/$relateId", params: { relateId: params.handle } });
  },
});
