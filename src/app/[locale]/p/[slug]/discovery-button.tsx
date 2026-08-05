"use client";

import { useEffect, useRef } from "react";

// BYO Calendly discovery-call button. Renders ONLY when the planner enabled it and
// the URL is a real calendly.com link (validated here AND by the parent). Opens the
// popup widget — and because the Calendly script's auto-scan races a lazy mount, we
// load the script explicitly and call initPopupWidget ourselves on click.
const CALENDLY_RE = /^https:\/\/calendly\.com\/[a-zA-Z0-9_\-/?=&.]+$/;

declare global {
  interface Window {
    Calendly?: { initPopupWidget: (opts: { url: string }) => void };
  }
}

export function DiscoveryButton({ url, label }: { url: string; label: string }) {
  const injected = useRef(false);

  useEffect(() => {
    // Load the widget assets once, idempotently. We don't gate the button on a
    // ready flag (no effect-driven setState) — by the time a visitor clicks, the
    // async script has loaded; window.Calendly is checked at click time.
    if (!CALENDLY_RE.test(url) || injected.current) return;
    injected.current = true;
    if (!document.querySelector("link[data-calendly]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://assets.calendly.com/assets/external/widget.css";
      link.setAttribute("data-calendly", "1");
      document.head.appendChild(link);
    }
    if (!document.querySelector("script[data-calendly]")) {
      const script = document.createElement("script");
      script.src = "https://assets.calendly.com/assets/external/widget.js";
      script.async = true;
      script.setAttribute("data-calendly", "1");
      document.body.appendChild(script);
    }
  }, [url]);

  if (!CALENDLY_RE.test(url)) return null;

  return (
    <button
      type="button"
      onClick={() => window.Calendly?.initPopupWidget({ url })}
      className="inline-flex items-center justify-center rounded-[var(--radius)] border border-ink px-5 py-3 text-[14px] font-medium text-ink transition-colors hover:bg-ink hover:text-bone"
    >
      {label}
    </button>
  );
}
