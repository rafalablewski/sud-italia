import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { ROLE_RANK } from "@/lib/admin-auth";
import { appendAuditLog, getAdminUserById, updateAdminUserTotp } from "@/lib/store";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { z } from "zod";
import { parseBody } from "@/lib/api-schemas";

/**
 * Per-user TOTP MFA enrollment for admin accounts.
 *
 *   POST { action: "begin" }            → generates a secret (not yet enabled),
 *                                         returns the otpauth URI + secret to
 *                                         add to an authenticator app.
 *   POST { action: "enable", token }    → confirms a code, turns MFA on.
 *   POST { action: "disable", token? }  → turns MFA off and clears the secret.
 *
 * Authorization: a user manages their OWN MFA (begin/enable). Disable is
 * allowed for self (with a valid code) or for an owner (device-loss recovery).
 */
const mfaSchema = z.object({
  action: z.enum(["begin", "enable", "disable"]),
  token: z.string().regex(/^\d{6}$/).optional().or(z.literal("")),
});

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdmin<Ctx>({}, async (req: NextRequest, ctx, { user }) => {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, mfaSchema);
  if ("error" in parsed) return parsed.error;
  const { action, token } = parsed.data;

  const target = await getAdminUserById(id);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const isSelf = user.id === id;
  const isOwner = ROLE_RANK[user.role] >= ROLE_RANK.owner;

  if (action === "begin" || action === "enable") {
    // You can only enroll your own authenticator — an owner can't bind a code
    // to someone else's phone.
    if (!isSelf) {
      return NextResponse.json({ error: "You can only enroll your own MFA" }, { status: 403 });
    }
  } else if (action === "disable") {
    if (!isSelf && !isOwner) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  if (action === "begin") {
    const secret = generateTotpSecret();
    await updateAdminUserTotp(id, { totpSecret: secret, totpEnabled: false });
    await appendAuditLog({
      actor: user.email || user.id,
      action: "users.mfa_begin",
      entityType: "admin_user",
      entityId: id,
    });
    return NextResponse.json({
      secret,
      uri: totpUri(secret, target.email || target.name || id),
    });
  }

  if (action === "enable") {
    if (!target.totpSecret) {
      return NextResponse.json({ error: "Start enrollment first" }, { status: 409 });
    }
    if (!token || !verifyTotp(target.totpSecret, token)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }
    await updateAdminUserTotp(id, { totpEnabled: true });
    await appendAuditLog({
      actor: user.email || user.id,
      action: "users.mfa_enable",
      entityType: "admin_user",
      entityId: id,
    });
    return NextResponse.json({ ok: true, totpEnabled: true });
  }

  // disable — a self-disable still requires a current code so a hijacked
  // session can't quietly strip MFA; an owner can force-disable for recovery.
  if (isSelf && !isOwner) {
    if (!target.totpEnabled) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 409 });
    }
    if (!token || !target.totpSecret || !verifyTotp(target.totpSecret, token)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }
  }
  await updateAdminUserTotp(id, { totpSecret: null, totpEnabled: false });
  await appendAuditLog({
    actor: user.email || user.id,
    action: "users.mfa_disable",
    entityType: "admin_user",
    entityId: id,
  });
  return NextResponse.json({ ok: true, totpEnabled: false });
});
