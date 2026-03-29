"use client";

import { useState } from "react";
import { AbandonedCartBanner } from "./AbandonedCartBanner";
import { CartDrawer } from "./CartDrawer";

export function AbandonedCartWrapper() {
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <>
      <AbandonedCartBanner onOpenCart={() => setCartOpen(true)} />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
