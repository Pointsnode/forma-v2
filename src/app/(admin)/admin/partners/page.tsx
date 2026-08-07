import { loadPartners, loadAttributions } from "@/lib/admin/commissions";
import { loadAccounts } from "@/lib/admin/billing";
import { adminGate } from "@/lib/admin/guard";
import { PartnersManager } from "@/components/admin/partners-manager";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const [partners, attributions, accounts, gate] = await Promise.all([loadPartners(), loadAttributions(), loadAccounts(), adminGate()]);
  const isOwner = gate.state === "ok" && gate.role === "owner";
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[26px] text-ink">Partners</h1>
      <PartnersManager
        partners={partners}
        attributions={attributions}
        accounts={accounts.map((a) => ({ workspace_id: a.workspace_id, name: a.name }))}
        isOwner={isOwner}
      />
    </div>
  );
}
