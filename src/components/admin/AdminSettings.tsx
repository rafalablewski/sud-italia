"use client";

import { useState, useEffect } from "react";
import { AdminNav } from "./AdminNav";
import { Save, KeyRound, Truck, ShoppingBag, Phone, Mail } from "lucide-react";
import { useRouter } from "next/navigation";

interface Settings {
  deliveryFee: number;
  minOrderAmount: number;
  businessPhone: string;
  businessEmail: string;
}

export function AdminSettings() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSettings(await res.json());
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");
    setPasswordSaved(false);

    if (!newPassword || newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setChangingPassword(true);
    try {
      // Verify current password
      const verifyRes = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: currentPassword }),
      });

      if (!verifyRes.ok) {
        setPasswordError("Current password is incorrect");
        return;
      }

      // Save new password via settings
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _newPassword: newPassword }),
      });

      if (res.ok) {
        setPasswordSaved(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        // Log out and redirect to login
        await fetch("/api/admin/logout", { method: "POST" });
        setTimeout(() => router.push("/admin/login"), 1500);
      }
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <>
        <AdminNav />
        <div className="max-w-3xl mx-auto p-6 text-center text-italia-gray py-12">Loading...</div>
      </>
    );
  }

  return (
    <>
      <AdminNav />
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
        <h1 className="text-2xl font-bold font-heading text-italia-dark">Settings</h1>

        {/* Business Settings */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-italia-dark mb-4">Business Configuration</h2>

          {saved && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
              Settings saved successfully.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-italia-dark mb-1.5">
                <Truck className="h-4 w-4 text-italia-gray" />
                Delivery Fee
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={settings ? (settings.deliveryFee / 100).toFixed(2) : ""}
                  onChange={(e) => setSettings((s) => s ? { ...s, deliveryFee: Math.round(parseFloat(e.target.value || "0") * 100) } : s)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <span className="text-sm text-italia-gray">PLN</span>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-italia-dark mb-1.5">
                <ShoppingBag className="h-4 w-4 text-italia-gray" />
                Minimum Order
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={settings ? (settings.minOrderAmount / 100).toFixed(2) : ""}
                  onChange={(e) => setSettings((s) => s ? { ...s, minOrderAmount: Math.round(parseFloat(e.target.value || "0") * 100) } : s)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <span className="text-sm text-italia-gray">PLN</span>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-italia-dark mb-1.5">
                <Phone className="h-4 w-4 text-italia-gray" />
                Business Phone
              </label>
              <input
                type="tel"
                placeholder="+48 123 456 789"
                value={settings?.businessPhone || ""}
                onChange={(e) => setSettings((s) => s ? { ...s, businessPhone: e.target.value } : s)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-italia-dark mb-1.5">
                <Mail className="h-4 w-4 text-italia-gray" />
                Business Email
              </label>
              <input
                type="email"
                placeholder="info@suditalia.pl"
                value={settings?.businessEmail || ""}
                onChange={(e) => setSettings((s) => s ? { ...s, businessEmail: e.target.value } : s)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-italia-green text-white rounded-xl font-semibold text-sm hover:bg-italia-green-dark transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="font-bold text-italia-dark mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-italia-gray" />
            Change Password
          </h2>

          {passwordSaved && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
              Password changed. Redirecting to login...
            </div>
          )}

          {passwordError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-italia-red font-medium">
              {passwordError}
            </div>
          )}

          <div className="space-y-4 max-w-sm">
            <div>
              <label className="block text-sm font-medium text-italia-dark mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-italia-dark mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                placeholder="Min. 6 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-italia-dark mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>

            <button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword}
              className="flex items-center gap-2 px-5 py-2 bg-italia-red text-white rounded-xl font-semibold text-sm hover:bg-italia-red-dark transition-colors disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {changingPassword ? "Changing..." : "Change Password"}
            </button>
          </div>

          <p className="mt-4 text-xs text-italia-gray">
            Note: Changing the password requires the ADMIN_PASSWORD environment variable to be updated in your deployment settings for the change to persist across deploys.
          </p>
        </div>
      </div>
    </>
  );
}
