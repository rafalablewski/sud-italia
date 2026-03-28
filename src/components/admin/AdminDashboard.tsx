"use client";

import { AdminNav } from "./AdminNav";
import { CalendarDays, ClipboardList } from "lucide-react";
import Link from "next/link";

export function AdminDashboard() {
  return (
    <>
      <AdminNav />
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold font-heading text-italia-dark mb-6">
          Dashboard
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/admin/slots"
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4 mb-3">
              <div className="w-12 h-12 bg-italia-green/10 rounded-xl flex items-center justify-center">
                <CalendarDays className="h-6 w-6 text-italia-green" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-italia-dark">Time Slots</h2>
                <p className="text-sm text-italia-gray">
                  Manage availability & pickup/delivery times
                </p>
              </div>
            </div>
            <p className="text-sm text-italia-gray">
              Set which hours are open for orders, how many orders per slot, and whether
              each slot supports takeout, delivery, or both.
            </p>
          </Link>

          <Link
            href="/admin/orders"
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4 mb-3">
              <div className="w-12 h-12 bg-italia-red/10 rounded-xl flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-italia-red" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-italia-dark">Orders</h2>
                <p className="text-sm text-italia-gray">
                  View & manage incoming orders
                </p>
              </div>
            </div>
            <p className="text-sm text-italia-gray">
              Track order status from pending to ready. See customer details, items,
              fulfillment type, and scheduled pickup/delivery times.
            </p>
          </Link>
        </div>
      </div>
    </>
  );
}
