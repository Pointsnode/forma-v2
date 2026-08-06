"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui";
import { createQuote } from "./quote-actions";

export function NewQuoteButton() {
  const t = useTranslations("quotes");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="primary" disabled={pending} onClick={() => start(async () => { const r = await createQuote(); if (r.ok && r.id) router.push(`/quotes/${r.id}`); })}>
      {t("newQuote")}
    </Button>
  );
}
