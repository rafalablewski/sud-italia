import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { TimeSlot, Order } from "@/data/types";

const DATA_DIR = join(process.cwd(), ".data");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJSON<T>(filename: string, fallback: T): T {
  ensureDataDir();
  const filepath = join(DATA_DIR, filename);
  if (!existsSync(filepath)) return fallback;
  try {
    return JSON.parse(readFileSync(filepath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJSON<T>(filename: string, data: T): void {
  ensureDataDir();
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

// --- Time Slots ---

export function getSlots(locationSlug?: string, date?: string): TimeSlot[] {
  const slots = readJSON<TimeSlot[]>("slots.json", []);
  return slots.filter((s) => {
    if (locationSlug && s.locationSlug !== locationSlug) return false;
    if (date && s.date !== date) return false;
    return true;
  });
}

export function getSlotById(id: string): TimeSlot | undefined {
  const slots = readJSON<TimeSlot[]>("slots.json", []);
  return slots.find((s) => s.id === id);
}

export function createSlot(slot: TimeSlot): TimeSlot {
  const slots = readJSON<TimeSlot[]>("slots.json", []);
  slots.push(slot);
  writeJSON("slots.json", slots);
  return slot;
}

export function updateSlot(id: string, updates: Partial<TimeSlot>): TimeSlot | null {
  const slots = readJSON<TimeSlot[]>("slots.json", []);
  const index = slots.findIndex((s) => s.id === id);
  if (index === -1) return null;
  slots[index] = { ...slots[index], ...updates };
  writeJSON("slots.json", slots);
  return slots[index];
}

export function deleteSlot(id: string): boolean {
  const slots = readJSON<TimeSlot[]>("slots.json", []);
  const filtered = slots.filter((s) => s.id !== id);
  if (filtered.length === slots.length) return false;
  writeJSON("slots.json", filtered);
  return true;
}

export function incrementSlotOrders(id: string): boolean {
  const slots = readJSON<TimeSlot[]>("slots.json", []);
  const slot = slots.find((s) => s.id === id);
  if (!slot) return false;
  if (slot.currentOrders >= slot.maxOrders) return false;
  slot.currentOrders += 1;
  writeJSON("slots.json", slots);
  return true;
}

// --- Available slots for clients ---

export function getAvailableSlots(
  locationSlug: string,
  date: string,
  fulfillmentType?: string
): TimeSlot[] {
  return getSlots(locationSlug, date).filter((s) => {
    if (s.currentOrders >= s.maxOrders) return false;
    if (fulfillmentType && !s.fulfillmentTypes.includes(fulfillmentType as "takeout" | "delivery")) return false;
    return true;
  });
}

// --- Orders ---

export function getOrders(locationSlug?: string): Order[] {
  const orders = readJSON<Order[]>("orders.json", []);
  if (!locationSlug) return orders;
  return orders.filter((o) => o.locationSlug === locationSlug);
}

export function getOrderById(id: string): Order | undefined {
  const orders = readJSON<Order[]>("orders.json", []);
  return orders.find((o) => o.id === id);
}

export function createOrder(order: Order): Order {
  const orders = readJSON<Order[]>("orders.json", []);
  orders.push(order);
  writeJSON("orders.json", orders);
  return order;
}

export function updateOrderStatus(id: string, status: Order["status"]): Order | null {
  const orders = readJSON<Order[]>("orders.json", []);
  const index = orders.findIndex((o) => o.id === id);
  if (index === -1) return null;
  orders[index].status = status;
  writeJSON("orders.json", orders);
  return orders[index];
}

// --- Analytics ---

export interface DailyStats {
  date: string;
  revenue: number; // grosze
  cost: number; // grosze
  profit: number; // grosze
  orderCount: number;
  itemCount: number;
  avgOrderValue: number;
  takeoutCount: number;
  deliveryCount: number;
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
  topItems: { name: string; quantity: number; revenue: number }[];
}

export function getAnalytics(
  locationSlug?: string,
  dateFrom?: string,
  dateTo?: string
): DailyStats[] {
  const orders = getOrders(locationSlug).filter(
    (o) => o.status !== "pending" // only count confirmed+ orders
  );

  // Group orders by their slot date
  const byDate = new Map<string, Order[]>();
  for (const order of orders) {
    const date = order.slotDate || order.createdAt.split("T")[0];
    if (dateFrom && date < dateFrom) continue;
    if (dateTo && date > dateTo) continue;
    const list = byDate.get(date) || [];
    list.push(order);
    byDate.set(date, list);
  }

  const stats: DailyStats[] = [];

  for (const [date, dayOrders] of byDate) {
    let revenue = 0;
    let cost = 0;
    let itemCount = 0;
    let takeoutCount = 0;
    let deliveryCount = 0;
    const categoryMap: Record<string, { revenue: number; cost: number; count: number }> = {};
    const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    for (const order of dayOrders) {
      revenue += order.totalAmount;
      if (order.fulfillmentType === "takeout") takeoutCount++;
      else deliveryCount++;

      for (const ci of order.items) {
        const itemCost = (ci.menuItem.cost || 0) * ci.quantity;
        cost += itemCost;
        itemCount += ci.quantity;

        const cat = ci.menuItem.category;
        if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, cost: 0, count: 0 };
        categoryMap[cat].revenue += ci.menuItem.price * ci.quantity;
        categoryMap[cat].cost += itemCost;
        categoryMap[cat].count += ci.quantity;

        const existing = itemMap.get(ci.menuItem.id);
        if (existing) {
          existing.quantity += ci.quantity;
          existing.revenue += ci.menuItem.price * ci.quantity;
        } else {
          itemMap.set(ci.menuItem.id, {
            name: ci.menuItem.name,
            quantity: ci.quantity,
            revenue: ci.menuItem.price * ci.quantity,
          });
        }
      }
    }

    const topItems = Array.from(itemMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    stats.push({
      date,
      revenue,
      cost,
      profit: revenue - cost,
      orderCount: dayOrders.length,
      itemCount,
      avgOrderValue: dayOrders.length > 0 ? Math.round(revenue / dayOrders.length) : 0,
      takeoutCount,
      deliveryCount,
      categoryBreakdown: categoryMap,
      topItems,
    });
  }

  stats.sort((a, b) => a.date.localeCompare(b.date));
  return stats;
}

export interface SummaryStats {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number; // percentage
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  takeoutCount: number;
  deliveryCount: number;
  dailyStats: DailyStats[];
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
  topItems: { name: string; quantity: number; revenue: number }[];
}

export function getSummary(
  locationSlug?: string,
  dateFrom?: string,
  dateTo?: string
): SummaryStats {
  const dailyStats = getAnalytics(locationSlug, dateFrom, dateTo);

  let totalRevenue = 0;
  let totalCost = 0;
  let totalOrders = 0;
  let totalItems = 0;
  let takeoutCount = 0;
  let deliveryCount = 0;
  const categoryMap: Record<string, { revenue: number; cost: number; count: number }> = {};
  const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const day of dailyStats) {
    totalRevenue += day.revenue;
    totalCost += day.cost;
    totalOrders += day.orderCount;
    totalItems += day.itemCount;
    takeoutCount += day.takeoutCount;
    deliveryCount += day.deliveryCount;

    for (const [cat, data] of Object.entries(day.categoryBreakdown)) {
      if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, cost: 0, count: 0 };
      categoryMap[cat].revenue += data.revenue;
      categoryMap[cat].cost += data.cost;
      categoryMap[cat].count += data.count;
    }

    for (const item of day.topItems) {
      const existing = itemMap.get(item.name);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += item.revenue;
      } else {
        itemMap.set(item.name, { ...item });
      }
    }
  }

  const topItems = Array.from(itemMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  return {
    totalRevenue,
    totalCost,
    totalProfit: totalRevenue - totalCost,
    profitMargin: totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 100) : 0,
    totalOrders,
    totalItems,
    avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    takeoutCount,
    deliveryCount,
    dailyStats,
    categoryBreakdown: categoryMap,
    topItems,
  };
}

// --- Notifications ---

export interface Notification {
  id: string;
  type: "new_order" | "slot_full" | "daily_summary" | "low_slots" | "order_status";
  title: string;
  message: string;
  locationSlug?: string;
  createdAt: string;
  read: boolean;
}

export function getNotifications(): Notification[] {
  return readJSON<Notification[]>("notifications.json", []);
}

export function addNotification(notif: Omit<Notification, "id" | "createdAt" | "read">): Notification {
  const notifications = readJSON<Notification[]>("notifications.json", []);
  const entry: Notification = {
    ...notif,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  notifications.unshift(entry); // newest first
  // Keep only last 100
  if (notifications.length > 100) notifications.length = 100;
  writeJSON("notifications.json", notifications);
  return entry;
}

export function markNotificationRead(id: string): boolean {
  const notifications = readJSON<Notification[]>("notifications.json", []);
  const notif = notifications.find((n) => n.id === id);
  if (!notif) return false;
  notif.read = true;
  writeJSON("notifications.json", notifications);
  return true;
}

export function markAllNotificationsRead(): void {
  const notifications = readJSON<Notification[]>("notifications.json", []);
  for (const n of notifications) n.read = true;
  writeJSON("notifications.json", notifications);
}

export function getUnreadCount(): number {
  return getNotifications().filter((n) => !n.read).length;
}
