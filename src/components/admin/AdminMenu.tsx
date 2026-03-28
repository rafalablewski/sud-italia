"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import { MapPin, Eye, EyeOff, Save, RotateCcw, Search } from "lucide-react";
import { locations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";
import { MENU_CATEGORY_LABELS, type MenuCategory } from "@/data/types";

const activeLocations = locations.filter((l) => l.isActive);

const CATEGORY_ORDER: MenuCategory[] = ["pizza", "pasta", "antipasti", "panini", "drinks", "desserts"];

interface MenuItemData {
  id: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  category: MenuCategory;
  tags: string[];
  available: boolean;
  _hasOverride: boolean;
}

interface PendingChange {
  price?: number;
  cost?: number;
  available?: boolean;
}

export function AdminMenu() {
  const [selectedLocation, setSelectedLocation] = useState(activeLocations[0]?.slug || "");
  const [items, setItems] = useState<MenuItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [changes, setChanges] = useState<Record<string, PendingChange>>({});
  const [saved, setSaved] = useState(false);

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/menu?location=${selectedLocation}`);
      if (res.ok) setItems(await res.json());
    } catch (err) {
      console.error("Failed to fetch menu:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation]);

  useEffect(() => {
    if (selectedLocation) fetchMenu();
    setChanges({});
    setSaved(false);
  }, [selectedLocation, fetchMenu]);

  const hasChanges = Object.keys(changes).length > 0;

  const setChange = (id: string, field: keyof PendingChange, value: number | boolean) => {
    setChanges((prev) => {
      const current = prev[id] || {};
      const item = items.find((i) => i.id === id);
      if (!item) return prev;

      const originalValue = item[field];
      const updated = { ...current, [field]: value };

      // If the value matches the original, remove the change
      if (value === originalValue) {
        delete updated[field];
        if (Object.keys(updated).length === 0) {
          const next = { ...prev };
          delete next[id];
          return next;
        }
      }

      return { ...prev, [id]: updated };
    });
    setSaved(false);
  };

  const toggleAvailability = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const pending = changes[id];
    const currentValue = pending?.available ?? item.available;
    setChange(id, "available", !currentValue);
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      await fetch("/api/admin/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: changes }),
      });
      setSaved(true);
      setChanges({});
      fetchMenu();
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setChanges({});
    setSaved(false);
  };

  // Group and filter items
  const categories = CATEGORY_ORDER.filter((cat) =>
    items.some((i) => i.category === cat)
  );

  const filteredItems = items.filter((item) => {
    if (filterCategory && item.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
    }
    return true;
  });

  const groupedItems = categories
    .map((cat) => ({
      category: cat,
      label: MENU_CATEGORY_LABELS[cat],
      items: filteredItems.filter((i) => i.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  const unavailableCount = items.filter((i) => {
    const pending = changes[i.id];
    return (pending?.available ?? i.available) === false;
  }).length;

  return (
    <>
      <AdminNav />
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold font-heading text-italia-dark">Menu</h1>
            <p className="text-sm text-italia-gray mt-0.5">
              {items.length} items{unavailableCount > 0 && ` \u00B7 ${unavailableCount} hidden`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleDiscard}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                Discard
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center gap-2 px-4 py-2 bg-italia-green text-white rounded-xl font-semibold text-sm hover:bg-italia-green-dark transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : `Save Changes${hasChanges ? ` (${Object.keys(changes).length})` : ""}`}
            </button>
          </div>
        </div>

        {saved && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
            Menu updated successfully.
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-italia-gray" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-italia-red"
            >
              {activeLocations.map((loc) => (
                <option key={loc.slug} value={loc.slug}>{loc.city}</option>
              ))}
            </select>
          </div>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{MENU_CATEGORY_LABELS[cat]}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-italia-gray" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-italia-red"
            />
          </div>
        </div>

        {/* Menu items */}
        {loading ? (
          <div className="text-center py-12 text-italia-gray">Loading...</div>
        ) : (
          <div className="space-y-8">
            {groupedItems.map((group) => (
              <div key={group.category}>
                <h2 className="text-lg font-bold font-heading text-italia-dark mb-3 flex items-center gap-2">
                  {group.label}
                  <span className="text-xs font-normal text-italia-gray">({group.items.length})</span>
                </h2>
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const pending = changes[item.id];
                    const isAvailable = pending?.available ?? item.available;
                    const currentPrice = pending?.price ?? item.price;
                    const currentCost = pending?.cost ?? item.cost;
                    const hasItemChanges = !!pending;
                    const margin = currentPrice > 0
                      ? Math.round(((currentPrice - currentCost) / currentPrice) * 100)
                      : 0;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-4 transition-colors ${
                          !isAvailable
                            ? "bg-gray-50 border border-gray-200 opacity-60"
                            : hasItemChanges
                              ? "bg-blue-50 border-2 border-blue-200"
                              : "bg-white border border-gray-100"
                        }`}
                      >
                        {/* Toggle */}
                        <button
                          onClick={() => toggleAvailability(item.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            isAvailable
                              ? "bg-italia-green/10 text-italia-green hover:bg-italia-green/20"
                              : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                          }`}
                          title={isAvailable ? "Mark as unavailable" : "Mark as available"}
                        >
                          {isAvailable ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                        </button>

                        {/* Name & description */}
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-italia-dark">{item.name}</span>
                            {item.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded"
                              >
                                {tag}
                              </span>
                            ))}
                            {item._hasOverride && !hasItemChanges && (
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 text-[10px] font-semibold rounded">
                                Modified
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-italia-gray mt-0.5 line-clamp-1">{item.description}</p>
                        </div>

                        {/* Price */}
                        <div className="flex items-center gap-3">
                          <div>
                            <label className="block text-[10px] text-italia-gray mb-0.5">Price</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.01"
                                value={(currentPrice / 100).toFixed(2)}
                                onChange={(e) => setChange(item.id, "price", Math.round(parseFloat(e.target.value || "0") * 100))}
                                className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-right"
                              />
                              <span className="text-xs text-italia-gray">PLN</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-italia-gray mb-0.5">Cost</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.01"
                                value={(currentCost / 100).toFixed(2)}
                                onChange={(e) => setChange(item.id, "cost", Math.round(parseFloat(e.target.value || "0") * 100))}
                                className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-right"
                              />
                              <span className="text-xs text-italia-gray">PLN</span>
                            </div>
                          </div>
                          <div className="text-center">
                            <label className="block text-[10px] text-italia-gray mb-0.5">Margin</label>
                            <span className={`text-sm font-bold ${
                              margin >= 65 ? "text-italia-green" : margin >= 50 ? "text-italia-gold-dark" : "text-italia-red"
                            }`}>
                              {margin}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
