"use client";

import { useState } from "react";
import { AdminNav } from "./AdminNav";
import {
  MessageSquare,
  Star,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  Filter,
  ChevronDown,
  Reply,
  Check,
  Flame,
  Clock,
  TrendingUp,
  Search,
} from "lucide-react";

interface FeedbackEntry {
  id: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  locationSlug: string;
  date: string;
  overallRating: number;
  categoryRatings: Record<string, number>;
  comment: string;
  status: "new" | "reviewed" | "responded";
}

const MOCK_FEEDBACK: FeedbackEntry[] = [
  {
    id: "fb-1",
    orderId: "SI-ABC123",
    customerName: "Jan Kowalski",
    customerPhone: "+48 123 456 789",
    locationSlug: "krakow",
    date: "2026-03-28",
    overallRating: 5,
    categoryRatings: { taste: 5, speed: 4, presentation: 5, value: 5, service: 5 },
    comment: "Best pizza in Kraków! The Margherita was perfect. Will definitely come back.",
    status: "new",
  },
  {
    id: "fb-2",
    orderId: "SI-DEF456",
    customerName: "Anna Nowak",
    customerPhone: "+48 987 654 321",
    locationSlug: "warszawa",
    date: "2026-03-27",
    overallRating: 4,
    categoryRatings: { taste: 5, speed: 3, presentation: 4, value: 4, service: 4 },
    comment: "Food was excellent but had to wait 20 minutes. A bit long for takeout.",
    status: "reviewed",
  },
  {
    id: "fb-3",
    orderId: "SI-GHI789",
    customerName: "Piotr Wiśniewski",
    customerPhone: "+48 555 123 456",
    locationSlug: "krakow",
    date: "2026-03-26",
    overallRating: 3,
    categoryRatings: { taste: 4, speed: 2, presentation: 3, value: 3, service: 3 },
    comment: "Carbonara was decent but lukewarm when I received it. Delivery took too long.",
    status: "responded",
  },
  {
    id: "fb-4",
    orderId: "SI-JKL012",
    customerName: "Maria Lewandowska",
    customerPhone: "+48 111 222 333",
    locationSlug: "warszawa",
    date: "2026-03-25",
    overallRating: 5,
    categoryRatings: { taste: 5, speed: 5, presentation: 5, value: 4, service: 5 },
    comment: "Amazing! The truffle pizza was out of this world. Staff were so friendly!",
    status: "new",
  },
  {
    id: "fb-5",
    orderId: "SI-MNO345",
    customerName: "Tomasz Zieliński",
    customerPhone: "+48 444 555 666",
    locationSlug: "krakow",
    date: "2026-03-24",
    overallRating: 2,
    categoryRatings: { taste: 3, speed: 1, presentation: 2, value: 2, service: 2 },
    comment: "Order was wrong — got Diavola instead of Margherita. Had to wait again for the correction.",
    status: "new",
  },
];

