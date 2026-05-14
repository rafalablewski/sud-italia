import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import {
  clearTeamConfig,
  listTeamWallets,
  setTeamConfig,
  getPublicTeamRollup,
} from "@/lib/store";

/**
 * Admin team management (audit §3.4).
 *
 * GET — list every team-configured wallet with the public rollup snapshot
 *       so the admin page renders headline pool + member count without
 *       extra round trips.
 * PUT — promote a wallet to a team or update an existing team's config.
 *       Body: { walletId, slug, name, billingEmail?, headBonusBps,
 *               autoPreorderDay?, autoPreorderTime?, locationSlug? }
 * DELETE — remove the team config from a wallet (the wallet itself stays
 *          intact as a regular family wallet).
 */
export const GET = withAdmin({}, async () => {
  const wallets = await listTeamWallets();
  const summaries = await Promise.all(
    wallets.map(async (w) => {
      const rollup = w.team ? await getPublicTeamRollup(w.team.slug) : null;
      return {
        walletId: w.id,
        headPhone: w.headPhone,
        team: w.team ?? null,
        memberCount: w.members.length,
        rollup,
      };
    }),
  );
  return NextResponse.json({ teams: summaries });
});

export const PUT = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    let body: {
      walletId?: string;
      slug?: string;
      name?: string;
      billingEmail?: string;
      headBonusBps?: number;
      autoPreorderDay?: number;
      autoPreorderTime?: string;
      locationSlug?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const walletId = body.walletId?.trim();
    if (!walletId) {
      return NextResponse.json({ error: "walletId required" }, { status: 400 });
    }
    const result = await setTeamConfig(walletId, {
      slug: body.slug ?? "",
      name: body.name ?? "",
      billingEmail: body.billingEmail,
      headBonusBps: typeof body.headBonusBps === "number" ? body.headBonusBps : 2000,
      autoPreorderDay: body.autoPreorderDay,
      autoPreorderTime: body.autoPreorderTime,
      locationSlug: body.locationSlug,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, team: result.wallet.team });
  },
);

export const DELETE = withAdmin(
  { roles: ["manager", "owner"] },
  async (req) => {
    let walletId = "";
    try {
      const body = await req.json();
      if (typeof body?.walletId === "string") walletId = body.walletId.trim();
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    if (!walletId) {
      return NextResponse.json({ error: "walletId required" }, { status: 400 });
    }
    const result = await clearTeamConfig(walletId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  },
);
