import Foundation

// The operator (OttavianoKDS) information architecture — a 1:1 Swift mirror of the
// web admin nav (`src/admin-v3/nav.config.ts`) plus the Core surfaces
// (`src/core/shell/CoreNav.tsx`). This is the contract that makes the kitchen app
// reach layout parity with the web: "OttavianoKDS has everything admin and core
// has." The sidebar in `OperatorRootView` is generated from `OPERATOR_NAV` and
// role-filtered by `filteredNav(for:)`, exactly like `filterNavForRoleV3` gates
// the web rail. Keep this list in lockstep with the web nav config.

/// Staff roles, ranked, mirroring `src/lib/admin-roles.ts` (`ROLE_RANK`).
/// The login panel resolves a `role` string from `/api/v1/auth/login`; the nav
/// then shows only what that rank unlocks — owner/admin sees all, a franchise
/// manager sees their scope, a chef (kitchen) sees the line surfaces.
public enum OperatorRole: String, Sendable, CaseIterable {
    case owner, franchisee, manager, staff, kitchen

    /// Same numeric ranks as the web (`ROLE_RANK`): a higher rank unlocks more.
    public var rank: Int {
        switch self {
        case .owner: 100
        case .franchisee: 70
        case .manager: 50
        case .staff: 20
        case .kitchen: 10
        }
    }

    /// Map a server role string (which may be unknown/legacy) onto the rank table.
    /// Unknown strings fall to the lowest rank so a surface is never wrongly shown.
    public static func from(_ raw: String?) -> OperatorRole {
        guard let raw, let role = OperatorRole(rawValue: raw.lowercased()) else { return .kitchen }
        return role
    }

    /// Human label for the account header.
    public var displayName: String {
        switch self {
        case .owner: "Owner"
        case .franchisee: "Franchisee"
        case .manager: "Manager"
        case .staff: "Staff"
        case .kitchen: "Kitchen"
        }
    }
}

/// One navigable operator surface. `id` mirrors the web href so deep-links and
/// analytics line up; `kind` says whether the native app renders the surface live
/// or as a parity scaffold pending `/api/v1` coverage (ARCHITECTURE §5 — the
/// facade grows surface by surface).
public struct OperatorNavItem: Identifiable, Hashable, Sendable {
    public enum Kind: Sendable, Hashable {
        /// Rendered natively with live data off `/api/v1`.
        case live
        /// Layout-parity surface; data wiring tracks the facade's expansion.
        case scaffold
    }
    /// The web href this surface mirrors (e.g. `/admin/orders`, `/core/pos`).
    public let id: String
    public let label: String
    /// SF Symbol closest to the web's lucide glyph.
    public let icon: String
    public let requiredRole: OperatorRole
    public let kind: Kind
    /// One-line purpose, shown on the surface header (matches the web page intent).
    public let blurb: String

    public init(_ id: String, _ label: String, _ icon: String, _ requiredRole: OperatorRole,
                _ kind: Kind = .scaffold, _ blurb: String = "") {
        self.id = id; self.label = label; self.icon = icon
        self.requiredRole = requiredRole; self.kind = kind; self.blurb = blurb
    }
}

public struct OperatorNavSection: Identifiable, Sendable {
    public let id: String
    public let label: String
    public let items: [OperatorNavItem]
    public init(_ id: String, _ label: String, _ items: [OperatorNavItem]) {
        self.id = id; self.label = label; self.items = items
    }
}

/// The full operator IA (`OPERATOR_NAV`) is **generated**, not hand-written, into
/// `OperatorNav.generated.swift` by `scripts/gen-native-nav.ts` in the backend
/// repo. Its structure (sections, order, labels, hrefs, role gates) is read live
/// from the web nav (`src/admin-v3/nav.config.ts` + `src/core/routes.ts`) and its
/// presentation (SF Symbol, blurb, live/scaffold) from
/// `docs/native/parity/operator-nav.overlay.json`. CI fails on drift
/// (`npm run check:native`), so this list can no longer fall behind the web admin.
/// Edit the web nav or the overlay and regenerate — never edit the generated file.

/// Filter the IA for a viewer's role rank — the native twin of `filterNavForRoleV3`.
/// Empty sections are dropped so the rail never shows a hollow header.
public func filteredNav(for role: OperatorRole) -> [OperatorNavSection] {
    let rank = role.rank
    return OPERATOR_NAV.compactMap { section in
        let items = section.items.filter { $0.requiredRole.rank <= rank }
        return items.isEmpty ? nil : OperatorNavSection(section.id, section.label, items)
    }
}

/// Lookup by href id (deep links, restoration).
public func operatorNavItem(id: String) -> OperatorNavItem? {
    OPERATOR_NAV.flatMap(\.items).first { $0.id == id }
}
