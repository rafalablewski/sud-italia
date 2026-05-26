"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  MapPin,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Truck,
  Users,
  Utensils,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  Input,
  ORDER_STATUS_TONE,
  Select,
  Tabs,
  useToast,
} from "./v2/ui";
import type { BadgeTone } from "./v2/ui";
import { useAdminLocation } from "./v2/LocationContext";
import {
  MENU_CATEGORY_LABELS,
  type FloorTable,
  type FulfillmentType,
  type MenuCategory,
  type MenuItem,
} from "@/data/types";

// Prices are grosze (integers); the chain renders PLN with a comma decimal.
function fmtPLN(grosze: number): string {
  return `${(grosze / 100).toFixed(2).replace(".", ",")} zł`;
}

const CHANNELS: { value: FulfillmentType; label: string; icon: React.ReactNode }[] = [
  { value: "takeout", label: "Takeout", icon: <Package className="h-3.5 w-3.5" /> },
  { value: "delivery", label: "Delivery", icon: <Truck className="h-3.5 w-3.5" /> },
  { value: "dine-in", label: "Dine-in", icon: <Utensils className="h-3.5 w-3.5" /> },
];

const ROLE_LABELS: Record<NonNullable<MenuItem["menuRole"]>, { label: string; tone: BadgeTone }> = {
  hero: { label: "Hero", tone: "info" },
  "profit-driver": { label: "Profit", tone: "success" },
  anchor: { label: "Anchor", tone: "brand" },
  lto: { label: "LTO", tone: "warning" },
};

interface CartLine {
  item: MenuItem;
  quantity: number;
}

interface LiveOrder {
  id: string;
  status: string;
  fulfillmentType: FulfillmentType;
  customerName: string;
  partySize?: number;
  tableId?: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
}

const TABLE_STATUS_TONE: Record<FloorTable["status"], BadgeTone> = {
  available: "success",
  seated: "info",
  reserved: "warning",
  "out-of-service": "danger",
};

const CHANNEL_LABEL: Record<FulfillmentType, string> = {
  takeout: "Takeout",
  delivery: "Delivery",
  "dine-in": "Dine-in",
};

