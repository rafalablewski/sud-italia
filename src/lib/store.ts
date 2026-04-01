import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { TimeSlot, Order, Ingredient, Recipe } from "@/data/types";
import { locations as allLocations } from "@/data/locations";
import { normalizePlPhoneE164, phonesEqualPl } from "@/lib/phone";

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

/** Release one slot booking (e.g. when an order is removed). */
export async function decrementSlotOrders(id: string): Promise<boolean> {
  return withLock("slots.json", async () => {
    const slots = await readJSON<TimeSlot[]>("slots.json", []);
    const slot = slots.find((s) => s.id === id);
    if (!slot) return false;
    slot.currentOrders = Math.max(0, slot.currentOrders - 1);
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

export async function deleteOrder(id: string): Promise<boolean> {
  let slotId: string | undefined;
  const removed = await withLock("orders.json", async () => {
    const orders = await readJSON<Order[]>("orders.json", []);
    const index = orders.findIndex((o) => o.id === id);
    if (index === -1) return false;
    slotId = orders[index].slotId;
    orders.splice(index, 1);
    await writeJSON("orders.json", orders);
    return true;
  });
  if (removed && slotId) {
    await decrementSlotOrders(slotId);
  }
  return removed;
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
  /** Best-selling SKUs in the period (by quantity). */
  topSellers: { name: string; quantity: number; revenue: number }[];
  /** Slowest movers — only when at least 2 different menu items sold (otherwise empty). */
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
  const activeLocations = allLocations.filter((l) => l.isActive);
  const locationComparison: LocationComparison[] = [];

  for (const loc of activeLocations) {
    const locOrders = orders.filter((o) => o.locationSlug === loc.slug);
    // Revenue / KPIs: exclude unpaid queue (pending) and voided orders (cancelled)
    const completed = locOrders.filter(
      (o) => o.status !== "pending" && o.status !== "cancelled"
    );
    const cancelled = locOrders.filter((o) => o.status === "cancelled");
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
    const key = normalizePlPhoneE164(order.customerPhone) ?? order.customerPhone;
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
  const completedOrders = orders.filter(
    (o) => o.status !== "pending" && o.status !== "cancelled"
  );
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
  const salesList = Array.from(itemSales.values());
  const topSellers = [...salesList]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);
  // "Worst" only when there is another SKU to compare against
  const worstSellers =
    itemSales.size >= 2
      ? [...salesList].sort((a, b) => a.quantity - b.quantity).slice(0, 5)
      : [];

  // --- Cancellation rate (actual cancelled status, not "pending" new orders) ---
  const cancelled = orders.filter((o) => o.status === "cancelled");
  const cancellationRate =
    orders.length > 0 ? Math.round((cancelled.length / orders.length) * 100) : 0;

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
    topSellers,
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

// --- Menu Overrides ---
// Stores admin-made changes to menu items (price, availability, etc.)
// These get merged on top of the hardcoded menu data.

export interface MenuOverride {
  price?: number;
  cost?: number;
  available?: boolean;
  name?: string;
  description?: string;
}

export async function getMenuOverrides(): Promise<Record<string, MenuOverride>> {
  return readJSON<Record<string, MenuOverride>>("menu-overrides.json", {});
}

export async function setMenuOverride(itemId: string, override: MenuOverride): Promise<void> {
  return withLock("menu-overrides.json", async () => {
    const overrides = await readJSON<Record<string, MenuOverride>>("menu-overrides.json", {});
    overrides[itemId] = { ...overrides[itemId], ...override };
    await writeJSON("menu-overrides.json", overrides);
  });
}

export async function setMenuOverridesBulk(updates: Record<string, MenuOverride>): Promise<void> {
  return withLock("menu-overrides.json", async () => {
    const overrides = await readJSON<Record<string, MenuOverride>>("menu-overrides.json", {});
    for (const [id, update] of Object.entries(updates)) {
      overrides[id] = { ...overrides[id], ...update };
    }
    await writeJSON("menu-overrides.json", overrides);
  });
}

// --- Settings ---

export interface AppSettings {
  deliveryFee: number; // in grosze
  minOrderAmount: number; // in grosze
  businessPhone: string;
  businessEmail: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  deliveryFee: 1000, // 10.00 PLN
  minOrderAmount: 3000, // 30.00 PLN
  businessPhone: "",
  businessEmail: "",
};

export async function getSettings(): Promise<AppSettings> {
  const saved = await readJSON<Partial<AppSettings>>("settings.json", {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
  return withLock("settings.json", async () => {
    const current = await readJSON<Partial<AppSettings>>("settings.json", {});
    const merged = { ...DEFAULT_SETTINGS, ...current, ...updates };
    await writeJSON("settings.json", merged);
    return merged;
  });
}

// --- Growth & Loyalty Settings ---

export interface LoyaltySettings {
  tiers: {
    bronze: { threshold: number; multiplier: number; perks: string[] };
    silver: { threshold: number; multiplier: number; perks: string[] };
    gold: { threshold: number; multiplier: number; perks: string[] };
    platinum: { threshold: number; multiplier: number; perks: string[] };
  };
  rewards: { id: string; name: string; pointsCost: number; description: string; active: boolean }[];
  referral: { referrerPoints: number; refereeDiscountGrosze: number; active: boolean };
  speedGuarantee: { maxMinutes: number; guaranteeText: string; active: boolean };
  abandonedCart: { delaySeconds: number; message: string; active: boolean };
  challenges: { id: string; title: string; description: string; target: number; rewardPoints: number; type: string; active: boolean }[];
  seasonalItems: { id: string; name: string; description: string; category: string; price: number; availableUntil: string; badge: string; active: boolean; locationSlug?: string }[];
  liveActivity: { ordersInLastHour: boolean; currentlyPreparing: boolean; trendingItem: boolean; avgPrepTime: boolean };
}

const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  tiers: {
    bronze: { threshold: 0, multiplier: 1, perks: ["1 point per 1 PLN spent"] },
    silver: { threshold: 500, multiplier: 1.5, perks: ["1.5x points multiplier", "Free birthday dessert"] },
    gold: { threshold: 1500, multiplier: 2, perks: ["2x points multiplier", "Priority ordering", "Free delivery"] },
    platinum: { threshold: 5000, multiplier: 3, perks: ["3x points multiplier", "Exclusive menu items", "VIP events"] },
  },
  rewards: [
    { id: "free-drink", name: "Free Drink", pointsCost: 50, description: "Any drink from the menu", active: true },
    { id: "10-off", name: "10 PLN Off", pointsCost: 100, description: "Discount on your next order", active: true },
    { id: "free-dessert", name: "Free Dessert", pointsCost: 120, description: "Any dessert from the menu", active: true },
    { id: "free-pizza", name: "Free Pizza", pointsCost: 250, description: "Any pizza from the menu", active: true },
    { id: "25-off", name: "25 PLN Off", pointsCost: 250, description: "Big discount on your next order", active: true },
  ],
  referral: { referrerPoints: 100, refereeDiscountGrosze: 1000, active: true },
  speedGuarantee: { maxMinutes: 15, guaranteeText: "Ready in 15 minutes or your next drink is free", active: true },
  abandonedCart: { delaySeconds: 30, message: "Still hungry? 🍕", active: true },
  challenges: [
    { id: "ch-pasta-week", title: "Pasta Week", description: "Order any pasta dish 2 times this week", target: 2, rewardPoints: 40, type: "category", active: true },
    { id: "ch-bring-friend", title: "Bring a Friend", description: "Refer 1 friend who places an order", target: 1, rewardPoints: 50, type: "referral", active: true },
    { id: "ch-triple-order", title: "Hat Trick", description: "Place 3 orders this week", target: 3, rewardPoints: 60, type: "order-count", active: true },
  ],
  seasonalItems: [
    { id: "s1", name: "Tartufo Nero", description: "Black truffle cream, fior di latte, Parmigiano, truffle oil, fresh arugula", category: "pizza", price: 4500, availableUntil: "2026-04-30", badge: "Spring Special", active: true, locationSlug: "krakow" },
    { id: "s2", name: "Panna Cotta al Limoncello", description: "Limoncello-infused panna cotta with candied lemon zest and Amalfi lemon coulis", category: "desserts", price: 2200, availableUntil: "2026-04-30", badge: "Limited Edition", active: true, locationSlug: "krakow" },
    { id: "s3", name: "Risotto Primavera", description: "Carnaroli rice with asparagus, peas, mint, and shaved Parmigiano Reggiano", category: "pasta", price: 3200, availableUntil: "2026-05-31", badge: "Chef's Creation", active: true, locationSlug: "warszawa" },
  ],
  liveActivity: { ordersInLastHour: true, currentlyPreparing: true, trendingItem: true, avgPrepTime: true },
};

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const saved = await readJSON<Partial<LoyaltySettings>>("loyalty-settings.json", {});
  return { ...DEFAULT_LOYALTY_SETTINGS, ...saved };
}

export async function updateLoyaltySettings(updates: Partial<LoyaltySettings>): Promise<LoyaltySettings> {
  return withLock("loyalty-settings.json", async () => {
    const current = await readJSON<Partial<LoyaltySettings>>("loyalty-settings.json", {});
    const merged = { ...DEFAULT_LOYALTY_SETTINGS, ...current, ...updates };
    await writeJSON("loyalty-settings.json", merged);
    return merged;
  });
}

// --- Ingredients ---

export async function getIngredients(): Promise<Ingredient[]> {
  return readJSON<Ingredient[]>("ingredients.json", []);
}

export async function saveIngredient(ingredient: Ingredient): Promise<Ingredient> {
  return withLock("ingredients.json", async () => {
    const list = await readJSON<Ingredient[]>("ingredients.json", []);
    const idx = list.findIndex((i) => i.id === ingredient.id);
    if (idx >= 0) {
      list[idx] = ingredient;
    } else {
      list.push(ingredient);
    }
    await writeJSON("ingredients.json", list);
    return ingredient;
  });
}

export async function deleteIngredient(id: string): Promise<boolean> {
  return withLock("ingredients.json", async () => {
    const list = await readJSON<Ingredient[]>("ingredients.json", []);
    const filtered = list.filter((i) => i.id !== id);
    if (filtered.length === list.length) return false;
    await writeJSON("ingredients.json", filtered);
    return true;
  });
}

// --- Recipes ---

export async function getRecipes(): Promise<Recipe[]> {
  return readJSON<Recipe[]>("recipes.json", []);
}

export async function getRecipe(menuItemId: string): Promise<Recipe | undefined> {
  const recipes = await readJSON<Recipe[]>("recipes.json", []);
  return recipes.find((r) => r.menuItemId === menuItemId);
}

export async function saveRecipe(recipe: Recipe): Promise<Recipe> {
  return withLock("recipes.json", async () => {
    const list = await readJSON<Recipe[]>("recipes.json", []);
    const idx = list.findIndex((r) => r.menuItemId === recipe.menuItemId);
    if (idx >= 0) {
      list[idx] = recipe;
    } else {
      list.push(recipe);
    }
    await writeJSON("recipes.json", list);
    return recipe;
  });
}

export async function deleteRecipe(menuItemId: string): Promise<boolean> {
  return withLock("recipes.json", async () => {
    const list = await readJSON<Recipe[]>("recipes.json", []);
    const filtered = list.filter((r) => r.menuItemId !== menuItemId);
    if (filtered.length === list.length) return false;
    await writeJSON("recipes.json", filtered);
    return true;
  });
}

// Calculate food cost from recipe
export async function calculateFoodCost(menuItemId: string): Promise<number> {
  const recipe = await getRecipe(menuItemId);
  if (!recipe || recipe.ingredients.length === 0) return 0;

  const ingredients = await getIngredients();
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  let totalCost = 0;
  for (const ri of recipe.ingredients) {
    const ing = ingredientMap.get(ri.ingredientId);
    if (!ing) continue;
    totalCost += ing.costPerUnit * ri.quantity * (ri.wasteFactor || 1);
  }

  // Cost per portion
  return Math.round(totalCost / (recipe.yieldPortions || 1));
}

// --- Loyalty Members (phone-only signups without orders) ---

export interface LoyaltyMember {
  phone: string;
  name: string;
  lastName?: string;
  nickname?: string;
  email?: string;
  signedUpAt: string;
}

export async function getLoyaltyMembers(): Promise<LoyaltyMember[]> {
  return readJSON<LoyaltyMember[]>("loyalty-members.json", []);
}

export async function addLoyaltyMember(member: LoyaltyMember): Promise<LoyaltyMember> {
  const canonical = normalizePlPhoneE164(member.phone) || member.phone.trim();
  const toSave: LoyaltyMember = { ...member, phone: canonical };
  return withLock("loyalty-members.json", async () => {
    const list = await readJSON<LoyaltyMember[]>("loyalty-members.json", []);
    if (list.some((m) => phonesEqualPl(m.phone, canonical))) return toSave;
    list.push(toSave);
    await writeJSON("loyalty-members.json", list);
    return toSave;
  });
}

export async function getLoyaltyMember(phone: string): Promise<LoyaltyMember | undefined> {
  const list = await readJSON<LoyaltyMember[]>("loyalty-members.json", []);
  const canonical = normalizePlPhoneE164(phone);
  if (canonical) {
    const hit = list.find((m) => phonesEqualPl(m.phone, canonical));
    if (hit) return hit;
  }
  return list.find((m) => m.phone === phone.trim());
}

export async function updateLoyaltyMember(
  phone: string,
  updates: Partial<Pick<LoyaltyMember, "name" | "lastName" | "nickname" | "email">>
): Promise<LoyaltyMember | null> {
  const canonical = normalizePlPhoneE164(phone) || phone.trim();
  return withLock("loyalty-members.json", async () => {
    const list = await readJSON<LoyaltyMember[]>("loyalty-members.json", []);
    const index = list.findIndex((m) => phonesEqualPl(m.phone, canonical));
    if (index === -1) return null;
    list[index] = { ...list[index], ...updates };
    await writeJSON("loyalty-members.json", list);
    return list[index];
  });
}

// --- Point Adjustments (manual add/remove by admin) ---

export interface PointAdjustment {
  phone: string;
  amount: number;
  reason: string;
  adjustedBy: string;
  adjustedAt: string;
}

export async function getPointAdjustments(): Promise<PointAdjustment[]> {
  return readJSON<PointAdjustment[]>("point-adjustments.json", []);
}

export async function addPointAdjustment(adj: PointAdjustment): Promise<void> {
  return withLock("point-adjustments.json", async () => {
    const list = await readJSON<PointAdjustment[]>("point-adjustments.json", []);
    list.push(adj);
    await writeJSON("point-adjustments.json", list);
  });
}

export async function getManualPointsTotal(phone: string): Promise<number> {
  const all = await getPointAdjustments();
  const canonical = normalizePlPhoneE164(phone);
  return all
    .filter((a) =>
      canonical ? phonesEqualPl(a.phone, canonical) : a.phone.trim() === phone.trim()
    )
    .reduce((sum, a) => sum + a.amount, 0);
}

export async function getAllManualPoints(): Promise<Record<string, number>> {
  const all = await getPointAdjustments();
  const byPhone: Record<string, number> = {};
  for (const adj of all) {
    byPhone[adj.phone] = (byPhone[adj.phone] || 0) + adj.amount;
  }
  return byPhone;
}

// --- Referrals ---

export interface Referral {
  code: string;
  owner: string;
  ownerPhone: string;
  used: number;
  earned: number;
  createdAt: string;
}

export async function getReferrals(): Promise<Referral[]> {
  return readJSON<Referral[]>("referrals.json", []);
}

export async function addReferral(referral: Referral): Promise<Referral> {
  return withLock("referrals.json", async () => {
    const list = await readJSON<Referral[]>("referrals.json", []);
    if (list.some((r) => r.code === referral.code)) return referral;
    list.push(referral);
    await writeJSON("referrals.json", list);
    return referral;
  });
}

export async function deleteReferral(code: string): Promise<boolean> {
  return withLock("referrals.json", async () => {
    const list = await readJSON<Referral[]>("referrals.json", []);
    const initialLength = list.length;
    const filtered = list.filter((r) => r.code !== code);
    if (filtered.length === initialLength) {
      return false;
    }
    await writeJSON("referrals.json", filtered);
    return true;
  });
}

// --- Feedback ---

export interface FeedbackEntry {
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

export async function getFeedback(): Promise<FeedbackEntry[]> {
  return readJSON<FeedbackEntry[]>("feedback.json", []);
}

export async function saveFeedback(entry: FeedbackEntry): Promise<FeedbackEntry> {
  return withLock("feedback.json", async () => {
    const list = await readJSON<FeedbackEntry[]>("feedback.json", []);
    const idx = list.findIndex((f) => f.id === entry.id);
    if (idx >= 0) {
      list[idx] = entry;
    } else {
      list.push(entry);
    }
    await writeJSON("feedback.json", list);
    return entry;
  });
}

export async function updateFeedbackStatus(id: string, status: FeedbackEntry["status"]): Promise<FeedbackEntry | null> {
  return withLock("feedback.json", async () => {
    const list = await readJSON<FeedbackEntry[]>("feedback.json", []);
    const idx = list.findIndex((f) => f.id === id);
    if (idx === -1) return null;
    list[idx].status = status;
    await writeJSON("feedback.json", list);
    return list[idx];
  });
}

// ── Chatbot FAQ ──────────────────────────────────────────────

export interface ChatbotFaq {
  id: string;
  keyword: string;
  response: string;
  hits: number;
}

export async function getChatbotFaqs(): Promise<ChatbotFaq[]> {
  return readJSON<ChatbotFaq[]>("chatbot-faq.json", []);
}

export async function saveChatbotFaq(faq: ChatbotFaq): Promise<ChatbotFaq> {
  return withLock("chatbot-faq.json", async () => {
    const list = await readJSON<ChatbotFaq[]>("chatbot-faq.json", []);
    const idx = list.findIndex((f) => f.id === faq.id);
    if (idx >= 0) {
      list[idx] = faq;
    } else {
      list.push(faq);
    }
    await writeJSON("chatbot-faq.json", list);
    return faq;
  });
}

export async function deleteChatbotFaq(id: string): Promise<boolean> {
  return withLock("chatbot-faq.json", async () => {
    const list = await readJSON<ChatbotFaq[]>("chatbot-faq.json", []);
    const idx = list.findIndex((f) => f.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await writeJSON("chatbot-faq.json", list);
    return true;
  });
}

// --- Upsell / Cross-Sell Settings (per-location) ---

export interface LocationComboDeal {
  id: string;
  name: string;
  description: string;
  categories: string[];
  discountPercent: number;
  minItems: number;
  active: boolean;
}

export interface LocationUpsellConfig {
  popularItems: string[];
  staffPicks: string[];
  preferredCoffee: string;
  preferredDessert: string;
  preferredDrink: string;
  combos: LocationComboDeal[];
}

export type UpsellSettings = Record<string, LocationUpsellConfig>;

export async function getUpsellSettings(): Promise<UpsellSettings> {
  return readJSON<UpsellSettings>("upsell-settings.json", {});
}

export async function updateUpsellSettings(settings: UpsellSettings): Promise<UpsellSettings> {
  return withLock("upsell-settings.json", async () => {
    await writeJSON("upsell-settings.json", settings);
    return settings;
  });
}

export async function updateLocationUpsell(
  locationSlug: string,
  config: LocationUpsellConfig
): Promise<UpsellSettings> {
  return withLock("upsell-settings.json", async () => {
    const settings = await readJSON<UpsellSettings>("upsell-settings.json", {});
    settings[locationSlug] = config;
    await writeJSON("upsell-settings.json", settings);
    return settings;
  });
}
