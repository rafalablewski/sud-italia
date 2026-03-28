"use client";

import { useState, useMemo } from "react";
import { MenuItem } from "@/data/types";
import { MenuCategory, MENU_CATEGORY_LABELS } from "@/data/types";
import { Container } from "@/components/ui/Container";
import { MenuCategoryNav } from "./MenuCategoryNav";
import { MenuItemCard } from "./MenuItem";

interface MenuSectionProps {
  items: MenuItem[];
  locationSlug: string;
}

export function MenuSection({ items, locationSlug }: MenuSectionProps) {
  const categories = useMemo(() => {
    const cats = [...new Set(items.map((i) => i.category))];
    const order: MenuCategory[] = [
      "pizza",
      "pasta",
      "antipasti",
      "panini",
      "drinks",
      "desserts",
    ];
    return cats.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [items]);

  const [activeCategory, setActiveCategory] = useState<MenuCategory>(
    categories[0]
  );

  const filteredItems = useMemo(
    () => items.filter((i) => i.category === activeCategory && i.available),
    [items, activeCategory]
  );

  return (
    <section id="menu">
      <MenuCategoryNav
        categories={categories}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
      />

      <Container className="py-8">
        <h2 className="text-2xl font-heading font-bold text-italia-dark mb-6">
          {MENU_CATEGORY_LABELS[activeCategory]}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              locationSlug={locationSlug}
            />
          ))}
        </div>

        {filteredItems.length === 0 && (
          <p className="text-center text-italia-gray py-12">
            No items available in this category right now.
          </p>
        )}
      </Container>
    </section>
  );
}
