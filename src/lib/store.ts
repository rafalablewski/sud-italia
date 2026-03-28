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
