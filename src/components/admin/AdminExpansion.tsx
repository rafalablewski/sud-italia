"use client";

import { useState } from "react";
import { AdminNav } from "./AdminNav";
import {
  Map,
  Target,
  Shield,
  TrendingUp,
  Laptop,
  Users,
  MapPin,
  CheckCircle,
  Circle,
  Clock,
  Building2,
  Truck,
  Award,
  ChefHat,
  BarChart3,
  Globe,
  Megaphone,
  Handshake,
  GraduationCap,
  Heart,
  Star,
  ArrowRight,
  Milestone,
} from "lucide-react";

type Pillar = "geographic" | "brand" | "supply" | "digital" | "talent";

interface CityTarget {
  name: string;
  population: string;
  status: "active" | "planned" | "research";
  priority: "high" | "medium" | "low";
  estimatedLaunch: string;
  notes: string;
}

const CITY_TARGETS: CityTarget[] = [
  { name: "Kraków", population: "800K", status: "active", priority: "high", estimatedLaunch: "Live", notes: "Flagship location, Rynek Główny" },
  { name: "Warszawa", population: "1.8M", status: "active", priority: "high", estimatedLaunch: "Live", notes: "Nowy Świat street" },
  { name: "Wrocław", population: "640K", status: "planned", priority: "high", estimatedLaunch: "Q3 2026", notes: "Market Square secured" },
  { name: "Gdańsk", population: "470K", status: "planned", priority: "high", estimatedLaunch: "Q4 2026", notes: "Tri-city region, tourist hub" },
  { name: "Poznań", population: "540K", status: "research", priority: "medium", estimatedLaunch: "Q1 2027", notes: "Strong student & business population" },
  { name: "Łódź", population: "670K", status: "research", priority: "medium", estimatedLaunch: "Q1 2027", notes: "Piotrkowska Street opportunity" },
  { name: "Katowice", population: "290K", status: "research", priority: "medium", estimatedLaunch: "Q2 2027", notes: "Silesian metro area 2M+" },
  { name: "Lublin", population: "340K", status: "research", priority: "low", estimatedLaunch: "Q3 2027", notes: "University city, growing food scene" },
  { name: "Szczecin", population: "400K", status: "research", priority: "low", estimatedLaunch: "Q4 2027", notes: "Northwestern anchor" },
  { name: "Kraków #2", population: "", status: "planned", priority: "high", estimatedLaunch: "Q2 2027", notes: "Second truck for Kazimierz district" },
];

const STATUS_ICON: Record<string, React.ElementType> = {
  active: CheckCircle,
  planned: Clock,
  research: Circle,
};

const STATUS_BADGE: Record<string, string> = {
  active: "badge-active",
  planned: "badge-warning",
  research: "badge-info",
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "badge-danger",
  medium: "badge-warning",
  low: "badge-info",
};

interface PillarConfig {
  id: Pillar;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
}

const PILLARS: PillarConfig[] = [
  { id: "geographic", title: "Geographic Expansion", subtitle: "10 locations in 24 months", icon: MapPin, color: "from-red-500/20 to-orange-500/20" },
  { id: "brand", title: "Brand Moat", subtitle: "Become the Neapolitan standard", icon: Shield, color: "from-purple-500/20 to-blue-500/20" },
  { id: "supply", title: "Supply Chain & Unit Economics", subtitle: "25-28% food cost target", icon: TrendingUp, color: "from-green-500/20 to-emerald-500/20" },
  { id: "digital", title: "Digital-First Acquisition", subtitle: "60%+ pre-order rate", icon: Laptop, color: "from-blue-500/20 to-cyan-500/20" },
  { id: "talent", title: "Talent & Culture", subtitle: "Best teams, lowest turnover", icon: Users, color: "from-amber-500/20 to-yellow-500/20" },
];

