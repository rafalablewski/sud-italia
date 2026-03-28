"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Invalid password");
        return;
      }

      router.push("/admin");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="glass-card rounded-3xl p-8">
          <div className="flex justify-center mb-5">
            <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-italia-red to-italia-red-dark flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-italia-red/25">
              SI
            </span>
          </div>
          <h1 className="text-2xl font-bold text-center mb-1 font-heading gradient-text">
            Sud Italia
          </h1>
          <p className="admin-text-dim text-center mb-6 text-sm">
            Admin Panel
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 glass-input rounded-xl text-base"
              autoFocus
            />

            {error && (
              <p className="text-sm text-red-400 text-center bg-red-500/10 rounded-lg py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 glass-btn text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                "Logging in..."
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Log In
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
