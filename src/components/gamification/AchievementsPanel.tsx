"use client";

import { useState } from "react";
import {
  ACHIEVEMENTS,
  Achievement,
  getActiveChallenges,
  getEarnedAchievements,
  Challenge,
} from "@/lib/growth-engine";
import { useCustomer } from "@/store/customer";
import { Trophy, Target, Lock, Clock, ChevronDown, ChevronUp, Flame } from "lucide-react";

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}

export function AchievementsPanel() {
  const { customer } = useCustomer();
  const [expanded, setExpanded] = useState(false);
  const challenges = getActiveChallenges();
  const earnedIds = getEarnedAchievements(customer || { ordersCount: 0, points: 0 });
  const earned = ACHIEVEMENTS.filter((a) => earnedIds.has(a.id));
  const locked = ACHIEVEMENTS.filter((a) => !earnedIds.has(a.id));
  const shown = expanded ? locked : locked.slice(0, 4);

  return (
    <div className="space-y-4">
      {/* Weekly challenges */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-5 w-5 text-italia-red" />
          <h3 className="font-heading font-bold text-lg text-italia-dark">
            Weekly Challenges
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {challenges.map((ch) => (
            <div
              key={ch.id}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm text-italia-dark">
                  {ch.title}
                </h4>
                <span className="flex items-center gap-1 text-[10px] text-italia-red font-medium">
                  <Clock className="h-3 w-3" />
                  {daysUntil(ch.expiresAt)}d left
                </span>
              </div>
              <p className="text-xs text-italia-gray mb-3">
                {ch.description}
              </p>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-italia-red rounded-full transition-all"
                  style={{ width: "33%" }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-italia-gray">
                  1 / {ch.target}
                </span>
                <span className="text-[10px] font-semibold text-italia-gold-dark">
                  +{ch.rewardPoints} pts
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Achievements */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-5 w-5 text-italia-gold" />
          <h3 className="font-heading font-bold text-lg text-italia-dark">
            Achievements
          </h3>
          <span className="text-xs text-italia-gray">
            {earned.length}/{ACHIEVEMENTS.length} unlocked
          </span>
        </div>

        {/* Earned */}
        {earned.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
            {earned.map((a) => (
              <div
                key={a.id}
                className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-italia-gold/10 border border-italia-gold/20 rounded-xl"
              >
                <span className="text-xl">{a.emoji}</span>
                <div>
                  <p className="text-xs font-semibold text-italia-dark">{a.name}</p>
                  <p className="text-[10px] text-italia-gray">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Locked */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {shown.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl opacity-60"
            >
              <span className="text-lg grayscale">{a.emoji}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-italia-dark truncate">
                  {a.name}
                </p>
                <p className="text-[10px] text-italia-gray truncate">
                  {a.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {locked.length > 4 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-italia-red font-medium hover:underline mx-auto"
          >
            {expanded ? (
              <>Show less <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>Show all {locked.length} achievements <ChevronDown className="h-3 w-3" /></>
            )}
          </button>
        )}
      </div>

      {/* Streak indicator */}
      <div className="bg-gradient-to-r from-orange-500/5 to-red-500/5 rounded-xl border border-orange-200/30 p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white flex-shrink-0">
          <Flame className="h-6 w-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-heading font-bold text-lg text-italia-dark">
              2 week streak!
            </p>
            <span className="text-xl">🔥</span>
          </div>
          <p className="text-xs text-italia-gray">
            Order again this week to keep your streak. +30 pts at 3 weeks!
          </p>
        </div>
      </div>
    </div>
  );
}
