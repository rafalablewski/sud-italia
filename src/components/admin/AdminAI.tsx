"use client";

import { useState, useMemo, useCallback } from "react";
import { AdminNav } from "./AdminNav";
import {
  generateDemandForecast,
  generatePriceSuggestions,
  generateInsights,
  DemandForecast,
  PriceSuggestion,
  RecommendationInsight,
} from "@/lib/ai-engine";
import { krakowMenu } from "@/data/menus/krakow";
import { warszawaMenu } from "@/data/menus/warszawa";
import { locations as allLocations } from "@/data/locations";
import { formatPrice } from "@/lib/utils";

const LOCATION_MENUS: Record<string, import("@/data/types").MenuItem[]> = {
  krakow: krakowMenu,
  warszawa: warszawaMenu,
};
const activeLocations = allLocations.filter((l) => l.isActive);
import {
  Brain,
  TrendingUp,
  DollarSign,
  Lightbulb,
  Cloud,
  Sun,
  CloudRain,
  Snowflake,
  CloudSun,
  ArrowUp,
  ArrowDown,
  Minus,
  Sparkles,
  RefreshCw,
  BarChart3,
  Megaphone,
  UtensilsCrossed,
  Settings2,
} from "lucide-react";

type Tab = "forecast" | "pricing" | "insights";

const WEATHER_ICONS: Record<string, React.ElementType> = {
  Sunny: Sun,
  Cloudy: Cloud,
  Rainy: CloudRain,
  Snowy: Snowflake,
  "Partly Cloudy": CloudSun,
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  upsell: TrendingUp,
  menu: UtensilsCrossed,
  operations: Settings2,
  marketing: Megaphone,
};

const IMPACT_COLORS: Record<string, string> = {
  high: "badge-danger",
  medium: "badge-warning",
  low: "badge-info",
};

