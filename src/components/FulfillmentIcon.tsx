import { Package, Truck, Utensils } from "lucide-react";
import type { FulfillmentType } from "@/data/types";

/** Channel glyph shared by the order tracker, KDS, and admin order views.
 *  delivery → truck, dine-in → utensils, takeout (default) → package. */
export function FulfillmentIcon({
  type,
  className,
}: {
  type: FulfillmentType;
  className?: string;
}) {
  const Icon = type === "delivery" ? Truck : type === "dine-in" ? Utensils : Package;
  return <Icon className={className} />;
}
