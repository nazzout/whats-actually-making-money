"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

// Official Ko-fi overlay widget. Its floating trigger is hidden (see .floatingchat-container-wrap in globals.css);
// this footer CTA is the only entry point and clicks Ko-fi's own (same-origin, srcdoc) button so the official popup opens.
const KOFI_PAGE = "nazzout";
const KOFI_URL = `https://ko-fi.com/${KOFI_PAGE}`;
const CSS_ID = "wmm"; // fixed id so the generated elements are predictable

type KofiWindow = Window & {
  kofiWidgetOverlay?: { draw: (id: string, cfg: Record<string, string>) => void };
  __wmmKofiDrawn?: boolean;
  dataLayer?: unknown[];
};

function track(event: string) {
  const w = window as KofiWindow;
  // No third-party analytics: push to a dataLayer if one is ever added, and emit a DOM event for any listener.
  (w.dataLayer = w.dataLayer || []).push({ event });
  window.dispatchEvent(new CustomEvent("wmm:analytics", { detail: { event } }));
}

function drawWidget() {
  const w = window as KofiWindow;
  if (w.__wmmKofiDrawn || !w.kofiWidgetOverlay) return;
  w.__wmmKofiDrawn = true;
  try {
    w.kofiWidgetOverlay.draw(KOFI_PAGE, {
      type: "floating-chat",
      "floating-chat.cssId": CSS_ID,
      "floating-chat.donateButton.text": "Support me",
      "floating-chat.donateButton.background-color": "#323842",
      "floating-chat.donateButton.text-color": "#fff",
    });
  } catch {
    w.__wmmKofiDrawn = false;
  }
}

// Returns true if the official popup was opened.
function openKofi(): boolean {
  const mobile = matchMedia("(max-width: 600px)").matches; // Ko-fi swaps to its "-mobi" variant on small screens
  const ids = mobile ? ["kofi-wo-container-mobi", "kofi-wo-container"] : ["kofi-wo-container", "kofi-wo-container-mobi"];
  for (const id of ids) {
    const frame = document.getElementById(id + CSS_ID) as HTMLIFrameElement | null;
    const btn = frame?.contentDocument?.getElementById(`${CSS_ID}-donate-button`);
    if (btn && frame && getComputedStyle(frame.parentElement as Element).display !== "none") {
      btn.click();
      return true;
    }
  }
  return false;
}

export default function SupportKofi() {
  const btnRef = useRef<HTMLAnchorElement>(null);
  // Shake once each time the button scrolls into view (skipped for reduced motion).
  useEffect(() => {
    const el = btnRef.current;
    if (!el || !("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          el.classList.remove("shake");
          void el.offsetWidth; // restart the animation
          el.classList.add("shake");
        }
      },
      { threshold: 0.9 }
    );
    io.observe(el);
    const done = () => el.classList.remove("shake");
    el.addEventListener("animationend", done);
    return () => {
      io.disconnect();
      el.removeEventListener("animationend", done);
    };
  }, []);
  return (
    <div className="sf-support">
      <a
        ref={btnRef}
        className="sf-support-btn"
        href={KOFI_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          track("support_kofi_open");
          if (openKofi()) e.preventDefault(); // otherwise fall back to the Ko-fi page in a new tab
        }}
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <path
            d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        Support Independent Research
      </a>
      <p className="sf-support-sub">Help cover research, data checks, and keeping the site updated.</p>
      {/* Loaded once (next/script dedupes by id), after the page is idle, so it never blocks rendering. */}
      <Script
        id="kofi-overlay"
        src="https://storage.ko-fi.com/cdn/scripts/overlay-widget.js"
        strategy="lazyOnload"
        onReady={drawWidget}
      />
    </div>
  );
}