export function AdminAI() {
  const [tab, setTab] = useState<Tab>("forecast");
  const [selectedLocation, setSelectedLocation] = useState<string>("krakow");
  const currentMenu = LOCATION_MENUS[selectedLocation] || krakowMenu;
  const locationName = activeLocations.find((l) => l.slug === selectedLocation)?.city || selectedLocation;

  const [forecasts, setForecasts] = useState<DemandForecast[]>(() =>
    generateDemandForecast(7)
  );
  const [priceSuggestions, setPriceSuggestions] = useState<PriceSuggestion[]>(() =>
    generatePriceSuggestions(currentMenu)
  );
  const [insights] = useState<RecommendationInsight[]>(() =>
    generateInsights()
  );
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setForecasts(generateDemandForecast(7));
      setPriceSuggestions(generatePriceSuggestions(currentMenu));
      setRefreshing(false);
    }, 1200);
  };

  const totalExpectedOrders = useMemo(() => forecasts.reduce((sum, f) => sum + f.expectedOrders, 0), [forecasts]);
  const avgConfidence = useMemo(() => (forecasts.length > 0 ? forecasts.reduce((sum, f) => sum + f.confidence, 0) / forecasts.length : 0), [forecasts]);

  const tabs = [
    { id: "forecast" as const, label: "Demand Forecast", icon: BarChart3 },
    { id: "pricing" as const, label: "Dynamic Pricing", icon: DollarSign },
    { id: "insights" as const, label: "AI Insights", icon: Lightbulb },
  ];

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
              <Brain className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold admin-text">AI Command Center</h1>
              <p className="text-sm admin-text-dim">
                ML-powered insights for <span className="font-semibold admin-text">{locationName}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                const menu = LOCATION_MENUS[e.target.value] || krakowMenu;
                setForecasts(generateDemandForecast(7));
                setPriceSuggestions(generatePriceSuggestions(menu));
              }}
              className="glass-select text-sm"
            >
              {activeLocations.map((loc) => (
                <option key={loc.slug} value={loc.slug}>{loc.city}</option>
              ))}
            </select>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="glass-btn-blue"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Analyzing..." : "Refresh Models"}
          </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 glass rounded-xl w-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-white/12 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-white/6"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "forecast" && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="glass-card p-4">
                <p className="text-xs admin-text-dim uppercase tracking-wide mb-1">
                  7-Day Forecast
                </p>
                <p className="text-2xl font-bold admin-text">
                  {totalExpectedOrders} orders
                </p>
              </div>
              <div className="glass-card p-4">
                <p className="text-xs admin-text-dim uppercase tracking-wide mb-1">
                  Avg Daily
                </p>
                <p className="text-2xl font-bold admin-text">
                  {Math.round(totalExpectedOrders / 7)} orders
                </p>
              </div>
              <div className="glass-card p-4">
                <p className="text-xs admin-text-dim uppercase tracking-wide mb-1">
                  Model Confidence
                </p>
                <p className="text-2xl font-bold text-purple-400">
                  {Math.round(avgConfidence * 100)}%
                </p>
              </div>
            </div>

            {/* Daily forecasts */}
            <div className="space-y-3">
              {forecasts.map((f) => {
                const WeatherIcon = WEATHER_ICONS[f.weather] || Cloud;
                return (
                  <div key={f.date} className="glass-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="font-semibold admin-text">{f.dayOfWeek}</p>
                          <p className="text-xs admin-text-dim">{f.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-sm admin-text-muted">
                          <WeatherIcon className="h-4 w-4" />
                          {f.weather}
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold admin-text">
                            {f.expectedOrders}
                          </p>
                          <p className="text-[10px] admin-text-dim">expected orders</p>
                        </div>
                      </div>
                    </div>
                    {/* Category breakdown bar */}
                    <div className="flex h-2 rounded-full overflow-hidden mb-2">
                      <div
                        className="bg-italia-red"
                        style={{ width: `${(f.categoryBreakdown.pizza / f.expectedOrders) * 100}%` }}
                        title={`Pizza: ${f.categoryBreakdown.pizza}`}
                      />
                      <div
                        className="bg-amber-500"
                        style={{ width: `${(f.categoryBreakdown.pasta / f.expectedOrders) * 100}%` }}
                        title={`Pasta: ${f.categoryBreakdown.pasta}`}
                      />
                      <div
                        className="bg-italia-green"
                        style={{ width: `${(f.categoryBreakdown.antipasti / f.expectedOrders) * 100}%` }}
                        title={`Antipasti: ${f.categoryBreakdown.antipasti}`}
                      />
                      <div
                        className="bg-blue-500"
                        style={{ width: `${(f.categoryBreakdown.drinks / f.expectedOrders) * 100}%` }}
                        title={`Drinks: ${f.categoryBreakdown.drinks}`}
                      />
                      <div
                        className="bg-pink-500"
                        style={{ width: `${(f.categoryBreakdown.desserts / f.expectedOrders) * 100}%` }}
                        title={`Desserts: ${f.categoryBreakdown.desserts}`}
                      />
                    </div>
                    <p className="text-xs admin-text-dim flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-purple-400" />
                      {f.recommendation}
                    </p>
                    {f.events.length > 0 && (
                      <div className="flex gap-1.5 mt-2">
                        {f.events.map((e) => (
                          <span key={e} className="badge-info text-[10px] px-2 py-0.5 rounded-full font-medium">
                            {e}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "pricing" && (
          <div className="space-y-4">
            <div className="glass-card-static p-4 mb-4">
              <p className="text-sm admin-text-muted">
                <Sparkles className="h-4 w-4 inline text-purple-400 mr-1" />
                AI analyzes margin data, demand patterns, and competitor pricing to suggest optimal prices.
                Suggestions are based on your cost data and order history.
              </p>
            </div>

            <div className="space-y-3">
              {priceSuggestions.map((s) => (
                <div key={s.itemId} className="glass-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold admin-text">{s.itemName}</p>
                      <p className="text-xs admin-text-dim">
                        Confidence: {Math.round(s.confidence * 100)}%
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm admin-text-dim">Current</p>
                        <p className="font-bold admin-text">
                          {formatPrice(s.currentPrice)}
                        </p>
                      </div>
                      <div className="flex items-center">
                        {s.impact === "increase" ? (
                          <ArrowUp className="h-5 w-5 text-green-400" />
                        ) : s.impact === "decrease" ? (
                          <ArrowDown className="h-5 w-5 text-amber-400" />
                        ) : (
                          <Minus className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm admin-text-dim">Suggested</p>
                        <p
                          className={`font-bold ${
                            s.impact === "increase"
                              ? "text-green-400"
                              : s.impact === "decrease"
                                ? "text-amber-400"
                                : "admin-text"
                          }`}
                        >
                          {formatPrice(s.suggestedPrice)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs admin-text-dim">{s.reason}</p>
                  {s.estimatedRevenueChange !== 0 && (
                    <p className="text-xs mt-1 font-medium text-purple-400">
                      Est. monthly impact: {s.estimatedRevenueChange > 0 ? "+" : ""}
                      {formatPrice(Math.abs(s.estimatedRevenueChange))}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button className="glass-btn-green text-xs px-3 py-1">
                      Apply
                    </button>
                    <button className="glass-btn-ghost text-xs px-3 py-1">
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "insights" && (
          <div className="space-y-4">
            <div className="glass-card-static p-4 mb-4">
              <p className="text-sm admin-text-muted">
                <Brain className="h-4 w-4 inline text-purple-400 mr-1" />
                AI-generated recommendations based on your order data, customer behavior, and market trends.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.map((insight) => {
                const TypeIcon = TYPE_ICONS[insight.type] || Lightbulb;
                return (
                  <div key={insight.id} className="glass-card p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                        <TypeIcon className="h-5 w-5 text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-sm admin-text">
                            {insight.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${IMPACT_COLORS[insight.impact]}`}>
                            {insight.impact} impact
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium badge-info">
                            {insight.effort} effort
                          </span>
                        </div>
                        <p className="text-xs admin-text-dim leading-relaxed">
                          {insight.description}
                        </p>
                        <p className="text-xs font-semibold text-green-400 mt-2">
                          {insight.estimatedRevenue}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
