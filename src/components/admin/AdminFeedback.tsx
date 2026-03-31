"use client";

import { useState, useEffect } from "react";
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

function SkeletonCard() {
  return (
    <div className="glass-card p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="h-4 w-32 bg-white/10 rounded mb-2" />
          <div className="h-3 w-48 bg-white/10 rounded" />
        </div>
        <div className="h-4 w-20 bg-white/10 rounded" />
      </div>
      <div className="flex gap-3 mb-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-6 w-16 bg-white/10 rounded-lg" />
        ))}
      </div>
      <div className="h-4 w-full bg-white/10 rounded mb-2" />
      <div className="h-4 w-3/4 bg-white/10 rounded" />
    </div>
  );
}

function SkeletonStat() {
  return (
    <div className="glass-card p-4 animate-pulse">
      <div className="h-7 w-12 bg-white/10 rounded mb-1" />
      <div className="h-3 w-20 bg-white/10 rounded" />
    </div>
  );
}

export function AdminFeedback() {
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "reviewed" | "responded">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/admin/feedback")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch feedback");
        return res.json();
      })
      .then((data: FeedbackEntry[]) => {
        setFeedback(data);
      })
      .catch((err) => {
        console.error("Error fetching feedback:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = feedback.filter((f) => {
    if (filter !== "all" && f.status !== filter) return false;
    if (searchQuery && !f.customerName.toLowerCase().includes(searchQuery.toLowerCase()) && !f.comment.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const avgRating = feedback.length > 0
    ? feedback.reduce((s, f) => s + f.overallRating, 0) / feedback.length
    : 0;

  const categories = ["taste", "speed", "presentation", "value", "service"];
  const categoryAvgs: Record<string, number> = {};
  for (const cat of categories) {
    const entries = feedback.filter((f) => f.categoryRatings[cat] != null);
    categoryAvgs[cat] = entries.length > 0
      ? entries.reduce((s, f) => s + (f.categoryRatings[cat] || 0), 0) / entries.length
      : 0;
  }

  const newCount = feedback.filter((f) => f.status === "new").length;
  const lowRating = feedback.filter((f) => f.overallRating <= 2).length;
  const respondedCount = feedback.filter((f) => f.status === "responded").length;
  const responseRate = feedback.length > 0
    ? Math.round((respondedCount / feedback.length) * 100)
    : 0;

  async function handleUpdateStatus(id: string, status: FeedbackEntry["status"]) {
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated: FeedbackEntry = await res.json();
      setFeedback((prev) => prev.map((f) => (f.id === id ? updated : f)));
    } catch (err) {
      console.error("Error updating feedback status:", err);
    }
  }

  return (
    <>
      <AdminNav />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-md bg-white/6 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold admin-text">Customer Feedback</h1>
            <p className="text-sm admin-text-dim">Reviews, ratings, and quality tracking (Kaizen)</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {loading ? (
            <>
              <SkeletonStat />
              <SkeletonStat />
              <SkeletonStat />
              <SkeletonStat />
              <SkeletonStat />
            </>
          ) : (
            <>
              <div className="glass-card p-4">
                <p className="text-2xl font-bold text-italia-gold">
                  {feedback.length > 0 ? avgRating.toFixed(1) : "\u2014"}
                </p>
                <p className="text-xs admin-text-dim">Average Rating</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-2xl font-bold admin-text">{feedback.length}</p>
                <p className="text-xs admin-text-dim">Total Reviews</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-2xl font-bold text-amber-400">{newCount}</p>
                <p className="text-xs admin-text-dim">Awaiting Review</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-2xl font-bold text-red-400">{lowRating}</p>
                <p className="text-xs admin-text-dim">Low Ratings (&le;2)</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-2xl font-bold text-green-400">
                  {feedback.length > 0 ? `${responseRate}%` : "\u2014"}
                </p>
                <p className="text-xs admin-text-dim">Response Rate</p>
              </div>
            </>
          )}
        </div>

        {/* Category breakdown */}
        <div className="glass-card-static p-5 mb-6">
          <h3 className="font-semibold admin-text mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            Category Averages
          </h3>
          {loading ? (
            <div className="grid grid-cols-5 gap-4 animate-pulse">
              {categories.map((cat) => (
                <div key={cat} className="text-center">
                  <div className="h-6 w-10 bg-white/10 rounded mx-auto mb-1" />
                  <div className="h-3 w-16 bg-white/10 rounded mx-auto mb-1" />
                  <div className="w-full h-1 bg-white/10 rounded-full mt-1" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-4">
              {categories.map((cat) => {
                const avg = categoryAvgs[cat];
                const isLow = avg < 3.5;
                return (
                  <div key={cat} className="text-center">
                    <p className={`text-xl font-bold ${feedback.length === 0 ? "admin-text-dim" : isLow ? "text-red-400" : "text-green-400"}`}>
                      {feedback.length > 0 ? avg.toFixed(1) : "\u2014"}
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
          )}
        </div>

        {/* Filter + search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-1 p-1 glass rounded-lg">
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
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : filtered.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <MessageSquare className="h-8 w-8 text-slate-500 mx-auto mb-2" />
              <p className="admin-text-dim text-sm">
                {feedback.length === 0 ? "No feedback yet." : "No feedback matches your filters."}
              </p>
            </div>
          ) : (
            filtered.map((fb) => (
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
                      <button
                        className="glass-btn-green text-xs"
                        onClick={() => handleUpdateStatus(fb.id, "reviewed")}
                      >
                        <Check className="h-3.5 w-3.5" /> Mark Reviewed
                      </button>
                      <button
                        className="glass-btn-blue text-xs"
                        onClick={() => handleUpdateStatus(fb.id, "responded")}
                      >
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
            ))
          )}
        </div>
      </div>
    </>
  );
}