export function AdminPos({ menusByLocation }: { menusByLocation: Record<string, MenuItem[]> }) {
  const { location, activeLocations } = useAdminLocation();
  const toast = useToast();

  const locationKeys = useMemo(() => Object.keys(menusByLocation), [menusByLocation]);
  const fallbackLoc = locationKeys[0] ?? "";
  const [pageLoc, setPageLoc] = useState<string>(location || fallbackLoc);
  useEffect(() => {
    if (location && menusByLocation[location]) setPageLoc(location);
  }, [location, menusByLocation]);

  const menu = useMemo(() => menusByLocation[pageLoc] ?? [], [menusByLocation, pageLoc]);

  const locName = useMemo(() => {
    const found = activeLocations.find((l) => l.slug === pageLoc);
    return found?.city ?? pageLoc;
  }, [activeLocations, pageLoc]);

  const [channel, setChannel] = useState<FulfillmentType>("takeout");

  // Menu filtered by channel: deliveryOnly items only appear on the Delivery channel.
  const channelMenu = useMemo(
    () => menu.filter((m) => m.available && (channel === "delivery" || !m.deliveryOnly)),
    [menu, channel],
  );

  // Categories present in the channel-filtered menu, ordered by the canonical label map.
  const categories = useMemo(() => {
    const present = new Set(channelMenu.map((m) => m.category));
    return (Object.keys(MENU_CATEGORY_LABELS) as MenuCategory[]).filter((c) => present.has(c));
  }, [channelMenu]);

  const [activeCat, setActiveCat] = useState<MenuCategory | null>(null);
  useEffect(() => {
    // Keep the active category valid as the channel/location changes.
    if (categories.length === 0) {
      setActiveCat(null);
    } else if (!activeCat || !categories.includes(activeCat)) {
      setActiveCat(categories[0]);
    }
  }, [categories, activeCat]);

  const gridItems = useMemo(
    () => channelMenu.filter((m) => m.category === activeCat),
    [channelMenu, activeCat],
  );

  // --- Cart ---
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [tableId, setTableId] = useState("");
  const [markPaid, setMarkPaid] = useState(false);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const addItem = useCallback((item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        return prev.map((l) => (l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { item, quantity: 1 }];
    });
  }, []);

  const changeQty = useCallback((id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.item.id === id ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const removeLine = useCallback((id: string) => {
    setCart((prev) => prev.filter((l) => l.item.id !== id));
  }, []);

  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + l.item.price * l.quantity, 0),
    [cart],
  );

  // --- Live open checks ---
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!pageLoc) return;
    try {
      const res = await fetch(`/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) return;
      const data: { orders?: LiveOrder[] } = await res.json();
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } finally {
      setOrdersLoading(false);
    }
  }, [pageLoc]);

  useEffect(() => {
    setOrdersLoading(true);
    fetchOrders();
    const id = setInterval(fetchOrders, 10_000);
    return () => clearInterval(id);
  }, [fetchOrders]);

  // --- Tables (dine-in) ---
  const [tables, setTables] = useState<FloorTable[]>([]);
  const tablesLoadedFor = useRef<string>("");

  const fetchTables = useCallback(async () => {
    if (!pageLoc) return;
    try {
      const res = await fetch(`/api/admin/floor/tables?location=${encodeURIComponent(pageLoc)}`);
      if (!res.ok) return;
      const data: FloorTable[] = await res.json();
      setTables(Array.isArray(data) ? data : []);
      tablesLoadedFor.current = pageLoc;
    } catch {
      /* non-fatal — table picker just stays empty */
    }
  }, [pageLoc]);

  // Lazily load tables the first time the operator switches to dine-in for this location.
  useEffect(() => {
    if (channel === "dine-in" && tablesLoadedFor.current !== pageLoc) {
      fetchTables();
    }
  }, [channel, pageLoc, fetchTables]);

  // Reset the dine-in-only selections when the location changes.
  useEffect(() => {
    setTableId("");
    setTables([]);
    tablesLoadedFor.current = "";
  }, [pageLoc]);

  // A table is "occupied" if it's referenced by an active dine-in order on the board.
  const occupiedTableIds = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      if (o.fulfillmentType === "dine-in" && o.tableId) set.add(o.tableId);
    }
    return set;
  }, [orders]);

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === tableId) ?? null,
    [tables, tableId],
  );
  const tableConflict = tableId !== "" && occupiedTableIds.has(tableId);

  const resetCart = useCallback(() => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setPartySize(2);
    setTableId("");
    setMarkPaid(false);
  }, []);

  const sendToKitchen = useCallback(async () => {
    if (cart.length === 0 || !pageLoc) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/pos/orders?location=${encodeURIComponent(pageLoc)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fulfillmentType: channel,
          items: cart.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity })),
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          partySize: channel === "dine-in" ? partySize : undefined,
          tableId: channel === "dine-in" && tableId ? tableId : undefined,
          paid: markPaid,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error("Could not send order", (data as { error?: string }).error);
        return;
      }
      toast.success("Sent to kitchen", `${CHANNEL_LABEL[channel]} · ${fmtPLN(subtotal)}`);
      resetCart();
      await fetchOrders();
    } finally {
      setSending(false);
    }
  }, [
    cart,
    pageLoc,
    channel,
    customerName,
    customerPhone,
    partySize,
    tableId,
    markPaid,
    subtotal,
    toast,
    resetCart,
    fetchOrders,
  ]);

  const locOptions = locationKeys.map((slug) => {
    const found = activeLocations.find((l) => l.slug === slug);
    return { value: slug, label: found?.city ?? slug };
  });

  return (
    <div className="v2-page">
      <header className="v2-page-header">
        <div className="v2-page-title-row">
          <h1 className="v2-page-title">POS</h1>
          <p className="v2-page-subtitle">
            Counter order entry for {locName}. Rings sales straight onto the kitchen display — no
            customer notifications, no pre-booked slot.
          </p>
        </div>
        <div className="v2-page-actions">
          <Tabs
            value={channel}
            onChange={(v) => setChannel(v as FulfillmentType)}
            tabs={CHANNELS.map((c) => ({ value: c.value, label: c.label, icon: c.icon }))}
            variant="pill"
            ariaLabel="Order channel"
          />
        </div>
      </header>

      <div className="v2-filters">
        <div className="v2-field-inline">
          <MapPin className="h-3.5 w-3.5 v2-muted" />
          <Select
            value={pageLoc}
            onChange={(e) => setPageLoc(e.target.value)}
            options={locOptions}
            aria-label="Location"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<RefreshCw className={`h-3.5 w-3.5 ${ordersLoading ? "v2-spin" : ""}`} />}
          onClick={fetchOrders}
        >
          Refresh
        </Button>
      </div>

      <div className="v2-pos-layout">
        {/* LEFT — product grid */}
        <div className="v2-pos-products">
          {categories.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={Utensils}
                  title="No items on this menu"
                  description={
                    channel === "delivery"
                      ? "This location has no available items for delivery."
                      : "This location's menu has no available items."
                  }
                />
              </CardBody>
            </Card>
          ) : (
            <Card padding="none">
              <CardHeader
                title="Menu"
                description={`${gridItems.length} item${gridItems.length === 1 ? "" : "s"} in ${
                  activeCat ? MENU_CATEGORY_LABELS[activeCat] : "—"
                }`}
                actions={
                  <div className="v2-pos-chips" role="tablist" aria-label="Categories">
                    {categories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="tab"
                        aria-selected={c === activeCat}
                        onClick={() => setActiveCat(c)}
                        className={`v2-badge v2-badge-${c === activeCat ? "solid" : "outline"} v2-badge-tone-${
                          c === activeCat ? "brand" : "neutral"
                        } v2-pos-chip`}
                      >
                        {MENU_CATEGORY_LABELS[c]}
                      </button>
                    ))}
                  </div>
                }
              />
              <CardBody>
                <div className="v2-pos-grid">
                  {gridItems.map((item) => {
                    const role = item.menuRole ? ROLE_LABELS[item.menuRole] : null;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="v2-pos-product"
                        onClick={() => addItem(item)}
                      >
                        <div className="v2-pos-product-top">
                          <span className="v2-pos-product-name">{item.name}</span>
                          {(role || item.isLimited) && (
                            <span className="v2-pos-product-badges">
                              {role && (
                                <Badge tone={role.tone} variant="soft">
                                  {role.label}
                                </Badge>
                              )}
                              {item.isLimited && !role && (
                                <Badge tone="warning" variant="soft">
                                  Limited
                                </Badge>
                              )}
                            </span>
                          )}
                        </div>
                        <span className="v2-pos-product-price mono tnum">{fmtPLN(item.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Live open checks */}
          <Card padding="none">
            <CardHeader
              title="Open checks"
              description={`${orders.length} active order${orders.length === 1 ? "" : "s"} on the board`}
            />
            <CardBody>
              {ordersLoading && orders.length === 0 ? (
                <div className="v2-muted">Loading orders…</div>
              ) : orders.length === 0 ? (
                <EmptyState
                  compact
                  icon={CheckCircle2}
                  title="No active orders"
                  description="New counter orders and online orders appear here while they're being prepared."
                />
              ) : (
                <div className="v2-pos-checks">
                  {orders.map((o) => {
                    const table = tables.find((t) => t.id === o.tableId);
                    return (
                      <div key={o.id} className="v2-pos-check">
                        <div className="v2-pos-check-main">
                          <span className="v2-pos-check-name">{o.customerName || "Walk-in"}</span>
                          <span className="v2-pos-check-meta v2-muted">
                            {CHANNEL_LABEL[o.fulfillmentType]}
                            {o.fulfillmentType === "dine-in" && (
                              <>
                                {table ? ` · T${table.number}` : o.tableId ? " · table" : ""}
                                {o.partySize ? ` · ${o.partySize} cov` : ""}
                              </>
                            )}
                            {` · ${o.itemCount} item${o.itemCount === 1 ? "" : "s"}`}
                          </span>
                        </div>
                        <div className="v2-pos-check-side">
                          <span className="mono tnum">{fmtPLN(o.totalAmount)}</span>
                          <Badge tone={ORDER_STATUS_TONE[o.status] ?? "neutral"} variant="soft" dot>
                            {o.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* RIGHT — order ticket */}
        <div className="v2-pos-ticket">
          <Card padding="none">
            <CardHeader
              title="Current order"
              description={CHANNEL_LABEL[channel]}
              actions={
                cart.length > 0 ? (
                  <Button size="sm" variant="ghost" onClick={resetCart}>
                    Clear
                  </Button>
                ) : undefined
              }
            />
            <CardBody>
              {cart.length === 0 ? (
                <EmptyState
                  compact
                  icon={Package}
                  title="Cart is empty"
                  description="Tap menu items on the left to start a check."
                />
              ) : (
                <div className="v2-pos-lines">
                  {cart.map((line) => (
                    <div key={line.item.id} className="v2-pos-line">
                      <div className="v2-pos-line-body">
                        <span className="v2-pos-line-name">{line.item.name}</span>
                        <span className="v2-pos-line-each v2-muted mono tnum">
                          {fmtPLN(line.item.price)} each
                        </span>
                      </div>
                      <div className="v2-pos-stepper">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Decrease ${line.item.name}`}
                          onClick={() => changeQty(line.item.id, -1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="v2-pos-qty mono tnum">{line.quantity}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Increase ${line.item.name}`}
                          onClick={() => changeQty(line.item.id, 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <span className="v2-pos-line-total mono tnum">
                        {fmtPLN(line.item.price * line.quantity)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${line.item.name}`}
                        onClick={() => removeLine(line.item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <div className="v2-stack-12">
              {channel === "dine-in" && (
                <div className="v2-form-row-2">
                  <div className="v2-field">
                    <label className="v2-field-label">Covers</label>
                    <div className="v2-pos-stepper v2-pos-stepper-inline">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Fewer covers"
                        onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="v2-pos-qty mono tnum">
                        <Users className="h-3.5 w-3.5 v2-muted" /> {partySize}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="More covers"
                        onClick={() => setPartySize((n) => Math.min(50, n + 1))}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="v2-field">
                    <label className="v2-field-label">Table</label>
                    <Button
                      variant="secondary"
                      block
                      onClick={() => {
                        if (tablesLoadedFor.current !== pageLoc) fetchTables();
                        setTableDialogOpen(true);
                      }}
                    >
                      {selectedTable ? `Table ${selectedTable.number}` : "Pick a table"}
                    </Button>
                  </div>
                </div>
              )}
              {channel === "dine-in" && tableConflict && (
                <div className="v2-pos-warn">
                  Table {selectedTable?.number ?? ""} already has an active dine-in check. You can
                  still seat this order here.
                </div>
              )}
              <div className="v2-form-row-2">
                <Input
                  label="Customer name (optional)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in"
                />
                <Input
                  label="Phone (optional)"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
              <label className="v2-toggle">
                <input
                  type="checkbox"
                  checked={markPaid}
                  onChange={(e) => setMarkPaid(e.target.checked)}
                />
                <span>
                  <Banknote className="h-3.5 w-3.5" /> Mark as paid
                </span>
              </label>

              <div className="v2-pos-totals">
                <div className="v2-pos-total-row">
                  <span className="v2-muted">Subtotal</span>
                  <span className="mono tnum">{fmtPLN(subtotal)}</span>
                </div>
                <div className="v2-pos-total-row v2-pos-total-grand">
                  <span>Total</span>
                  <span className="mono tnum">{fmtPLN(subtotal)}</span>
                </div>
              </div>

              <Button
                variant="primary"
                block
                loading={sending}
                disabled={cart.length === 0}
                leadingIcon={<Send className="h-3.5 w-3.5" />}
                onClick={sendToKitchen}
              >
                Send to kitchen
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <TablePickerDialog
        open={tableDialogOpen}
        onClose={() => setTableDialogOpen(false)}
        tables={tables}
        selectedId={tableId}
        occupiedIds={occupiedTableIds}
        onPick={(id) => {
          setTableId(id);
          setTableDialogOpen(false);
        }}
      />
    </div>
  );
}

interface TablePickerProps {
  open: boolean;
  onClose: () => void;
  tables: FloorTable[];
  selectedId: string;
  occupiedIds: Set<string>;
  onPick: (id: string) => void;
}

function TablePickerDialog({ open, onClose, tables, selectedId, occupiedIds, onPick }: TablePickerProps) {
  if (!open) return <Dialog open={false} onClose={onClose} />;
  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title="Assign a table"
      description="Tables flagged with a warning already have an active dine-in check — you can still seat here."
      footer={
        <>
          {selectedId && (
            <Button variant="ghost" onClick={() => onPick("")}>
              Clear table
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      {tables.length === 0 ? (
        <EmptyState
          compact
          icon={Utensils}
          title="No tables configured"
          description="Add tables on the Floor page to assign dine-in orders to a table."
        />
      ) : (
        <div className="v2-pos-tables">
          {tables.map((t) => {
            const occupied = occupiedIds.has(t.id);
            const isSelected = t.id === selectedId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onPick(t.id)}
                className={`v2-pos-table ${isSelected ? "is-selected" : ""}`}
              >
                <div className="v2-pos-table-top">
                  <span className="v2-pos-table-num mono">T{t.number}</span>
                  {occupied && (
                    <Badge tone="warning" variant="soft">
                      In use
                    </Badge>
                  )}
                </div>
                <span className="v2-pos-table-meta v2-muted">
                  {t.seats} seat{t.seats === 1 ? "" : "s"}
                  {t.zone ? ` · ${t.zone}` : ""}
                </span>
                <Badge tone={TABLE_STATUS_TONE[t.status]} variant="soft" dot>
                  {t.status}
                </Badge>
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
