"use client";

import { LoginForm } from "@/components/auth/LoginForm";

// The admin door — owner-only. The login API rejects non-owners here and
// points them to /login. Managers, staff and kitchen use the universal door.
export default function AdminLoginPage() {
  return <LoginForm portal="admin" />;
}
