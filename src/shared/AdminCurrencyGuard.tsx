"use client";

import { useEffect } from "react";
import { markAdminContext, unmarkAdminContext } from "@/lib/currency";

/** Pins `formatPrice()` to PLN for the duration of the admin client
 *  session. Mounted once at the top of the admin layout. The customer
 *  CurrencySwitcher's mount effect clears the pin when the operator
 *  navigates back to a customer route. See lib/currency.ts header for
 *  the wider design note. */
export function AdminCurrencyGuard() {
  useEffect(() => {
    markAdminContext();
    return () => {
      // On unmount (operator navigates away from any /admin/* route),
      // release the pin so the customer site renders in whichever
      // currency the visitor previously chose.
      unmarkAdminContext();
    };
  }, []);
  return null;
}
