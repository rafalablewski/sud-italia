"use client";

import { useState, useEffect } from "react";
import { simulateLiveActivity } from "@/lib/growth-engine";
import { Flame, TrendingUp, Zap, Users } from "lucide-react";

interface LiveActivityBarProps {
  locationSlug: string;
}

interface VisibilitySettings {
  ordersInLastHour: boolean;
  currentlyPreparing: boolean;
  trendingItem: boolean;
  avgPrepTime: boolean;
}

export function LiveActivityBar({ locationSlug }: LiveActivityBarProps) {
  const [activity, setActivity] = useState(() => simulateLiveActivity(locationSlug));
  const [visibility, setVisibility] = useState<VisibilitySettings>({
    ordersInLastHour: true,
    currentlyPreparing: true,
    trendingItem: true,
    avgPrepTime: true,
  });

  // Fetch visibility settings from admin config
  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => r.json())
      .then((data) => {
        if (data.liveActivity) {
          setVisibility(data.liveActivity);
        }
      })
      .catch(() => {});
  }, []);

  // Refresh activity data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setActivity(simulateLiveActivity(locationSlug));
    }, 30000);
    return () => clearInterval(interval);
  }, [locationSlug]);

  const items: { key: keyof VisibilitySettings; content: React.ReactNode }[] = [
    {
      key: "ordersInLastHour",
      content: (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
          </span>
          <Users className="h-3.5 w-3.5 text-green-400" />
          <span className="text-white/90 whitespace-nowrap">
            <strong>{activity.ordersInLastHour}</strong> orders in the last hour
          </span>
        </div>
      ),
    },
    {
      key: "currentlyPreparing",
      content: (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Flame className="h-3.5 w-3.5 text-orange-400" />
          <span className="text-white/80 whitespace-nowrap">
            <strong>{activity.currentlyPreparing}</strong> orders being prepared
          </span>
        </div>
      ),
    },
    {
      key: "trendingItem",
      content: (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <TrendingUp className="h-3.5 w-3.5 text-italia-gold" />
          <span className="text-white/80 whitespace-nowrap">
            Trending: <strong>{activity.popularItemNow}</strong>
          </span>
        </div>
      ),
    },
    {
      key: "avgPrepTime",
      content: (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Zap className="h-3.5 w-3.5 text-yellow-400" />
          <span className="text-white/80 whitespace-nowrap">
            Avg prep: <strong>{activity.avgPrepTimeMinutes} min</strong>
          </span>
        </div>
      ),
    },
  ];

  const visibleItems = items.filter((item) => visibility[item.key]);

  if (visibleItems.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-italia-dark to-[#2a1a0a] text-white py-2.5 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide text-sm">
          {visibleItems.map((item, i) => (
            <div key={item.key} className="contents">
              {i > 0 && <div className="w-px h-4 bg-white/15 flex-shrink-0" />}
              {item.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
