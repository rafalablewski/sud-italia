// American Growth Engine
// Referral system, gamification, social proof, speed tracking

import { MenuItem } from "@/data/types";

// --- Referral Program (Uber-style viral loop) ---

export interface ReferralCode {
  code: string;
  ownerPhone: string;
  ownerName: string;
  usedCount: number;
  createdAt: string;
}

export function generateReferralCode(name: string): string {
  const clean = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SUD-${clean}-${random}`;
}

export const REFERRAL_REWARD = {
  referrerPoints: 100,   // points for the person who refers
  refereeDiscount: 1000, // 10 PLN off first order for the new customer
  referrerDiscountPLN: 10,
  refereeDiscountPLN: 10,
};

// --- Gamification Engine ---

export type AchievementId =
  | "first-order"
  | "pizza-lover"
  | "pasta-master"
  | "full-menu"
  | "speed-demon"
  | "early-bird"
  | "night-owl"
  | "weekend-warrior"
  | "loyal-5"
  | "loyal-10"
  | "loyal-25"
  | "big-spender"
  | "social-butterfly"
  | "review-star"
  | "streak-3"
  | "streak-7"
  | "streak-30";

export interface Achievement {
  id: AchievementId;
  name: string;
  description: string;
  emoji: string;
  pointsReward: number;
  category: "orders" | "menu" | "social" | "streaks";
}

export const ACHIEVEMENTS: Achievement[] = [
  // Order milestones
  { id: "first-order", name: "First Bite", description: "Place your first order", emoji: "🍕", pointsReward: 10, category: "orders" },
  { id: "loyal-5", name: "Regular", description: "Place 5 orders", emoji: "🔥", pointsReward: 25, category: "orders" },
  { id: "loyal-10", name: "Super Fan", description: "Place 10 orders", emoji: "⭐", pointsReward: 50, category: "orders" },
  { id: "loyal-25", name: "Legend", description: "Place 25 orders", emoji: "👑", pointsReward: 150, category: "orders" },
  { id: "big-spender", name: "Big Spender", description: "Spend 500 PLN total", emoji: "💰", pointsReward: 75, category: "orders" },

  // Menu exploration
  { id: "pizza-lover", name: "Pizza Lover", description: "Try 5 different pizzas", emoji: "🍕", pointsReward: 30, category: "menu" },
  { id: "pasta-master", name: "Pasta Master", description: "Try all pasta dishes", emoji: "🍝", pointsReward: 30, category: "menu" },
  { id: "full-menu", name: "Menu Explorer", description: "Order from every category", emoji: "🗺️", pointsReward: 100, category: "menu" },

  // Timing
  { id: "early-bird", name: "Early Bird", description: "Order before 12:00", emoji: "🌅", pointsReward: 10, category: "orders" },
  { id: "night-owl", name: "Night Owl", description: "Order after 21:00", emoji: "🦉", pointsReward: 10, category: "orders" },
  { id: "weekend-warrior", name: "Weekend Warrior", description: "Order every weekend for a month", emoji: "⚔️", pointsReward: 40, category: "orders" },
  { id: "speed-demon", name: "Speed Demon", description: "Complete checkout in under 60 seconds", emoji: "⚡", pointsReward: 15, category: "orders" },

  // Social
  { id: "social-butterfly", name: "Social Butterfly", description: "Share an order or refer a friend", emoji: "🦋", pointsReward: 20, category: "social" },
  { id: "review-star", name: "Review Star", description: "Leave 5 reviews", emoji: "📝", pointsReward: 30, category: "social" },

  // Streaks
  { id: "streak-3", name: "On a Roll", description: "Order 3 weeks in a row", emoji: "🎯", pointsReward: 30, category: "streaks" },
  { id: "streak-7", name: "Unstoppable", description: "Order 7 weeks in a row", emoji: "🔥", pointsReward: 75, category: "streaks" },
  { id: "streak-30", name: "Iron Will", description: "Order every week for 30 weeks", emoji: "💎", pointsReward: 300, category: "streaks" },
];

// --- Weekly Challenges ---

export interface Challenge {
  id: string;
  title: string;
  description: string;
  target: number;
  reward: string;
  rewardPoints: number;
  expiresAt: string;
  type: "order-count" | "category" | "amount" | "referral";
}

export function getActiveChallenges(): Challenge[] {
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  const expires = endOfWeek.toISOString().split("T")[0];

  return [
    {
      id: "ch-pasta-week",
      title: "Pasta Week",
      description: "Order any pasta dish 2 times this week",
      target: 2,
      reward: "Free Bruschetta",
      rewardPoints: 40,
      expiresAt: expires,
      type: "category",
    },
    {
      id: "ch-bring-friend",
      title: "Bring a Friend",
      description: "Refer 1 friend who places an order",
      target: 1,
      reward: "50 bonus points",
      rewardPoints: 50,
      expiresAt: expires,
      type: "referral",
    },
    {
      id: "ch-triple-order",
      title: "Hat Trick",
      description: "Place 3 orders this week",
      target: 3,
      reward: "Free dessert",
      rewardPoints: 60,
      expiresAt: expires,
      type: "order-count",
    },
  ];
}

// --- Social Proof / Live Activity ---

export interface LiveActivity {
  ordersInLastHour: number;
  currentlyPreparing: number;
  popularItemNow: string;
  avgPrepTimeMinutes: number;
}

export function simulateLiveActivity(locationSlug: string): LiveActivity {
  const hour = new Date().getHours();
  const isPeak = hour >= 12 && hour <= 14 || hour >= 18 && hour <= 21;
  const base = isPeak ? 8 : 3;

  return {
    ordersInLastHour: base + Math.floor(Math.random() * 5),
    currentlyPreparing: Math.floor(Math.random() * (isPeak ? 6 : 3)) + 1,
    popularItemNow: isPeak ? "Margherita" : "Spaghetti Carbonara",
    avgPrepTimeMinutes: isPeak ? 14 : 9,
  };
}

// --- Speed Guarantee ---

export const SPEED_GUARANTEE = {
  maxMinutes: 15,
  guaranteeText: "Ready in 15 minutes or your next drink is free",
  disclaimer: "Applies to takeout orders placed during off-peak hours",
};

// --- Reorder from History ---

export interface PastOrder {
  orderId: string;
  date: string;
  items: { name: string; quantity: number; price: number; id: string }[];
  total: number;
  locationSlug: string;
}

// Simulated past orders — in production, fetched from DB by phone number
export function getPastOrders(phone: string): PastOrder[] {
  if (!phone) return [];
  return [
    {
      orderId: "SI-ABC123",
      date: "2026-03-22",
      items: [
        { name: "Margherita", quantity: 1, price: 2800, id: "krk-pizza-margherita" },
        { name: "Limonata Fresca", quantity: 1, price: 1200, id: "krk-drink-limonata" },
        { name: "Tiramisù", quantity: 1, price: 1800, id: "krk-dessert-tiramisu" },
      ],
      total: 5800,
      locationSlug: "krakow",
    },
    {
      orderId: "SI-DEF456",
      date: "2026-03-15",
      items: [
        { name: "Diavola", quantity: 2, price: 3200, id: "krk-pizza-diavola" },
        { name: "Aranciata", quantity: 2, price: 1000, id: "krk-drink-aranciata" },
      ],
      total: 8400,
      locationSlug: "krakow",
    },
  ];
}
