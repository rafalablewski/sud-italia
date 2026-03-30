"use client";

import { useState } from "react";
import { generateReferralCode, REFERRAL_REWARD } from "@/lib/growth-engine";
import { Gift, Copy, Check, Share2, Users } from "lucide-react";

export function ReferralCard() {
  const [code] = useState(() => generateReferralCode("Guest"));
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "Get 10 PLN off at Sud Italia!",
        text: `Use my code ${code} for ${REFERRAL_REWARD.refereeDiscountPLN} PLN off your first order at Sud Italia! Authentic Neapolitan pizza & pasta 🍕`,
        url: `https://suditalia.pl?ref=${code}`,
      }).catch((err) => console.error("Share failed:", err));
    }
  };

  return (
    <div className="bg-gradient-to-br from-italia-red/5 to-purple-500/5 rounded-2xl border border-italia-red/15 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-italia-red/10 flex items-center justify-center">
          <Gift className="h-5 w-5 text-italia-red" />
        </div>
        <div>
          <h3 className="font-heading font-semibold text-italia-dark">
            Give {REFERRAL_REWARD.referrerDiscountPLN} PLN, Get {REFERRAL_REWARD.refereeDiscountPLN} PLN
          </h3>
          <p className="text-xs text-italia-gray">
            Share your code — you both win!
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="flex items-center gap-2 mb-4 text-xs text-italia-gray">
        <div className="flex items-center gap-1.5 flex-1">
          <div className="w-5 h-5 rounded-full bg-italia-red/10 text-italia-red flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            1
          </div>
          <span>Share your code</span>
        </div>
        <div className="w-4 h-px bg-gray-200" />
        <div className="flex items-center gap-1.5 flex-1">
          <div className="w-5 h-5 rounded-full bg-italia-red/10 text-italia-red flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            2
          </div>
          <span>Friend orders</span>
        </div>
        <div className="w-4 h-px bg-gray-200" />
        <div className="flex items-center gap-1.5 flex-1">
          <div className="w-5 h-5 rounded-full bg-italia-red/10 text-italia-red flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            3
          </div>
          <span>Both get rewarded</span>
        </div>
      </div>

      {/* Code display */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 bg-white rounded-xl border-2 border-dashed border-italia-red/20 px-4 py-3 text-center">
          <span className="font-mono font-bold text-lg text-italia-dark tracking-wider">
            {code}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all ${
            copied
              ? "bg-italia-green text-white"
              : "bg-gray-100 text-italia-gray hover:bg-gray-200"
          }`}
        >
          {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
        </button>
      </div>

      {/* Share button */}
      <button
        onClick={handleShare}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-italia-red text-white font-semibold rounded-xl hover:bg-italia-red-dark transition-colors active:scale-[0.98] text-sm"
      >
        <Share2 className="h-4 w-4" />
        Share with Friends
      </button>

      <p className="text-[10px] text-italia-gray text-center mt-2">
        You earn {REFERRAL_REWARD.referrerPoints} bonus loyalty points per referral
      </p>
    </div>
  );
}
