"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, ArrowLeft, ChefHat } from "lucide-react";

type Props = {
  slug: string;
  locationName: string;
};

export function KitchenLoginForm({ slug, locationName }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/kitchen/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Invalid credentials");
        return;
      }

      router.push(`/kitchen/${slug}`);
      router.refresh();
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
            <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center text-white shadow-lg">
              <ChefHat className="h-8 w-8" />
            </span>
          </div>
          <h1 className="text-2xl font-bold text-center mb-1 font-heading gradient-text">
            Kitchen
          </h1>
          <p className="admin-text text-center font-medium mb-1">{locationName}</p>
          <p className="admin-text-dim text-center mb-6 text-sm">Staff sign in</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              autoComplete="username"
              placeholder="Staff name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 glass-input rounded-xl text-base"
              autoFocus
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Location password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 glass-input rounded-xl text-base"
            />

            {error && (
              <p className="text-sm text-red-400 text-center bg-red-500/10 rounded-lg py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-3 glass-btn text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                "Signing in..."
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign in
                </>
              )}
            </button>
          </form>

          <Link
            href="/kitchen"
            className="mt-6 flex items-center justify-center gap-2 text-sm admin-text-dim hover:admin-text transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            All locations
          </Link>
        </div>
      </div>
    </div>
  );
}
