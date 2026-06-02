"use client";

import { LoginForm } from "@/components/auth/LoginForm";

// Universal team door — managers, pizzaiolo, chef, KP, waiter (and owners too).
// Routes each role to its surface: kitchen → KDS, floor → POS, otherwise the
// scoped admin dashboard. Owners have a dedicated door at /admin/login.
export default function LoginPage() {
  return <LoginForm portal="staff" />;
}
