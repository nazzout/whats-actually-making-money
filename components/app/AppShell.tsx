"use client";

import { useEffect } from "react";
import { MARKUP } from "@/lib/ui/markup";
import SiteFooter from "@/components/SiteFooter";
import { mountApp } from "./legacy-app";

type Props = { initial: unknown[]; canWrite: boolean; askEnabled: boolean; brandfetchId: string };

let mounted = false;

export default function AppShell(props: Props) {
  useEffect(() => {
    // The ported app attaches global listeners; mount it once per page load.
    if (mounted) return;
    mounted = true;
    mountApp(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: MARKUP }} />
      {/* Visible only on the Board (body.board-mode); the Explore canvas stays full screen. */}
      <SiteFooter />
    </>
  );
}
