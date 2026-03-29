"use client";

import { useState, useEffect } from "react";
import { simulateLiveActivity, SPEED_GUARANTEE } from "@/lib/growth-engine";
import { Flame, Clock, TrendingUp, Zap, Users } from "lucide-react";

interface LiveActivityBarProps {
  locationSlug: string;
}

export function LiveActivityBar({ locationSlug }: LiveActivityBarProps) {
  const [activity, setActivity] = useState(() => simulateLiveActivity(locationSlug));

  // Refresh every 30 seconds for real-time feel
  useEffect(() => {
    const interval = setInterval(() => {
      setActivity(simulateLiveActivity(locationSlug));
    }, 30000);
    return () => clearInterval(interval);
  }, [locationSlug]);

  return (
    <div className="bg-gradient-to-r from-italia-dark to-[#2a1a0a] text-white py-2.5 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide text-sm">
          {/* Live order count */}
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

          <div className="w-px h-4 bg-white/15 flex-shrink-0" />

          {/* Currently preparing */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Flame className="h-3.5 w-3.5 text-orange-400" />
            <span className="text-white/80 whitespace-nowrap">
              <strong>{activity.currentlyPreparing}</strong> orders being prepared
            </span>
          </div>

          <div className="w-px h-4 bg-white/15 flex-shrink-0" />

          {/* Popular right now */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <TrendingUp className="h-3.5 w-3.5 text-italia-gold" />
            <span className="text-white/80 whitespace-nowrap">
              Trending: <strong>{activity.popularItemNow}</strong>
            </span>
          </div>

          <div className="w-px h-4 bg-white/15 flex-shrink-0" />

          {/* Speed guarantee */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Zap className="h-3.5 w-3.5 text-yellow-400" />
            <span className="text-white/80 whitespace-nowrap">
              Avg prep: <strong>{activity.avgPrepTimeMinutes} min</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
