import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { TimeSlot, Order } from "@/data/types";

// --- Storage abstraction: Neon Postgres when DATABASE_URL is set, filesystem fallback for local dev ---

const DATA_DIR = join(process.cwd(), ".data");
const useDB = !!process.env.DATABASE_URL;

function sql() {
  return neon(process.env.DATABASE_URL!);
}

let dbInitialized = false;

async function ensureDB() {
  if (dbInitialized) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '[]'::jsonb
    )
  `;
  dbInitialized = true;
}

// Simple per-file lock to prevent concurrent read-modify-write races (filesystem only)
const locks = new Map<string, Promise<void>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.then(() => {}, () => {}));
  return next;
}

async function ensureDataDir() {
  try {
    await access(DATA_DIR);
  } catch {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  if (useDB) {
    try {
      await ensureDB();
      const db = sql();
      const rows = await db`SELECT value FROM kv_store WHERE key = ${key}`;
      if (rows.length === 0) return fallback;
      return rows[0].value as T;
    } catch (err) {
      console.error(`DB read error for ${key}:`, err);
      return fallback;
    }
  }
  await ensureDataDir();
  try {
    const data = await readFile(join(DATA_DIR, key), "utf-8");
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

async function writeJSON<T>(key: string, data: T): Promise<void> {
  if (useDB) {
    await ensureDB();
    const db = sql();
    await db`
      INSERT INTO kv_store (key, value) VALUES (${key}, ${JSON.stringify(data)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(data)}::jsonb
    `;
    return;
  }
  await ensureDataDir();
  await writeFile(join(DATA_DIR, key), JSON.stringify(data, null, 2));
}

// --- Time Slots ---

export async function getSlots(locationSlug?: string, date?: string): Promise<TimeSlot[]> {
  const slots = await readJSON<TimeSlot[]>("slots.json", []);
  return slots.filter((s) => {
    if (locationSlug && s.locationSlug !== locationSlug) return false;
    if (date && s.date !== date) return false;
    return true;
  });
}

export async function getSlotById(id: string): Promise<TimeSlot | undefined> {
  const slots = await readJSON<TimeSlot[]>("slots.json", []);
  return slots.find((s) => s.id === id);
}

export async function createSlot(slot: TimeSlot): Promise<TimeSlot> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    slots.push(slot);
    await writeJSON("slots.json", slots);
    return slot;
  });
}

export async function createSlotsBulk(newSlots: TimeSlot[]): Promise<TimeSlot[]> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    slots.push(...newSlots);
    await writeJSON("slots.json", slots);
    return newSlots;
  });
}

export async function updateSlot(id: string, updates: Partial<TimeSlot>): Promise<TimeSlot | null> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const index = slots.findIndex((s) => s.id === id);
    if (index === -1) return null;
    slots[index] = { ...slots[index], ...updates };
    await writeJSON("slots.json", slots);
    return slots[index];
  });
}

export async function deleteSlot(id: string): Promise<boolean> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const filtered = slots.filter((s) => s.id !== id);
    if (filtered.length === slots.length) return false;
    await writeJSON("slots.json", filtered);
    return true;
  });
}

export async function incrementSlotOrders(id: string): Promise<boolean> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const slot = slots.find((s) => s.id === id);
    if (!slot) return false;
    if (slot.currentOrders >= slot.maxOrders) return false;
    slot.currentOrders += 1;
    await writeJSON("slots.json", slots);
    return true;
  });
}

// --- Available slots for clients ---

export async function getAvailableSlots(
  locationSlug: string,
  date: string,
  fulfillmentType?: string
): Promise<TimeSlot[]> {
  return (await getSlots(locationSlug, date)).filter((s) => {
    if ((s.status ?? "active") !== "active") return false;
    if (s.currentOrders >= s.maxOrders) return false;
    if (fulfillmentType && !s.fulfillmentTypes.includes(fulfillmentType as "takeout" | "delivery")) return false;
    return true;
  });
}

// --- Orders ---

export async function getOrders(locationSlug?: string): Promise<Order[]> {
  const orders = await readJSON<Order[]>("orders.json", []);
  if (!locationSlug) return orders;
  return orders.filter((o) => o.locationSlug === locationSlug);
}

export async function getOrderById(id: string): Promise<Order | undefined> {
  const orders = await readJSON<Order[]>("orders.json", []);
  return orders.find((o) => o.id === id);
}

export async function createOrder(order: Order): Promise<Order> {
  return withLock("orders.json", async () => {
    const orders = await readJSON<Order[]>("orders.json", []);
    orders.push(order);
    await writeJSON("orders.json", orders);
    return order;
  });
}

export async function updateOrderStatus(id: string, status: Order["status"]): Promise<Order | null> {
  return withLock("orders.json", async () => {
    const orders = await readJSON<Order[]>("orders.json", []);
    const index = orders.findIndex((o) => o.id === id);
    if (index === -1) return null;
    orders[index].status = status;
    await writeJSON("orders.json", orders);
    return orders[index];
  });
}

// --- Analytics ---

export interface DailyStats {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
  itemCount: number;
  avgOrderValue: number;
  takeoutCount: number;
  deliveryCount: number;
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
  topItems: { name: string; quantity: number; revenue: number }[];
}

export async function getAnalytics(
  locationSlug?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<DailyStats[]> {
  const orders = (await getOrders(locationSlug)).filter(
    (o) => o.status !== "pending"
  );

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
  profitMargin: number;
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  takeoutCount: number;
  deliveryCount: number;
  dailyStats: DailyStats[];
  categoryBreakdown: Record<string, { revenue: number; cost: number; count: number }>;
  topItems: { name: string; quantity: number; revenue: number }[];
}

export async function getSummary(
  locationSlug?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<SummaryStats> {
  const dailyStats = await getAnalytics(locationSlug, dateFrom, dateTo);

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

export async function getNotifications(): Promise<Notification[]> {
  return readJSON<Notification[]>("notifications.json", []);
}

export async function addNotification(notif: Omit<Notification, "id" | "createdAt" | "read">): Promise<Notification> {
  return withLock("notifications.json", async () => {
    const notifications = await readJSON<Notification[]>("notifications.json", []);
    const entry: Notification = {
      ...notif,
      id: `notif-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    notifications.unshift(entry);
    if (notifications.length > 100) notifications.length = 100;
    await writeJSON("notifications.json", notifications);
    return entry;
  });
}

export async function markNotificationRead(id: string): Promise<boolean> {
  return withLock("notifications.json", async () => {
    const notifications = await readJSON<Notification[]>("notifications.json", []);
    const notif = notifications.find((n) => n.id === id);
    if (!notif) return false;
    notif.read = true;
    await writeJSON("notifications.json", notifications);
    return true;
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  return withLock("notifications.json", async () => {
    const notifications = await readJSON<Notification[]>("notifications.json", []);
    for (const n of notifications) n.read = true;
    await writeJSON("notifications.json", notifications);
  });
}

export async function getUnreadCount(): Promise<number> {
  return (await getNotifications()).filter((n) => !n.read).length;
}
