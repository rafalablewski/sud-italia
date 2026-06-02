import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  LOCATION_SCOPE_ALL,
} from "@/lib/admin-auth";
import {
  appendAuditLog,
  getAdminUserByEmail,
  updateWebauthnCredentialCounter,
} from "@/lib/store";
import {
  clearLoginChallengeCookie,
  getRpConfig,
  readLoginChallengeCookie,
  setLoginChallengeCookie,
} from "@/lib/webauthn";
import { landingPathForRole } from "@/lib/staff-roles";
import { enforceRateLimit, getClientIp, isAdminIpAllowed } from "@/lib/rate-limit";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { logger } from "@/lib/logger";

/**
 * Passwordless login with a registered passkey / security key (YubiKey).
 *
 *   POST { action: "begin", email }              → authentication options
 *                                                  (challenge stashed in a
 *                                                  signed cookie).
 *   POST { action: "finish", email, response }   → verify the assertion and
 *                                                  mint the same signed,
 *                                                  location-scoped session as
 *                                                  the password/PIN paths.
 *
 * Phishing-resistant: the assertion is bound to the rpID + origin, so a
 * lookalike domain can't replay it. Routed by role like every other door.
 */
export async function POST(req: NextRequest) {
  if (!isAdminIpAllowed(getClientIp(req))) {
    return NextResponse.json(
      { error: "Access from this network is not allowed" },
      { status: 403 },
    );
  }
  const rl = await enforceRateLimit({
    key: "admin-login",
    id: getClientIp(req),
    limit: 5,
    windowSec: 60,
  });
  if (rl) return rl;

  let body: { action?: string; email?: unknown; response?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const { rpID, origin } = getRpConfig(req);

  try {
    const user = await getAdminUserByEmail(email);
    const creds = user?.status === "active" ? user.webauthnCredentials ?? [] : [];

    if (body.action === "begin") {
      if (!user || creds.length === 0) {
        return NextResponse.json(
          { error: "No security key registered for this email." },
          { status: 404 },
        );
      }
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: creds.map((c) => ({
          id: c.id,
          transports: c.transports as AuthenticatorTransportFuture[] | undefined,
        })),
        userVerification: "preferred",
      });
      const res = NextResponse.json(options);
      setLoginChallengeCookie(res, options.challenge, email);
      return res;
    }

    if (body.action === "finish") {
      const expectedChallenge = readLoginChallengeCookie(req, email);
      const fail = (status: number, error: string) => {
        const res = NextResponse.json({ error }, { status });
        clearLoginChallengeCookie(res);
        return res;
      };
      if (!expectedChallenge) return fail(400, "Challenge expired — try again.");
      if (!user || creds.length === 0) return fail(401, "Authentication failed");

      const response = body.response as AuthenticationResponseJSON;
      const cred = creds.find((c) => c.id === response?.id);
      if (!cred) return fail(401, "Unrecognized security key");

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserVerification: false,
          credential: {
            id: cred.id,
            publicKey: new Uint8Array(Buffer.from(cred.publicKey, "base64")),
            counter: cred.counter,
            transports: cred.transports as AuthenticatorTransportFuture[] | undefined,
          },
        });
      } catch (err) {
        return fail(401, err instanceof Error ? err.message : "Authentication failed");
      }
      if (!verification.verified) return fail(401, "Authentication failed");

      await updateWebauthnCredentialCounter(
        user.id,
        cred.id,
        verification.authenticationInfo.newCounter,
      );

      const locationScope =
        user.role === "owner" || !user.locationSlug
          ? LOCATION_SCOPE_ALL
          : user.locationSlug;
      const token = createSession(user.id, locationScope);

      await appendAuditLog({
        actor: user.email || user.id,
        action: "auth.login.webauthn",
        entityType: "admin_user",
        entityId: user.id,
        after: { role: user.role, locationScope },
      });

      const res = NextResponse.json({
        success: true,
        role: user.role,
        landing: landingPathForRole(user.role),
      });
      clearLoginChallengeCookie(res);
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE,
        path: "/",
      });
      return res;
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    logger.error("webauthn.authenticate.failed", { layer: "api.webauthn" }, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import type {
  AuthenticatorTransportFuture,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
