import SwiftUI

// Shared Core date picker — the native twin of web `CoreDateField`
// (src/core/shell/CoreDateField.tsx). A ‹ day · face · › day stepper whose face
// opens a sheet with quick chips (Today / Tomorrow / +1 week) and a Monday-first
// month grid; marked days carry a basil dot. Used by Service · Book and
// Service · Slots. The value is an ISO `yyyy-MM-dd` string, so it drops straight
// into the `date=` query the facade reads — no Date round-tripping at call sites.

/// Date-only helpers over a single ISO `yyyy-MM-dd` contract. Local-calendar
/// based (the restaurant's own day), so "today" and day-stepping match the till.
public enum CoreDay {
    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = .current
        return c
    }
    private static let isoFmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    public static func today() -> String { format(Date()) }
    public static func format(_ date: Date) -> String { isoFmt.string(from: date) }
    /// Parse an ISO day to its local start-of-day; falls back to today on garbage.
    public static func parse(_ iso: String) -> Date {
        guard let d = isoFmt.date(from: iso) else { return calendar.startOfDay(for: Date()) }
        return calendar.startOfDay(for: d)
    }
    public static func add(_ iso: String, days: Int) -> String {
        format(calendar.date(byAdding: .day, value: days, to: parse(iso)) ?? parse(iso))
    }
    /// Whole-day delta from today (negative = past).
    public static func offsetFromToday(_ iso: String) -> Int {
        calendar.dateComponents([.day], from: parse(today()), to: parse(iso)).day ?? 0
    }

    // ── Time-of-day helpers (for the Book timeline + Arrivals split) ──────────
    /// Current wall-clock as `HH:mm` in the restaurant's local day.
    public static func nowHM() -> String { hm(nowMinutes()) }
    /// Minute-of-day now (0…1439), local.
    public static func nowMinutes() -> Int {
        let c = calendar.dateComponents([.hour, .minute], from: Date())
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }
    /// Parse `HH:mm` → minute-of-day (0 on garbage).
    public static func minutes(_ hhmm: String) -> Int {
        let p = hhmm.split(separator: ":")
        guard p.count == 2, let h = Int(p[0]), let m = Int(p[1]) else { return 0 }
        return h * 60 + m
    }
    /// Minute-of-day → `HH:mm`.
    public static func hm(_ minutes: Int) -> String {
        let m = max(0, minutes)
        return String(format: "%02d:%02d", m / 60, m % 60)
    }

    public static func face(_ iso: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_GB")
        f.timeZone = .current
        f.dateFormat = "EEE d MMM" // "Sun 5 Jul"
        return f.string(from: parse(iso))
    }
    public static func relative(_ iso: String) -> String {
        let n = offsetFromToday(iso)
        switch n {
        case 0: return "today"
        case 1: return "tomorrow"
        case -1: return "yesterday"
        default: return n > 0 ? "+\(n)d" : "\(n)d"
        }
    }
}

public struct OperatorDateField: View {
    @Environment(\.theme) private var theme
    @Binding private var iso: String
    private let label: String
    private let marked: Set<String>
    @State private var showSheet = false

    public init(_ iso: Binding<String>, label: String = "Day", marked: Set<String> = []) {
        _iso = iso; self.label = label; self.marked = marked
    }

