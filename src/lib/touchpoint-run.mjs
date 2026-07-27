// Pure decision for the touchpoint cron: given the Resend send result, decide
// whether the send ledger may be stamped. The ledger must never assert a send
// that didn't happen — if Resend was skipped (no key) or failed, the touchpoint
// returns to 'scheduled' with sent_at left null so the next run retries. Tested
// by test:logic; the route wires it to the DB.

/**
 * @param {{sent?:number, skipped?:boolean, failed?:boolean}} result
 * @param {number} audienceCount  rows that needed an email this run
 */
export function planTouchpointOutcome(result, audienceCount) {
  if (result && (result.skipped || result.failed)) {
    // Nothing left the building — do NOT stamp, put it back for the next run.
    return { stampSent: false, status: "scheduled", sent: 0, skipped: audienceCount };
  }
  // Delivered (or nothing to send at all → legitimately complete).
  return { stampSent: true, status: "sent", sent: (result && result.sent) || 0, skipped: 0 };
}
