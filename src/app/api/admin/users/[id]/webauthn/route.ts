import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import { ROLE_RANK } from "@/lib/admin-auth";
import {
  addAdminUserWebauthnCredential,
  appendAuditLog,
  getAdminUserById,
  removeAdminUserWebauthnCredential,
  setAdminUserWebauthnChallenge,
} from "@/lib/store";
import { getRpConfig, WEBAUTHN_RP_NAME } from "@/lib/webauthn";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

/**
 * Passkey / hardware-key (YubiKey) enrollment + management for an admin
 * account.
 *
 *   POST { action: "register-begin" }                 → registration options.
 *   POST { action: "register-finish", response, name } → verify + store.
 *   POST { action: "delete", credentialId }            → remove a key.
 *
 * Authorization mirrors MFA: you can only enroll a key on YOUR OWN session
 * (the authenticator is physically yours). An owner may delete someone else's
 * key for device-loss recovery.
 */
type Ctx = { params: Promise<{ id: string }> };

export const POST = withAdmin<Ctx>({}, async (req: NextRequest, ctx, { user }) => {
  const { id } = await ctx.params;
  const target = await getAdminUserById(id);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const isSelf = user.id === id;
  const isOwner = ROLE_RANK[user.role] >= ROLE_RANK.owner;

  let body: { action?: string; response?: unknown; name?: string; credentialId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { action } = body;

  if (action === "delete") {
    if (!isSelf && !isOwner) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    if (!body.credentialId) {
      return NextResponse.json({ error: "Missing credentialId" }, { status: 400 });
    }
    await removeAdminUserWebauthnCredential(id, body.credentialId);
    await appendAuditLog({
      actor: user.email || user.id,
      action: "users.webauthn_delete",
      entityType: "admin_user",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  }

  // Enrollment is self-only — an owner can't bind a key they don't hold.
  if (!isSelf) {
    return NextResponse.json({ error: "You can only enroll your own security key" }, { status: 403 });
  }

  const { rpID, origin } = getRpConfig(req);

  if (action === "register-begin") {
    const existing = target.webauthnCredentials ?? [];
    const options = await generateRegistrationOptions({
      rpName: WEBAUTHN_RP_NAME,
      rpID,
      userName: target.email || target.name || target.id,
      userDisplayName: target.name || target.email || target.id,
      // The credential ID is the authenticator handle; the user handle just
      // needs to be stable + unique per account.
      userID: new TextEncoder().encode(target.id),
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: c.id,
        transports: c.transports as AuthenticatorTransportFuture[] | undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });
    await setAdminUserWebauthnChallenge(id, options.challenge);
    return NextResponse.json(options);
  }

  if (action === "register-finish") {
    if (!target.currentWebauthnChallenge) {
      return NextResponse.json({ error: "Start enrollment first" }, { status: 409 });
    }
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body.response as RegistrationResponseJSON,
        expectedChallenge: target.currentWebauthnChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
      });
    } catch (err) {
      await setAdminUserWebauthnChallenge(id, null);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Verification failed" },
        { status: 400 },
      );
    }
    if (!verification.verified || !verification.registrationInfo) {
      await setAdminUserWebauthnChallenge(id, null);
      return NextResponse.json({ error: "Could not verify key" }, { status: 400 });
    }
    const { credential } = verification.registrationInfo;
    await addAdminUserWebauthnCredential(id, {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: credential.counter,
      transports: credential.transports,
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 60) : "Security key",
      createdAt: new Date().toISOString(),
    });
    await appendAuditLog({
      actor: user.email || user.id,
      action: "users.webauthn_register",
      entityType: "admin_user",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
});

// Type-only imports kept at the bottom so the runtime bundle stays lean.
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