const STATUS_BADGE: Record<string, string> = {
  new: "badge-warning",
  reviewed: "badge-info",
  responded: "badge-active",
};

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-3.5 w-3.5 ${
            s <= rating ? "fill-italia-gold text-italia-gold" : "text-slate-600"
          }`}
        />
      ))}
    </div>
  );
}

export function AdminFeedback() {
  const [filter, setFilter] = useState<"all" | "new" | "reviewed" | "responded">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = MOCK_FEEDBACK.filter((f) => {
    if (filter !== "all" && f.status !== filter) return false;
    if (searchQuery && !f.customerName.toLowerCase().includes(searchQuery.toLowerCase()) && !f.comment.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const avgRating = MOCK_FEEDBACK.reduce((s, f) => s + f.overallRating, 0) / MOCK_FEEDBACK.length;
  const categoryAvgs: Record<string, number> = {};
  const categories = ["taste", "speed", "presentation", "value", "service"];
  for (const cat of categories) {
    categoryAvgs[cat] = MOCK_FEEDBACK.reduce((s, f) => s + (f.categoryRatings[cat] || 0), 0) / MOCK_FEEDBACK.length;
  }

  const newCount = MOCK_FEEDBACK.filter((f) => f.status === "new").length;
  const lowRating = MOCK_FEEDBACK.filter((f) => f.overallRating <= 2).length;

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold admin-text">Customer Feedback</h1>
            <p className="text-sm admin-text-dim">Reviews, ratings, and quality tracking (Kaizen)</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="glass-card p-4">
            <p className="text-2xl font-bold text-italia-gold">{avgRating.toFixed(1)}</p>
            <p className="text-xs admin-text-dim">Average Rating</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-2xl font-bold admin-text">{MOCK_FEEDBACK.length}</p>
            <p className="text-xs admin-text-dim">Total Reviews</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-2xl font-bold text-amber-400">{newCount}</p>
            <p className="text-xs admin-text-dim">Awaiting Review</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-2xl font-bold text-red-400">{lowRating}</p>
            <p className="text-xs admin-text-dim">Low Ratings (≤2)</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-2xl font-bold text-green-400">92%</p>
            <p className="text-xs admin-text-dim">Response Rate</p>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="glass-card-static p-5 mb-6">
          <h3 className="font-semibold admin-text mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            Category Averages
          </h3>
          <div className="grid grid-cols-5 gap-4">
            {categories.map((cat) => {
              const avg = categoryAvgs[cat];
              const isLow = avg < 3.5;
              return (
                <div key={cat} className="text-center">
                  <p className={`text-xl font-bold ${isLow ? "text-red-400" : "text-green-400"}`}>
                    {avg.toFixed(1)}
                  </p>
                  <p className="text-xs admin-text-dim capitalize">{cat}</p>
                  <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isLow ? "bg-red-400" : "bg-green-400"}`}
                      style={{ width: `${(avg / 5) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filter + search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-1 p-1 glass rounded-xl">
            {(["all", "new", "reviewed", "responded"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === f
                    ? "bg-white/12 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                {f === "new" && newCount > 0 && (
                  <span className="ml-1 bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full text-[9px] font-bold">
                    {newCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search feedback..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input pl-8 text-xs w-full"
            />
          </div>
        </div>

        {/* Feedback list */}
        <div className="space-y-3">
          {filtered.map((fb) => (
            <div key={fb.id} className={`glass-card p-5 ${fb.overallRating <= 2 ? "border-l-2 border-l-red-400" : ""}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold admin-text">{fb.customerName}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_BADGE[fb.status]}`}>
                        {fb.status}
                      </span>
                    </div>
                    <p className="text-xs admin-text-dim">
                      {fb.locationSlug} &middot; {fb.date} &middot; Order {fb.orderId}
                    </p>
                  </div>
                </div>
                <StarDisplay rating={fb.overallRating} />
              </div>

              {/* Category mini-ratings */}
              <div className="flex gap-3 mb-3 flex-wrap">
                {Object.entries(fb.categoryRatings).map(([cat, rating]) => (
                  <span
                    key={cat}
                    className={`text-[10px] px-2 py-1 rounded-lg font-medium ${
                      rating >= 4
                        ? "bg-green-500/10 text-green-400"
                        : rating >= 3
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {cat}: {rating}/5
                  </span>
                ))}
              </div>

              {/* Comment */}
              <p className="text-sm admin-text-muted leading-relaxed mb-3">
                &ldquo;{fb.comment}&rdquo;
              </p>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {fb.status === "new" && (
                  <>
                    <button className="glass-btn-green text-xs">
                      <Check className="h-3.5 w-3.5" /> Mark Reviewed
                    </button>
                    <button className="glass-btn-blue text-xs">
                      <Reply className="h-3.5 w-3.5" /> Respond
                    </button>
                  </>
                )}
                {fb.overallRating <= 2 && (
                  <button className="glass-btn text-xs">
                    <AlertTriangle className="h-3.5 w-3.5" /> Flag for Follow-up
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
