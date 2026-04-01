import Link from "next/link";
import { getActiveLocations } from "@/data/locations";
import { ChefHat } from "lucide-react";

export default function KitchenHubPage() {
  const locations = getActiveLocations();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-scale-in">
        <div className="glass-card rounded-3xl p-8">
          <div className="flex justify-center mb-5">
            <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center text-white shadow-lg">
              <ChefHat className="h-8 w-8" />
            </span>
          </div>
          <h1 className="text-2xl font-bold text-center mb-1 font-heading gradient-text">
            Kitchen orders
          </h1>
          <p className="admin-text-dim text-center mb-8 text-sm">
            Choose your location to sign in
          </p>
          <ul className="space-y-3">
            {locations.map((loc) => (
              <li key={loc.slug}>
                <Link
                  href={`/kitchen/${loc.slug}/login`}
                  className="block w-full py-4 px-4 rounded-xl glass-btn text-center font-semibold text-white no-underline hover:opacity-95 transition-opacity"
                >
                  {loc.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
