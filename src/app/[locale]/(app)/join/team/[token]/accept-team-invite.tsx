"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui";
import { acceptTeamInvite } from "./actions";

const ACCEPT_ERR: Record<string, string> = { FV241: "joinRejected", FV000: "joinUnknown", FV230: "joinSignInHint" };

export function AcceptTeamInvite({ token }: { token: string }) {
  const t = useTranslations("team");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={pending}
        className="w-full"
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await acceptTeamInvite(token);
            if (r.ok) router.push("/"); // joined — land on the studio cockpit
            else setErr(t(ACCEPT_ERR[r.error ?? ""] ?? "joinRejected"));
          })
        }
      >
        {t("joinAccept")}
      </Button>
      {err ? <p className="text-[13px] text-[color:var(--color-text-danger)]">{err}</p> : null}
    </div>
  );
}
