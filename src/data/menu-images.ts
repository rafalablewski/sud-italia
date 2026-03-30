// Category-level color gradients for items without images
export const CATEGORY_GRADIENTS: Record<string, string> = {
  pizza: "from-red-400 to-orange-300",
  pasta: "from-amber-400 to-yellow-300",
  antipasti: "from-green-400 to-emerald-300",
  panini: "from-orange-400 to-amber-300",
  drinks: "from-blue-400 to-cyan-300",
  desserts: "from-pink-400 to-rose-300",
};

// Category emoji as fallback
export const CATEGORY_EMOJI: Record<string, string> = {
  pizza: "🍕",
  pasta: "🍝",
  antipasti: "🥗",
  panini: "🥪",
  drinks: "🥤",
  desserts: "🍰",
};

export function getItemEmoji(category: string): string {
  return CATEGORY_EMOJI[category] || "🍽️";
}
