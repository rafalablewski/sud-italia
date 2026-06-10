import type { ReactNode } from "react";

/**
 * The av3 "spotlight minimal" sign-in canvas — the shared shell behind every
 * login door, since all of them do the same job (authenticate, then route):
 *  - the email/password form (`LoginForm` → `/login` + `/admin/login`), and
 *  - the shared-device PIN keypad (`/terminal`).
 *
 * It renders the bare canvas (`.av3-auth`), the centred column, the platinum
 * corner bracket and the brand lockup (mark + Ottaviano wordmark + the portal
 * `eyebrow`). Callers drop their controls in as `children` and the cross-door
 * links in `footer`, so the chrome stays identical across doors and only the
 * body differs. CSS: `themes/admin-v3/index.css` §23 (`.av3-auth*`).
 */
export function AuthShell({
  eyebrow,
  children,
  footer,
}: {
  /** Portal label under the wordmark, e.g. "Owner console" / "Staff terminal". */
  eyebrow: string;
  /** The door's controls — the sign-in form or the PIN keypad. */
  children: ReactNode;
  /** Cross-door links rendered in `.av3-auth-foot`. */
  footer: ReactNode;
}) {
  return (
    <div className="av3-auth">
      <div className="av3-auth-col">
        <div className="av3-auth-frame">
          <div className="av3-auth-lockup">
            <span className="av3-auth-mark">SI</span>
            <div>
              <div className="av3-auth-wordmark">Ottaviano</div>
              <div className="av3-auth-eyebrow">{eyebrow}</div>
            </div>
          </div>

          {children}
        </div>

        <div className="av3-auth-foot">{footer}</div>
      </div>
    </div>
  );
}