export function AdminExpansion() {
  const [activePillar, setActivePillar] = useState<Pillar>("geographic");

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-md bg-white/6 flex items-center justify-center">
            <Map className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold admin-text">
              Expansion Strategy
            </h1>
            <p className="text-sm admin-text-dim">
              Path to #1 Pizza Truck Chain in Poland
            </p>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="glass-card p-4">
            <p className="text-2xl font-bold admin-text">2</p>
            <p className="text-xs admin-text-dim">Active Locations</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-2xl font-bold text-italia-gold">10</p>
            <p className="text-xs admin-text-dim">Target (24 months)</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-2xl font-bold text-green-400">~30%</p>
            <p className="text-xs admin-text-dim">Current Food Cost</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-2xl font-bold text-purple-400">25-28%</p>
            <p className="text-xs admin-text-dim">Target Food Cost</p>
          </div>
        </div>

        {/* Pillar selector */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-6 pb-1">
          {PILLARS.map((pillar) => (
            <button
              key={pillar.id}
              onClick={() => setActivePillar(pillar.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activePillar === pillar.id
                  ? "bg-white/12 text-white shadow-sm border border-white/10"
                  : "text-slate-400 hover:text-white hover:bg-white/6"
              }`}
            >
              <pillar.icon className="h-4 w-4" />
              {pillar.title}
            </button>
          ))}
        </div>

        {/* Pillar content */}
        {activePillar === "geographic" && (
          <div className="space-y-4">
            <div className="glass-card-static p-4">
              <h3 className="font-semibold admin-text mb-2 flex items-center gap-2">
                <Target className="h-4 w-4 text-italia-red" />
                Hub-and-Spoke Model
              </h3>
              <p className="text-sm admin-text-dim leading-relaxed">
                Central commissary kitchen per region for dough prep and sauce production.
                Trucks are assembly + oven units only. This reduces per-truck capex by ~40%
                and ensures consistency across all locations.
              </p>
            </div>

            <h3 className="font-semibold admin-text text-sm uppercase tracking-wide mt-6 mb-3">
              City Pipeline ({CITY_TARGETS.length} targets)
            </h3>

            <div className="space-y-2">
              {CITY_TARGETS.map((city) => {
                const StatusIcon = STATUS_ICON[city.status];
                return (
                  <div key={city.name} className="glass-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <StatusIcon
                          className={`h-5 w-5 ${
                            city.status === "active"
                              ? "text-green-400"
                              : city.status === "planned"
                                ? "text-amber-400"
                                : "text-blue-400"
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold admin-text">{city.name}</p>
                            {city.population && (
                              <span className="text-xs admin-text-dim">
                                Pop. {city.population}
                              </span>
                            )}
                          </div>
                          <p className="text-xs admin-text-dim">{city.notes}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_BADGE[city.status]}`}>
                          {city.status}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${PRIORITY_BADGE[city.priority]}`}>
                          {city.priority}
                        </span>
                        <span className="text-xs admin-text-dim ml-2">
                          {city.estimatedLaunch}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="glass-card-static p-4 mt-4">
              <h3 className="font-semibold admin-text mb-2 flex items-center gap-2">
                <Milestone className="h-4 w-4 text-italia-gold" />
                Franchise Optionality
              </h3>
              <p className="text-sm admin-text-dim leading-relaxed">
                By Year 3, with 10+ locations and proven ops playbook (admin panel + recipe system),
                Sud Italia can begin licensing the brand and system to franchisees. Target: 5 franchise
                units by Year 4, generating royalty revenue at 6-8% of gross sales.
              </p>
            </div>
          </div>
        )}

        {activePillar === "brand" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="glass-card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Award className="h-5 w-5 text-amber-400" />
                  </div>
                  <h3 className="font-semibold admin-text">VPN Certification</h3>
                </div>
                <p className="text-sm admin-text-dim leading-relaxed mb-3">
                  Get Vera Pizza Napoletana (VPN) certification for dough process.
                  No Polish food truck chain has this — instant credibility and differentiation.
                </p>
                <div className="flex items-center gap-2">
                  <span className="badge-warning text-[10px] px-2 py-0.5 rounded-full font-bold">In Progress</span>
                  <span className="text-xs admin-text-dim">Target: Q3 2026</span>
                </div>
              </div>

              <div className="glass-card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <Star className="h-5 w-5 text-red-400" />
                  </div>
                  <h3 className="font-semibold admin-text">Signature Item: &quot;The Sud&quot;</h3>
                </div>
                <p className="text-sm admin-text-dim leading-relaxed mb-3">
                  Create ONE iconic pizza that becomes synonymous with the brand.
                  Unique combination unavailable elsewhere. Drives word-of-mouth and social sharing.
                </p>
                <div className="flex items-center gap-2">
                  <span className="badge-info text-[10px] px-2 py-0.5 rounded-full font-bold">Planning</span>
                  <span className="text-xs admin-text-dim">R&D Phase</span>
                </div>
              </div>

              <div className="glass-card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Truck className="h-5 w-5 text-green-400" />
                  </div>
                  <h3 className="font-semibold admin-text">Visual Identity</h3>
                </div>
                <p className="text-sm admin-text-dim leading-relaxed">
                  Branded uniforms, Instagram-worthy truck wraps, consistent plating with
                  branded boxes/napkins. Every touchpoint reinforces the premium Italian positioning.
                </p>
              </div>

              <div className="glass-card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <Megaphone className="h-5 w-5 text-purple-400" />
                  </div>
                  <h3 className="font-semibold admin-text">Story Marketing</h3>
                </div>
                <p className="text-sm admin-text-dim leading-relaxed">
                  &quot;From Naples to Poland&quot; founder story across all channels. Behind-the-scenes
                  content showing dough-making, ingredient sourcing from Italy. Build emotional connection.
                </p>
              </div>
            </div>
          </div>
        )}

        {activePillar === "supply" && (
          <div className="space-y-4">
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-green-400" />
                Current Unit Economics
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-lg font-bold admin-text">~30%</p>
                  <p className="text-[10px] admin-text-dim">Avg Food Cost</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-lg font-bold admin-text">28 PLN</p>
                  <p className="text-[10px] admin-text-dim">Margherita Price</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-lg font-bold admin-text">8.40 PLN</p>
                  <p className="text-[10px] admin-text-dim">Margherita Cost</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-lg font-bold text-green-400">70%</p>
                  <p className="text-[10px] admin-text-dim">Gross Margin</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <h3 className="font-semibold admin-text mb-3">Optimization Roadmap</h3>
              <div className="space-y-3">
                {[
                  { title: "Centralized Purchasing", desc: "Bulk mozzarella, flour, and San Marzano orders across all locations. Target: 15% ingredient cost reduction.", status: "ready" },
                  { title: "Volume Discounts at 5+ Locations", desc: "Negotiate preferred supplier contracts with volume commitments. Target: additional 8% savings.", status: "planned" },
                  { title: "Waste Tracking System", desc: "Your recipe/ingredient system already tracks waste factors. Operationalize daily waste reporting to hit <3% waste rate.", status: "in-progress" },
                  { title: "Commissary Kitchen", desc: "Central prep facility for dough, sauces, and base ingredients. Reduces per-truck labor and ensures consistency.", status: "planned" },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3 p-3 bg-white/3 rounded-lg">
                    <ArrowRight className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold admin-text">{item.title}</p>
                      <p className="text-xs admin-text-dim mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activePillar === "digital" && (
          <div className="space-y-4">
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-2 flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-400" />
                Goal: 60%+ of Orders Through Digital Channels
              </h3>
              <p className="text-sm admin-text-dim">
                Pre-ordering reduces queue times, increases throughput, and provides valuable data
                for demand forecasting and personalized marketing.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { icon: Laptop, title: "PWA App", desc: "Installable web app with push notifications. Already implemented — needs promotion.", color: "text-blue-400", bg: "bg-blue-500/10", status: "Done" },
                { icon: Globe, title: "Aggregator Integration", desc: "Pyszne.pl, Wolt, Uber Eats, Glovo. Orders API for platforms to push into our system.", color: "text-purple-400", bg: "bg-purple-500/10", status: "Q3 2026" },
                { icon: Building2, title: "Corporate Portal", desc: "B2B ordering with group selection, single invoice. Target office lunch market.", color: "text-green-400", bg: "bg-green-500/10", status: "Q4 2026" },
                { icon: Megaphone, title: "Referral Program", desc: "Give 10 PLN, get 10 PLN. Acquire customers at 1/3 ad cost. Track via loyalty system.", color: "text-amber-400", bg: "bg-amber-500/10", status: "Q3 2026" },
                { icon: Handshake, title: "Catering & Events", desc: "Corporate lunches, weddings, festivals. Dedicated inquiry form and pricing.", color: "text-red-400", bg: "bg-red-500/10", status: "Q2 2026" },
                { icon: TrendingUp, title: "SEO & Content", desc: "Blog content about Italian food culture, recipes, behind-the-scenes. Schema.org markup.", color: "text-cyan-400", bg: "bg-cyan-500/10", status: "Ongoing" },
              ].map((item) => (
                <div key={item.title} className="glass-card p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0`}>
                      <item.icon className={`h-5 w-5 ${item.color}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm admin-text">{item.title}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold badge-info">
                          {item.status}
                        </span>
                      </div>
                      <p className="text-xs admin-text-dim mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activePillar === "talent" && (
          <div className="space-y-4">
            <div className="glass-card-static p-5">
              <h3 className="font-semibold admin-text mb-2 flex items-center gap-2">
                <Heart className="h-4 w-4 text-red-400" />
                People are the Brand
              </h3>
              <p className="text-sm admin-text-dim">
                In food service, your people ARE your product. The best ingredients
                mean nothing without passionate, skilled, motivated staff.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  icon: ChefHat,
                  title: "Naples Training Program",
                  desc: "Send staff to Naples for 2-week pizza masterclass. Marketable story (\"trained in Naples\") and genuine skill development. Budget: ~4,000 PLN per person.",
                  color: "text-amber-400",
                  bg: "bg-amber-500/10",
                },
                {
                  icon: TrendingUp,
                  title: "Profit Sharing",
                  desc: "Each truck team gets 5% of net monthly profit as bonus. Aligns incentives, reduces turnover, and motivates upselling.",
                  color: "text-green-400",
                  bg: "bg-green-500/10",
                },
                {
                  icon: GraduationCap,
                  title: "Career Path",
                  desc: "Clear progression: Prep Cook → Line Cook → Truck Lead → Area Manager → Operations Director. With expansion, there are real growth opportunities.",
                  color: "text-blue-400",
                  bg: "bg-blue-500/10",
                },
                {
                  icon: Star,
                  title: "Culture Rituals",
                  desc: "Weekly team meals (eating together), monthly \"Best Truck\" competition, annual Naples trip for top performer. Build belonging.",
                  color: "text-purple-400",
                  bg: "bg-purple-500/10",
                },
              ].map((item) => (
                <div key={item.title} className="glass-card p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center`}>
                      <item.icon className={`h-5 w-5 ${item.color}`} />
                    </div>
                    <h3 className="font-semibold admin-text">{item.title}</h3>
                  </div>
                  <p className="text-sm admin-text-dim leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="glass-card-static p-4 mt-4">
              <h3 className="font-semibold admin-text mb-2">Staffing Plan for Expansion</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left admin-text-dim text-xs uppercase tracking-wide">
                      <th className="pb-2">Role</th>
                      <th className="pb-2">Per Truck</th>
                      <th className="pb-2">10 Trucks</th>
                      <th className="pb-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="admin-text-muted">
                    <tr className="border-t border-white/5">
                      <td className="py-2">Truck Lead</td>
                      <td>1</td>
                      <td>10</td>
                      <td className="text-xs admin-text-dim">Naples-trained, manages shift</td>
                    </tr>
                    <tr className="border-t border-white/5">
                      <td className="py-2">Line Cooks</td>
                      <td>2-3</td>
                      <td>25</td>
                      <td className="text-xs admin-text-dim">Pizza + pasta stations</td>
                    </tr>
                    <tr className="border-t border-white/5">
                      <td className="py-2">Service/Cashier</td>
                      <td>1</td>
                      <td>10</td>
                      <td className="text-xs admin-text-dim">Customer-facing, upselling trained</td>
                    </tr>
                    <tr className="border-t border-white/5">
                      <td className="py-2">Delivery Riders</td>
                      <td>1-2</td>
                      <td>15</td>
                      <td className="text-xs admin-text-dim">Flex workers, peak hours only</td>
                    </tr>
                    <tr className="border-t border-white/5 font-semibold admin-text">
                      <td className="py-2">Total</td>
                      <td>5-7</td>
                      <td>60</td>
                      <td className="text-xs admin-text-dim">+ 3 area managers + 1 ops director</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
