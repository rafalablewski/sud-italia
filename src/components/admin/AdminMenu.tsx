"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import {
  MapPin, Eye, EyeOff, Save, Search, Pencil, X, Check,
} from "lucide-react";
import { locations } from "@/data/locations";
import { LocationTabs } from "./LocationTabs";
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
  available?: boolean;
  description?: string;
}

export function AdminMenu() {
  const [selectedLocation, setSelectedLocation] = useState(activeLocations[0]?.slug || "");
  const [items, setItems] = useState<MenuItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [changes, setChanges] = useState<Record<string, PendingChange>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);

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
    fetchMenu();
    setChanges({});
    setSaved(false);
    setEditingDesc(null);
    setEditingPrice(null);
  }, [selectedLocation, fetchMenu]);

  const hasChanges = Object.keys(changes).length > 0;

  const setChange = (id: string, field: keyof PendingChange, value: number | boolean | string) => {
    setChanges((prev) => {
      const current = prev[id] || {};
      const updated = { ...current, [field]: value };
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
      setEditingDesc(null);
      setEditingPrice(null);
      fetchMenu();
    } finally {
      setSaving(false);
    }
  };

  // Filter & group
  const filteredItems = items.filter((item) => {
    if (filterCategory && item.category !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
    }
    return true;
  });

  const categories = CATEGORY_ORDER.filter((cat) => items.some((i) => i.category === cat));
  const groupedItems = categories
    .map((cat) => ({
      category: cat,
      label: MENU_CATEGORY_LABELS[cat],
      items: filteredItems.filter((i) => i.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  const unavailableCount = items.filter((i) => (changes[i.id]?.available ?? i.available) === false).length;

  return (
    <>
      <AdminNav />
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold font-heading admin-text">Menu</h1>
            <p className="text-sm admin-text-muted mt-0.5">
              {items.length} items
              {unavailableCount > 0 && ` \u00B7 ${unavailableCount} hidden from customers`}
            </p>
          </div>
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="glass-btn-green disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : `Save Changes (${Object.keys(changes).length})`}
            </button>
          )}
        </div>

        {saved && (
          <div className="alert-success mb-4">Menu updated.</div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <LocationTabs value={selectedLocation} onChange={setSelectedLocation} />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="glass-input rounded-lg">
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{MENU_CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 admin-text-muted" />
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 glass-input rounded-lg" />
          </div>
        </div>

        {/* Items */}
        {loading ? (
          <div className="text-center py-12 admin-text-muted">Loading...</div>
        ) : (
          <div className="space-y-8">
            {groupedItems.map((group) => (
              <div key={group.category}>
                <h2 className="text-lg font-bold font-heading admin-text mb-3">
                  {group.label}
                  <span className="text-xs font-normal admin-text-muted ml-2">({group.items.length})</span>
                </h2>
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const isAvailable = changes[item.id]?.available ?? item.available;
                    const currentDesc = changes[item.id]?.description ?? item.description;
                    const currentPrice = changes[item.id]?.price ?? item.price;
                    const isEditingDesc = editingDesc === item.id;
                    const isEditingPrice = editingPrice === item.id;
                    const hasItemChanges = !!changes[item.id];

                    return (
                      <div
                        key={item.id}
                        className={`rounded-lg overflow-hidden transition-all ${
                          !isAvailable
                            ? "bg-white/4 border border-white/8 opacity-50"
                            : hasItemChanges
                              ? "glass-card border-blue-500/30"
                              : "glass-card"
                        }`}
                      >
                        <div className="flex items-start gap-3 p-4">
                          {/* Availability toggle */}
                          <button
                            onClick={() => toggleAvailability(item.id)}
                            className={`p-2 rounded-lg transition-colors flex-shrink-0 mt-0.5 ${
                              isAvailable ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-slate-500"
                            }`}
                            title={isAvailable ? "Mark sold out" : "Mark available"}
                          >
                            {isAvailable ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                          </button>

                          {/* Name + description */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold admin-text">{item.name}</span>
                              {item.tags.map((tag) => (
                                <span key={tag} className="px-1.5 py-0.5 bg-white/10 admin-text-dim text-[10px] font-medium rounded">{tag}</span>
                              ))}
                              {hasItemChanges && (
                                <span className="px-1.5 py-0.5 bg-blue-500/15 text-blue-400 text-[10px] font-semibold rounded">Unsaved</span>
                              )}
                            </div>

                            {/* Description — inline editable */}
                            {isEditingDesc ? (
                              <div className="flex items-start gap-2 mt-1">
                                <textarea
                                  value={currentDesc}
                                  onChange={(e) => setChange(item.id, "description", e.target.value)}
                                  className="flex-1 glass-input rounded-lg text-sm min-h-[60px] resize-y"
                                  autoFocus
                                />
                                <button
                                  onClick={() => setEditingDesc(null)}
                                  className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                  title="Done editing"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <div className="group flex items-start gap-1.5">
                                <p className="text-sm admin-text-muted leading-relaxed">{currentDesc}</p>
                                <button
                                  onClick={() => setEditingDesc(item.id)}
                                  className="p-1 rounded text-transparent group-hover:text-slate-500 hover:!text-blue-400 transition-colors flex-shrink-0"
                                  title="Edit description"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Price — click to edit */}
                          <div className="flex-shrink-0 text-right">
                            {isEditingPrice ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={(currentPrice / 100).toFixed(2)}
                                  onChange={(e) => setChange(item.id, "price", Math.round(parseFloat(e.target.value || "0") * 100))}
                                  className="w-24 glass-input rounded-lg text-right text-lg"
                                  autoFocus
                                  onBlur={() => setEditingPrice(null)}
                                  onKeyDown={(e) => e.key === "Enter" && setEditingPrice(null)}
                                />
                                <span className="text-xs admin-text-dim">PLN</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditingPrice(item.id)}
                                className="group/price text-right"
                                title="Click to edit price"
                              >
                                <div className="text-lg font-bold admin-text group-hover/price:text-blue-400 transition-colors">
                                  {formatPrice(currentPrice)}
                                </div>
                                <div className="text-[10px] admin-text-dim opacity-0 group-hover/price:opacity-100 transition-opacity">
                                  click to edit
                                </div>
                              </button>
                            )}
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
