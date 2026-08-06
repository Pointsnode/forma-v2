"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, cx } from "@/components/ui";
import { substituteBody } from "@/lib/merge-body";
import { fillFields, signContract, declineContract } from "@/app/[locale]/sign/[token]/actions";

type Field = { id: string; key: string; label: string; merge_source: string; signer_order: number | null; required: boolean; value: string | null };
type Signer = { name: string; role: string; sign_order: number; signed: boolean; declined: boolean };
export type ContractView = {
  contract: { id: string; title: string; kind: string; status: string };
  body: string;
  me: { name: string; role: string; sign_order: number; signed_at: string | null; declined_at: string | null };
  my_turn: boolean;
  fields: Field[];
  signers: Signer[];
};

const input = "w-full rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3.5 py-2.5 text-[15px] text-text-primary outline-none focus:border-[color:var(--color-text-primary)]";

const errMsg = (t: ReturnType<typeof useTranslations>, code?: string) =>
  code === "FM025" ? t("errRequired") : code === "FM021" ? t("errTurn") : code === "FM024" ? t("errActed") : t("errGeneric");

export function SignForm({ token, view }: { token: string; view: ContractView }) {
  const t = useTranslations("sign");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<"signed" | "declined" | null>(null);
  const [signedCompleted, setSignedCompleted] = useState<boolean | null>(null);
  const [signedFiled, setSignedFiled] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const myFields = view.fields.filter((f) => f.merge_source === "manual" && (f.signer_order === view.me.sign_order || f.signer_order === null));
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(myFields.map((f) => [f.key, f.value ?? ""])));

  // The banner must not jump to "all signed" on a non-final signature — honor the
  // rpc's completed flag, and name the next signer for the sequential handoff.
  const declinedState = view.contract.status === "declined" || view.me.declined_at != null || done === "declined";
  const completed = view.contract.status === "completed" || signedCompleted === true;
  const alreadySigned = view.me.signed_at != null;
  const order = (a: Signer, b: Signer) => a.sign_order - b.sign_order;
  const nextSigner = view.signers.filter((s) => !s.signed && !s.declined).sort(order)[0];
  const nextAfterMe = view.signers.filter((s) => s.sign_order > view.me.sign_order && !s.signed && !s.declined).sort(order)[0];

  function doSign() {
    setErr(null);
    start(async () => {
      if (myFields.length) {
        const f = await fillFields(token, vals);
        if (f.error) { setErr(errMsg(t, f.error)); return; }
      }
      const r = await signContract(token, typed.trim());
      if (r.error) setErr(errMsg(t, r.error));
      else { setDone("signed"); setSignedCompleted(r.completed ?? false); setSignedFiled(r.filed ?? false); }
    });
  }
  function doDecline() {
    setErr(null);
    start(async () => {
      const r = await declineContract(token, reason.trim());
      if (r.error) setErr(errMsg(t, r.error));
      else setDone("declined");
    });
  }

  // ── terminal states ──────────────────────────────────────────────────────
  if (declinedState) return <Banner tone="wine" title={t("declinedTitle")} body={t("declinedBody")} />;
  if (completed) return <Banner tone="sage" title={t("completeTitle")} body={signedFiled ? t("completeFiled") : t("completeBody")} />;
  if (done === "signed") return <Banner tone="sage" title={t("thanksTitle")} body={nextAfterMe ? t("waitingNext", { name: nextAfterMe.name }) : t("thanksBody")} />;
  if (alreadySigned) return <Banner tone="sage" title={t("thanksTitle")} body={nextSigner ? t("waitingNext", { name: nextSigner.name }) : t("thanksBody")} />;
  if (!view.my_turn) return <Banner tone="sand" title={t("notYetTitle")} body={nextSigner ? t("waitingNext", { name: nextSigner.name }) : t("notYetBody")} />;

  // ── the field walk + signature ───────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[var(--radius)] bg-surface-card p-6">
        <h2 className="font-display text-[22px] text-text-primary">{view.contract.title}</h2>
        {view.body ? <p className="mt-3 whitespace-pre-wrap text-[14px] leading-[1.7] text-text-primary-soft">{substituteBody(view.body, Object.fromEntries(view.fields.map((f) => [f.key, f.value])))}</p> : null}
      </div>

      {myFields.length ? (
        <div className="rounded-[var(--radius)] bg-surface-card p-6">
          <p className="mb-3 text-[11px] uppercase tracking-[0.12em] text-text-meta">{t("yourFields")}</p>
          <div className="flex flex-col gap-3">
            {myFields.map((f) => (
              <label key={f.id} className="flex flex-col gap-1">
                <span className="text-[13px] text-text-meta">{f.label}{f.required ? " *" : ""}</span>
                <input value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} className={input} />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-[var(--radius)] bg-surface-card p-6">
        <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-text-meta">{t("signHere")}</p>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={view.me.name} className={cx(input, "font-accent text-[20px] italic")} />
        {err ? <p className="mt-2 text-[13px] text-[color:var(--color-text-danger)]">{err}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={pending || !typed.trim()} onClick={doSign}>{t("signAction")}</Button>
          <Button variant="ghost" disabled={pending} onClick={() => setDeclining((v) => !v)}>{t("declineAction")}</Button>
        </div>
        {declining ? (
          <div className="mt-3 flex flex-col gap-2 border-t border-hairline-token pt-3">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={t("declineReason")} className={input} />
            <div><Button variant="ghost" disabled={pending} onClick={doDecline}>{t("confirmDecline")}</Button></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Banner({ tone, title, body }: { tone: "sage" | "wine" | "sand"; title: string; body: string }) {
  const bg = tone === "sage" ? "bg-surface-card text-teal" : tone === "wine" ? "bg-surface-card text-[color:var(--color-text-danger)]" : "bg-surface-card text-taupe";
  return (
    <div className={cx("rounded-[var(--radius)] p-8 text-center", bg)}>
      <p className="font-display text-[22px]">{title}</p>
      <p className="mt-1.5 font-accent text-[15px]">{body}</p>
    </div>
  );
}
