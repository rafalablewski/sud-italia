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

/// The full operator IA. Section order + labels + role gates mirror
/// `NAV_SECTIONS_V3`; the leading Core section mirrors `CoreNav.tsx`.
/// `.live` items are wired to real endpoints today; the rest are parity scaffolds.
public let OPERATOR_NAV: [OperatorNavSection] = [
    OperatorNavSection("core", "Core", [
        OperatorNavItem("/core/pos", "POS", "creditcard.and.123", .staff, .live,
                        "Take counter & table orders, split bills, settle payment."),
        OperatorNavItem("/core/kds", "Kitchen Display", "flame.fill", .kitchen, .live,
                        "Live ticket lanes — bump dishes from cooking to ready."),
        OperatorNavItem("/core/orders", "Orders", "list.bullet.rectangle.portrait", .staff, .live,
                        "Every live order across fulfilment types, in one board."),
        OperatorNavItem("/core/guest", "Guest Engagement", "person.2.fill", .staff, .live,
                        "Bookings, concierge, guest profiles, loyalty and inbox."),
        OperatorNavItem("/core/service", "Service", "fork.knife.circle.fill", .staff, .live,
                        "Floor plan, table turns and reservation slots."),
    ]),
    OperatorNavSection("overview", "Overview", [
        OperatorNavItem("/admin/welcome", "Welcome", "sparkles", .kitchen, .live,
                        "Day-one tour and quick links into the operation."),
        OperatorNavItem("/admin", "Dashboard", "rectangle.3.group.fill", .kitchen, .live,
                        "Today's covers, revenue, prep load and live alerts at a glance."),
        OperatorNavItem("/admin/orders", "Orders", "list.clipboard.fill", .staff, .live,
                        "Operator order spine — filter, inspect, refund, recall."),
        OperatorNavItem("/admin/alerts", "Alerts", "bell.fill", .staff, .live,
                        "Stock-outs, late tickets, SLA breaches and ops nudges."),
        OperatorNavItem("/admin/comms/tasks", "Tasks", "checklist", .manager, .live,
                        "Shift checklists and assigned to-dos with sign-off."),
        OperatorNavItem("/admin/comms/announcements", "Announcements", "megaphone.fill", .manager, .live,
                        "Broadcast notices to the floor and kitchen."),
    ]),
    OperatorNavSection("operations", "Operations", [
        OperatorNavItem("/admin/menu", "Menu", "menucard.fill", .manager, .live,
                        "Per-location menu, availability and 86-ing."),
        OperatorNavItem("/admin/recipes", "Recipes", "flask.fill", .manager, .live,
                        "Chain-wide recipes & ingredient catalogue (one recipe per dish)."),
        OperatorNavItem("/admin/haccp", "HACCP log", "thermometer.medium", .staff, .scaffold,
                        "Fridge & cooking temperature compliance log."),
        OperatorNavItem("/admin/waste", "Waste log", "trash.fill", .staff, .live,
                        "Record spoilage and wastage against par."),
        OperatorNavItem("/admin/handover", "Shift handover", "arrow.left.arrow.right.square.fill", .manager, .live,
                        "End-of-shift notes and open issues for the next lead."),
    ]),
    OperatorNavSection("inventory", "Inventory", [
        OperatorNavItem("/admin/inventory", "Stock", "shippingbox.fill", .staff, .live,
                        "On-hand counts, par levels and variance."),
        OperatorNavItem("/admin/suppliers", "Suppliers", "building.2.fill", .manager, .live,
                        "Vendor catalogue, lead times and pricing."),
        OperatorNavItem("/admin/purchase-orders", "Purchase orders", "doc.text.magnifyingglass", .manager, .live,
                        "Raise, receive and reconcile POs against par."),
    ]),
    OperatorNavSection("people", "People", [
        OperatorNavItem("/admin/staff", "Staff", "person.text.rectangle.fill", .manager, .live,
                        "Team roster, roles and time punches."),
        OperatorNavItem("/admin/schedule", "Schedule", "calendar.badge.clock", .manager, .live,
                        "Rota planning against forecast demand."),
    ]),
    OperatorNavSection("customers", "Customers", [
        OperatorNavItem("/admin/customers", "Customers", "person.crop.circle.fill", .staff, .live,
                        "CRM — profiles, history, segments and consent."),
        OperatorNavItem("/admin/corporate", "Corporate", "briefcase.fill", .manager, .live,
                        "Corporate accounts, pre-orders and invoicing."),
        OperatorNavItem("/admin/feedback", "Feedback", "bubble.left.and.bubble.right.fill", .manager, .live,
                        "Reviews and sentiment, with AI summaries."),
        OperatorNavItem("/admin/surveys", "Pulse surveys", "gauge.medium", .manager, .live,
                        "Guest pulse surveys and response analytics."),
    ]),
    OperatorNavSection("finance", "Finance", [
        OperatorNavItem("/admin/reports", "Reports", "chart.bar.fill", .manager, .live,
                        "Sales, cohort, delivery, tips and JPK exports."),
        OperatorNavItem("/admin/cash", "Cash", "banknote.fill", .manager, .live,
                        "Till counts, drops and reconciliation."),
        OperatorNavItem("/admin/business-costs", "Business costs", "wallet.bifold.fill", .manager, .live,
                        "Fixed & variable costs feeding margin maths."),
        OperatorNavItem("/admin/simulation", "Calculator", "chart.line.uptrend.xyaxis", .manager, .scaffold,
                        "What-if P&L simulator and break-even sandbox."),
    ]),
    OperatorNavSection("growth", "Growth", [
        OperatorNavItem("/admin/growth", "Campaigns", "paperplane.fill", .manager, .live,
                        "Loyalty, referral and win-back campaigns."),
        OperatorNavItem("/admin/upsell", "Upsell", "arrow.up.forward.circle.fill", .manager, .live,
                        "Cart upsell rules and performance."),
        OperatorNavItem("/admin/crosssell", "Cross-sell", "sparkles", .manager, .live,
                        "Pairings — espresso + dessert with every pizza."),
        OperatorNavItem("/admin/scheduled-bundles", "Scheduled bundles", "calendar", .manager, .live,
                        "Time-boxed set-price combos."),
        OperatorNavItem("/admin/events", "Events & bookings", "calendar.badge.plus", .manager, .live,
                        "Private events and large-party bookings."),
        OperatorNavItem("/admin/integrations", "Integrations", "powerplug.fill", .manager, .live,
                        "Aggregators, WhatsApp, payments and webhooks."),
    ]),
    OperatorNavSection("intelligence", "Intelligence", [
        OperatorNavItem("/admin/locations", "Multi-location", "map.fill", .owner, .live,
                        "Cross-location rollup and HQ comparison."),
        OperatorNavItem("/admin/locations/manage", "Manage locations", "mappin.and.ellipse", .owner, .live,
                        "Open, edit and configure each location."),
        OperatorNavItem("/admin/menu-engineering", "Menu engineering", "fork.knife", .manager, .scaffold,
                        "Stars / plowhorses / puzzles / dogs matrix."),
        OperatorNavItem("/admin/agent-hq", "Agent HQ", "cpu.fill", .manager, .scaffold,
                        "Autonomous ops agents and their work queue."),
        OperatorNavItem("/admin/ai", "Insights", "brain.head.profile.fill", .manager, .live,
                        "AI forecasts, anomalies and recommendations."),
        OperatorNavItem("/admin/ai/agent", "Ops Agent", "bot", .manager, .scaffold,
                        "Conversational ops copilot over your data."),
        OperatorNavItem("/admin/expansion", "Expansion", "map", .owner, .live,
                        "Site selection and new-market modelling."),
    ]),
    OperatorNavSection("system", "System", [
        OperatorNavItem("/admin/users", "Users & roles", "checkmark.shield.fill", .owner, .live,
                        "Staff accounts, roles, MFA and WebAuthn."),
        OperatorNavItem("/admin/permissions", "Permission matrix", "square.grid.3x3.fill", .owner, .live,
                        "Granular per-page permission grants."),
        OperatorNavItem("/admin/compliance", "Compliance", "calendar.badge.checkmark", .manager, .live,
                        "Recurring compliance tasks and due dates."),
        OperatorNavItem("/admin/regulatory-compliance", "Regulatory disclosures", "shield.lefthalf.filled", .owner, .scaffold,
                        "Allergen, fiscal and labour disclosures."),
        OperatorNavItem("/admin/soc2", "SOC 2 controls", "lock.shield.fill", .owner, .scaffold,
                        "Control evidence and audit readiness."),
        OperatorNavItem("/admin/audit-log", "Audit log", "clock.arrow.circlepath", .manager, .live,
                        "Immutable trail of every privileged action."),
        OperatorNavItem("/admin/capabilities", "Capabilities", "square.stack.3d.up.fill", .manager, .scaffold,
                        "The deployed-feature ledger (source of truth)."),
        OperatorNavItem("/admin/payments", "Payments", "creditcard.fill", .manager, .live,
                        "Stripe, terminals and payout configuration."),
        OperatorNavItem("/admin/qr-ordering", "QR ordering", "qrcode", .manager, .live,
                        "Table QR codes and at-table ordering."),
        OperatorNavItem("/admin/currency", "Currency", "coloncurrencysign.circle.fill", .owner, .live,
                        "Display currency and FX configuration."),
        OperatorNavItem("/admin/languages", "Languages", "globe", .owner, .live,
                        "Storefront locales and translations."),
        OperatorNavItem("/admin/settings", "Settings", "gearshape.fill", .owner, .live,
                        "Brand, hours, fulfilment and loyalty configuration."),
    ]),
]

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
