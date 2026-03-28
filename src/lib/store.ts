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

export async function updateSlotsBulk(ids: string[], updates: Partial<TimeSlot>): Promise<TimeSlot[]> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const idSet = new Set(ids);
    const updated: TimeSlot[] = [];
    for (const slot of slots) {
      if (idSet.has(slot.id)) {
        Object.assign(slot, updates);
        updated.push(slot);
      }
    }
    await writeJSON("slots.json", slots);
    return updated;
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

export async function deleteSlotsBulk(ids: string[]): Promise<number> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const idSet = new Set(ids);
    const filtered = slots.filter((s) => !idSet.has(s.id));
    const deletedCount = slots.length - filtered.length;
    await writeJSON("slots.json", filtered);
    return deletedCount;
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

// --- Insights ---

export interface SlotUtilization {
  time: string;
  totalCapacity: number;
  totalUsed: number;
  utilization: number; // 0-100
  slotCount: number;
}

export interface LocationComparison {
  locationSlug: string;
  city: string;
  revenue: number;
  profit: number;
  profitMargin: number;
  orderCount: number;
  avgOrderValue: number;
  totalItems: number;
  avgItemsPerOrder: number;
  takeoutCount: number;
  deliveryCount: number;
  cancelledCount: number;
  cancellationRate: number;
}

export interface CustomerMetric {
  name: string;
  phone: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
}

export interface InsightsData {
  slotUtilization: SlotUtilization[];
  locationComparison: LocationComparison[];
  repeatCustomers: CustomerMetric[];
  avgItemsPerOrder: number;
  worstSellers: { name: string; quantity: number; revenue: number }[];
  cancelledOrders: number;
  cancellationRate: number;
  peakHours: { hour: number; orderCount: number; revenue: number }[];
}

export async function getInsights(dateFrom?: string, dateTo?: string): Promise<InsightsData> {
  const allSlots = await readJSON<TimeSlot[]>("slots.json", []);
  const allOrders = await readJSON<Order[]>("orders.json", []);

  // Filter by date range
  const slots = allSlots.filter((s) => {
    if (dateFrom && s.date < dateFrom) return false;
    if (dateTo && s.date > dateTo) return false;
    return true;
  });

  const orders = allOrders.filter((o) => {
    const date = o.slotDate || o.createdAt.split("T")[0];
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;
    return true;
  });

  // --- Slot utilization by time ---
  const byTime = new Map<string, { capacity: number; used: number; count: number }>();
  for (const slot of slots) {
    if ((slot.status ?? "active") !== "active") continue;
    const existing = byTime.get(slot.time) || { capacity: 0, used: 0, count: 0 };
    existing.capacity += slot.maxOrders;
    existing.used += slot.currentOrders;
    existing.count += 1;
    byTime.set(slot.time, existing);
  }
  const slotUtilization: SlotUtilization[] = Array.from(byTime.entries())
    .map(([time, d]) => ({
      time,
      totalCapacity: d.capacity,
      totalUsed: d.used,
      utilization: d.capacity > 0 ? Math.round((d.used / d.capacity) * 100) : 0,
      slotCount: d.count,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  // --- Location comparison ---
  const { locations } = await import("@/data/locations");
  const activeLocations = locations.filter((l) => l.isActive);
  const locationComparison: LocationComparison[] = [];

  for (const loc of activeLocations) {
    const locOrders = orders.filter((o) => o.locationSlug === loc.slug);
    const completed = locOrders.filter((o) => o.status !== "pending");
    const cancelled = locOrders.filter((o) => o.status === "pending");
    let revenue = 0;
    let cost = 0;
    let totalItems = 0;
    let takeout = 0;
    let delivery = 0;

    for (const order of completed) {
      revenue += order.totalAmount;
      if (order.fulfillmentType === "takeout") takeout++;
      else delivery++;
      for (const ci of order.items) {
        cost += (ci.menuItem.cost || 0) * ci.quantity;
        totalItems += ci.quantity;
      }
    }

    locationComparison.push({
      locationSlug: loc.slug,
      city: loc.city,
      revenue,
      profit: revenue - cost,
      profitMargin: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0,
      orderCount: completed.length,
      avgOrderValue: completed.length > 0 ? Math.round(revenue / completed.length) : 0,
      totalItems,
      avgItemsPerOrder: completed.length > 0 ? Math.round((totalItems / completed.length) * 10) / 10 : 0,
      takeoutCount: takeout,
      deliveryCount: delivery,
      cancelledCount: cancelled.length,
      cancellationRate: locOrders.length > 0 ? Math.round((cancelled.length / locOrders.length) * 100) : 0,
    });
  }

  // --- Repeat customers ---
  const customerMap = new Map<string, CustomerMetric>();
  for (const order of orders) {
    const key = order.customerPhone;
    const existing = customerMap.get(key);
    if (existing) {
      existing.orderCount += 1;
      existing.totalSpent += order.totalAmount;
      if (order.createdAt > existing.lastOrderDate) {
        existing.lastOrderDate = order.createdAt;
        existing.name = order.customerName;
      }
    } else {
      customerMap.set(key, {
        name: order.customerName,
        phone: order.customerPhone,
        orderCount: 1,
        totalSpent: order.totalAmount,
        lastOrderDate: order.createdAt,
      });
    }
  }
  const repeatCustomers = Array.from(customerMap.values())
    .filter((c) => c.orderCount > 1)
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  // --- Avg items per order ---
  const completedOrders = orders.filter((o) => o.status !== "pending");
  let totalItemsAll = 0;
  for (const o of completedOrders) {
    for (const ci of o.items) totalItemsAll += ci.quantity;
  }
  const avgItemsPerOrder = completedOrders.length > 0
    ? Math.round((totalItemsAll / completedOrders.length) * 10) / 10
    : 0;

  // --- Worst sellers (all items, sorted ascending by quantity) ---
  const itemSales = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const order of completedOrders) {
    for (const ci of order.items) {
      const existing = itemSales.get(ci.menuItem.id);
      if (existing) {
        existing.quantity += ci.quantity;
        existing.revenue += ci.menuItem.price * ci.quantity;
      } else {
        itemSales.set(ci.menuItem.id, {
          name: ci.menuItem.name,
          quantity: ci.quantity,
          revenue: ci.menuItem.price * ci.quantity,
        });
      }
    }
  }
  const worstSellers = Array.from(itemSales.values())
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 5);

  // --- Cancellation rate ---
  const cancelled = orders.filter((o) => o.status === "pending");
  const cancellationRate = orders.length > 0 ? Math.round((cancelled.length / orders.length) * 100) : 0;

  // --- Peak hours ---
  const hourMap = new Map<number, { count: number; revenue: number }>();
  for (const order of completedOrders) {
    const hour = parseInt(order.slotTime?.split(":")[0] || "0", 10);
    const existing = hourMap.get(hour) || { count: 0, revenue: 0 };
    existing.count += 1;
    existing.revenue += order.totalAmount;
    hourMap.set(hour, existing);
  }
  const peakHours = Array.from(hourMap.entries())
    .map(([hour, d]) => ({ hour, orderCount: d.count, revenue: d.revenue }))
    .sort((a, b) => a.hour - b.hour);

  return {
    slotUtilization,
    locationComparison,
    repeatCustomers,
    avgItemsPerOrder,
    worstSellers,
    cancelledOrders: cancelled.length,
    cancellationRate,
    peakHours,
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
