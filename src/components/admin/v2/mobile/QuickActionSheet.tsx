"use client";

import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  ClipboardEdit,
  PackagePlus,
  Phone,
  Plus,
  RefreshCcw,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminRole } from "@/lib/admin-roles";
import { BottomSheet } from "./BottomSheet";
import { useAdminShell } from "../ShellContext";
import { haptic } from "./haptics";

interface Action {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Min role to see this action. */
  role?: AdminRole;
  onRun: (ctx: {
    router: ReturnType<typeof useRouter>;
    openPalette: () => void;
  }) => void;
}

const ACTIONS: Action[] = [
  {
    id: "new-order",
    label: "New order",
    hint: "Take a phone or counter order",
    icon: Plus,
    role: "staff",
    onRun: ({ router }) => router.push("/admin/orders?new=1"),
  },
  {
    id: "refund",
    label: "Refund order",
    hint: "Find an order to refund",
    icon: RefreshCcw,
    role: "manager",
    onRun: ({ openPalette }) => openPalette(),
  },
  {
    id: "comp",
    label: "Comp / discount",
    hint: "Apply a comp to an order",
    icon: ClipboardEdit,
    role: "manager",
    onRun: ({ openPalette }) => openPalette(),
  },
  {
    id: "adjust-stock",
    label: "Adjust stock",
    hint: "Receive, waste, or count an item",
    icon: PackagePlus,
    role: "staff",
    onRun: ({ router }) => router.push("/admin/inventory?adjust=1"),
  },
  {
    id: "reach-customer",
    label: "Reach customer",
    hint: "Look up a customer to call or text",
    icon: Phone,
    role: "staff",
    onRun: ({ openPalette }) => openPalette(),
  },
  {
    id: "add-shift",
    label: "Add shift",
    hint: "Schedule someone for today",
    icon: CalendarPlus,
    role: "manager",
    onRun: ({ router }) => router.push("/admin/schedule?new=1"),
  },
  {
    id: "open-till",
    label: "Open till",
    hint: "Start a cash session",
    icon: Wallet,
    role: "manager",
    onRun: ({ router }) => router.push("/admin/cash?open=1"),
  },
];

const ROLE_RANK: Record<AdminRole, number> = {
  owner: 100,
  franchisee: 70,
  manager: 50,
  staff: 20,
  kitchen: 10,
};

interface Props {
  open: boolean;
  onClose: () => void;
  role: AdminRole | null;
}

export function QuickActionSheet({ open, onClose, role }: Props) {
  const router = useRouter();
  const { openPalette } = useAdminShell();

  const visible = ACTIONS.filter((a) => {
    if (!a.role || !role) return !a.role;
    return ROLE_RANK[role] >= ROLE_RANK[a.role];
  });

  return (
    <BottomSheet open={open} onClose={onClose} title="Quick actions">
      <div className="v2-m-quick-grid">
        {visible.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.id}
              type="button"
              className="v2-m-quick-item"
              onClick={() => {
                haptic("medium");
                a.onRun({ router, openPalette });
                onClose();
              }}
            >
              <span className="v2-m-quick-icon">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="v2-m-quick-label">{a.label}</span>
              <span className="v2-m-quick-hint">{a.hint}</span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