    public var body: some View {
        HStack(spacing: 6) {
            step("chevron.left") { iso = CoreDay.add(iso, days: -1) }
            Button { showSheet = true } label: {
                HStack(spacing: 6) {
                    Image(systemName: "calendar").font(.caption)
                    Text(CoreDay.face(iso)).font(.subheadline.weight(.semibold)).monospacedDigit()
                    Text(CoreDay.relative(iso)).font(.caption2).foregroundStyle(theme.color.textSecondary)
                    Image(systemName: "chevron.down").font(.caption2).foregroundStyle(theme.color.textSecondary)
                }
                .foregroundStyle(theme.color.textPrimary)
                .padding(.horizontal, theme.space.md).frame(height: 34)
                .background(theme.color.surface2, in: Capsule())
                .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(label): \(CoreDay.face(iso)), \(CoreDay.relative(iso))")
            step("chevron.right") { iso = CoreDay.add(iso, days: 1) }
        }
        .sheet(isPresented: $showSheet) {
            OperatorDateSheet(iso: $iso, marked: marked)
                .presentationDetents([.medium, .large])
        }
    }

    private func step(_ icon: String, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Image(systemName: icon).font(.caption.weight(.semibold))
                .foregroundStyle(theme.color.textSecondary)
                .frame(width: 34, height: 34)
                .background(theme.color.surface2, in: Circle())
                .overlay(Circle().strokeBorder(theme.color.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// The month-grid sheet: stepper header, quick chips, Monday-first calendar.
private struct OperatorDateSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @Binding var iso: String
    let marked: Set<String>
    /// The month currently shown in the grid (browsing doesn't move the value).
    @State private var monthAnchor: Date = Date()

    private let dow = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

    var body: some View {
        VStack(alignment: .leading, spacing: theme.space.lg) {
            header
            chips
            Divider().overlay(theme.color.line)
            calHead
            grid
            Spacer(minLength: 0)
        }
        .padding(theme.space.lg)
        .background(theme.color.surface)
        .onAppear { monthAnchor = CoreDay.parse(iso) }
    }

    private var header: some View {
        HStack {
            monthStep("chevron.left", -1)
            Spacer()
            VStack(spacing: 2) {
                Text(weekdayLong(iso)).font(.caption2.weight(.bold)).tracking(0.6)
                    .foregroundStyle(theme.color.textSecondary)
                Text(dayNumber(iso)).font(.system(.largeTitle, design: .rounded).weight(.bold))
                    .foregroundStyle(theme.color.textPrimary).monospacedDigit()
                Text(monthYear(CoreDay.parse(iso))).font(.caption).foregroundStyle(theme.color.textSecondary)
            }
            Spacer()
            monthStep("chevron.right", 1)
        }
    }

    private var chips: some View {
        HStack(spacing: theme.space.sm) {
            chip("Today", offset: 0)
            chip("Tomorrow", offset: 1)
            chip("+1 week", offset: 7)
        }
    }

    private func chip(_ title: String, offset: Int) -> some View {
        let target = CoreDay.add(CoreDay.today(), days: offset)
        let on = iso == target
        return Button {
            iso = target; dismiss()
        } label: {
            Text(title).font(.caption.weight(.semibold))
                .padding(.horizontal, theme.space.md).frame(height: 32)
                .foregroundStyle(on ? theme.color.onAccent : theme.color.textPrimary)
                .background(on ? theme.color.accent : theme.color.surface2, in: Capsule())
                .overlay(Capsule().strokeBorder(theme.color.line, lineWidth: on ? 0 : 1))
        }
        .buttonStyle(.plain)
    }

    private var calHead: some View {
        HStack {
            Text(monthYear(monthAnchor)).font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.color.textPrimary)
            Spacer()
            HStack(spacing: theme.space.xs) {
                monthStep("chevron.left", -1)
                monthStep("chevron.right", 1)
            }
        }
    }

    private var grid: some View {
        VStack(spacing: 6) {
            HStack(spacing: 0) {
                ForEach(dow, id: \.self) { d in
                    Text(d).font(.caption2.weight(.bold)).foregroundStyle(theme.color.textSecondary)
                        .frame(maxWidth: .infinity)
                }
            }
            let cells = monthCells(monthAnchor)
            ForEach(0..<6, id: \.self) { row in
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { col in
                        cellView(cells[row * 7 + col])
                    }
                }
            }
        }
    }

    private struct Cell: Hashable { let iso: String; let inMonth: Bool; let day: Int }

    private func cellView(_ c: Cell) -> some View {
        let isSel = c.iso == iso
        let isToday = c.iso == CoreDay.today()
        let isMarked = marked.contains(c.iso)
        return Button {
            iso = c.iso; dismiss()
        } label: {
            VStack(spacing: 2) {
                Text("\(c.day)").font(.callout.weight(isSel ? .bold : .regular)).monospacedDigit()
                    .foregroundStyle(isSel ? theme.color.onAccent
                                     : c.inMonth ? theme.color.textPrimary : theme.color.textSecondary.opacity(0.4))
                Circle().fill(isMarked && c.inMonth ? theme.color.success : .clear).frame(width: 4, height: 4)
            }
            .frame(maxWidth: .infinity).frame(height: 40)
            .background(
                isSel ? theme.color.accent
                : isToday ? theme.color.surface2 : .clear,
                in: RoundedRectangle(cornerRadius: theme.radius.sm, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius.sm, style: .continuous)
                    .strokeBorder(isToday && !isSel ? theme.color.accent.opacity(0.5) : .clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func monthStep(_ icon: String, _ delta: Int) -> some View {
        Button {
            monthAnchor = CoreDay.calendar.date(byAdding: .month, value: delta, to: monthAnchor) ?? monthAnchor
        } label: {
            Image(systemName: icon).font(.caption.weight(.semibold)).foregroundStyle(theme.color.textSecondary)
                .frame(width: 32, height: 32)
                .background(theme.color.surface2, in: Circle())
                .overlay(Circle().strokeBorder(theme.color.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    // MARK: date math

    private func monthCells(_ anchor: Date) -> [Cell] {
        let cal = CoreDay.calendar
        let comps = cal.dateComponents([.year, .month], from: anchor)
        let firstOfMonth = cal.date(from: comps) ?? anchor
        let weekday = cal.component(.weekday, from: firstOfMonth) // Sun=1…Sat=7
        let startPad = (weekday - 2 + 7) % 7                      // Monday-first
        let start = cal.date(byAdding: .day, value: -startPad, to: firstOfMonth) ?? firstOfMonth
        let shownMonth = cal.component(.month, from: firstOfMonth)
        return (0..<42).map { i in
            let d = cal.date(byAdding: .day, value: i, to: start) ?? start
            return Cell(iso: CoreDay.format(d), inMonth: cal.component(.month, from: d) == shownMonth,
                        day: cal.component(.day, from: d))
        }
    }

    private func weekdayLong(_ iso: String) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_GB"); f.timeZone = .current
        f.dateFormat = "EEEE"; return f.string(from: CoreDay.parse(iso)).uppercased()
    }
    private func dayNumber(_ iso: String) -> String { "\(CoreDay.calendar.component(.day, from: CoreDay.parse(iso)))" }
    private func monthYear(_ date: Date) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_GB"); f.timeZone = .current
        f.dateFormat = "MMMM yyyy"; return f.string(from: date)
    }
}
