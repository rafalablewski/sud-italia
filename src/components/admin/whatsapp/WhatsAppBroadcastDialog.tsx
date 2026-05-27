"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { Button, Dialog, Input, Select } from "../v2/ui";
import { useToast } from "../v2/ui/Toast";

/**
 * Broadcast campaigns: send an approved Meta template to an opted-in customer
 * segment. The audience snapshot + send progress live server-side; this dialog
 * drives the batched send by calling the per-campaign send endpoint until the
 * campaign is done, so progress is real and survives a reload.
 */

interface Audience {
  key: string;
  label: string;
  hint: string;
  count: number;
}
interface Campaign {
  id: string;
  template: string;
  audienceLabel: string;
  phones: string[];
  cursor: number;
  sentCount: number;
  failedCount: number;
  status: "sending" | "done" | "cancelled";
  createdAt: string;
}

export function WhatsAppBroadcastDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [audienceKey, setAudienceKey] = useState("active");
  const [template, setTemplate] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/whatsapp/broadcasts");
      if (res.ok) {
        const d = (await res.json()) as { campaigns: Campaign[]; audiences: Audience[] };
        setCampaigns(d.campaigns);
        setAudiences(d.audiences);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Drive a campaign to completion one batch at a time.
  const drive = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        for (let guard = 0; guard < 1000; guard++) {
          const res = await fetch(`/api/admin/whatsapp/broadcasts/${id}/send`, { method: "POST" });
          if (!res.ok) {
            toast.error("Send failed", "Check the template name in Meta Business Suite.");
            break;
          }
          const { campaign } = (await res.json()) as { campaign: Campaign };
          setCampaigns((prev) => prev.map((c) => (c.id === id ? campaign : c)));
          if (campaign.status !== "sending") {
            toast.success(`Campaign done · ${campaign.sentCount} sent`);
            break;
          }
        }
      } finally {
        setBusyId(null);
      }
    },
    [toast],
  );

  const create = useCallback(async () => {
    if (!template.trim()) {
      toast.warning("Enter a Meta template name");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/whatsapp/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: template.trim(), audienceKey }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Could not create campaign", d?.error || "Try again.");
        return;
      }
      const campaign = (d as { campaign: Campaign }).campaign;
      setCampaigns((prev) => [campaign, ...prev]);
      setTemplate("");
      if (campaign.phones.length === 0) {
        toast.warning("No customers matched that audience");
      } else {
        toast.success(`Campaign queued · ${campaign.phones.length} recipients`);
        void drive(campaign.id);
      }
    } finally {
      setCreating(false);
    }
  }, [template, audienceKey, toast, drive]);

  const selected = audiences.find((a) => a.key === audienceKey);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Broadcast campaign"
      description="Send an approved Meta template to an opted-in customer segment. Opted-out customers are always excluded. Sends run in batches; you can leave — the daily job finishes anything left."
    >
      <div className="wa-bc">
        <div className="wa-bc-compose">
          <label className="block">
            <span className="admin-text text-xs uppercase tracking-wide block mb-1">Audience</span>
            <Select
              value={audienceKey}
              onChange={(e) => setAudienceKey(e.target.value)}
              options={audiences.map((a) => ({
                value: a.key,
                label: `${a.label} (${a.count})`,
              }))}
            />
            {selected && <p className="admin-text-secondary text-xs mt-1">{selected.hint}</p>}
          </label>
          <label className="block">
            <span className="admin-text text-xs uppercase tracking-wide block mb-1">
              Meta template name
            </span>
            <Input
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="sud_italia_weekend_promo"
            />
          </label>
          <Button
            variant="primary"
            onClick={create}
            disabled={creating || !template.trim() || (selected?.count ?? 0) === 0}
            leadingIcon={<Megaphone className="h-4 w-4" />}
          >
            {creating
              ? "Starting…"
              : `Send to ${selected?.count ?? 0} customer${(selected?.count ?? 0) === 1 ? "" : "s"}`}
          </Button>
        </div>

        <div className="wa-bc-list">
          <div className="wa-cfg-sec-title">Recent campaigns</div>
          {loading && campaigns.length === 0 ? (
            <p className="admin-text-secondary text-sm">Loading…</p>
          ) : campaigns.length === 0 ? (
            <p className="admin-text-secondary text-sm">No campaigns yet.</p>
          ) : (
            campaigns.map((c) => {
              const total = c.phones.length;
              const pct = total > 0 ? Math.round((c.cursor / total) * 100) : 100;
              return (
                <div key={c.id} className="wa-bc-row">
                  <div className="wa-bc-row-head">
                    <span className="wa-bc-tmpl">{c.template}</span>
                    <span className={`wa-bc-status ${c.status}`}>{c.status}</span>
                  </div>
                  <div className="wa-bc-meta">
                    {c.audienceLabel} · {c.sentCount}/{total} sent
                    {c.failedCount > 0 ? ` · ${c.failedCount} failed` : ""}
                  </div>
                  <div className="wa-fa-track">
                    <div className="wa-fa-fill" style={{ width: `${pct}%` }} />
                  </div>
                  {c.status === "sending" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void drive(c.id)}
                      disabled={busyId === c.id}
                      leadingIcon={<Send className="h-3.5 w-3.5" />}
                    >
                      {busyId === c.id ? "Sending…" : "Resume"}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Dialog>
  );
}
