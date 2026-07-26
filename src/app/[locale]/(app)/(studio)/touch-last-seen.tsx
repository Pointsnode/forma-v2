"use client";

import { useEffect, useRef } from "react";
import { touchLastSeen } from "./actions";

// Fire-and-forget: advance the last-seen cursor once after the cockpit mounts, so
// the current render's "Since you were away" window reflects the previous visit.
export function TouchLastSeen() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void touchLastSeen();
  }, []);
  return null;
}
