"use client";

import { SPEED_GUARANTEE } from "@/lib/growth-engine";
import { Zap, Clock } from "lucide-react";

export function SpeedGuarantee() {
  return (
    <div className="flex items-center gap-3 bg-gradient-to-r from-yellow-400/10 to-orange-400/5 rounded-xl border border-yellow-300/20 px-4 py-3 mb-4">
      <div className="w-9 h-9 rounded-lg bg-yellow-400/15 flex items-center justify-center flex-shrink-0">
        <Zap className="h-5 w-5 text-yellow-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-italia-dark flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-yellow-600" />
          {SPEED_GUARANTEE.maxMinutes}-Minute Guarantee
        </p>
        <p className="text-xs text-italia-gray">
          {SPEED_GUARANTEE.guaranteeText}
        </p>
      </div>
    </div>
  );
}
