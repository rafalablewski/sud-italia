"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, ClipboardList, LayoutDashboard, LogOut, BarChart3, Bell, UtensilsCrossed, FlaskConical, Settings } from "lucide-react";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/admin/recipes", label: "Recipes", icon: FlaskConical },
  { href: "/admin/slots", label: "Slots", icon: CalendarDays },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const fetchCount = () =>
      fetch("/api/admin/notifications?count=true")
        .then((r) => r.json())
        .then((d) => setUnread(d.unread || 0))
        .catch(() => {});
    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  return (
    <nav className="glass-nav sticky top-0 z-50 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-5">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-italia-red to-italia-red-dark flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-italia-red/20">
              SI
            </span>
            <span className="font-heading font-bold text-base admin-text hidden sm:block">
              Sud Italia
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white/12 text-white shadow-sm shadow-white/5"
                      : "text-slate-400 hover:text-white hover:bg-white/6"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Link
            href="/admin#notifications"
            className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/6 transition-all duration-200"
          >
            <Bell className="h-4.5 w-4.5" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-italia-red text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-lg shadow-italia-red/30 animate-pulse">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/6 transition-all duration-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="flex lg:hidden items-center gap-0.5 mt-2 overflow-x-auto scrollbar-hide pb-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? "bg-white/12 text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/6"
              }`}
            >
              <item.icon className="h-3 w-3" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
