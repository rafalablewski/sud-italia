"use client";

import Link from "next/link";
import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { Menu, X, MapPin } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { getActiveLocations } from "@/data/locations";
import { CartButton } from "@/components/cart/CartButton";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const locations = getActiveLocations();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <Container>
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-8 h-8 rounded-full bg-italia-red flex items-center justify-center">
                <span className="text-white font-heading text-sm font-bold">SI</span>
              </div>
              <span className="text-xl font-heading font-bold text-italia-dark">
                {SITE_NAME}
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/#locations"
              className="text-sm font-medium text-italia-gray hover:text-italia-dark transition-colors"
            >
              Locations
            </Link>
            <Link
              href="/#about"
              className="text-sm font-medium text-italia-gray hover:text-italia-dark transition-colors"
            >
              About
            </Link>
            {locations.map((loc) => (
              <Link
                key={loc.slug}
                href={`/locations/${loc.slug}`}
                className="text-sm font-medium text-italia-gray hover:text-italia-red transition-colors flex items-center gap-1"
              >
                <MapPin className="h-3.5 w-3.5" />
                {loc.city}
              </Link>
            ))}
            <LanguageSwitcher />
            <CartButton />
          </nav>

          {/* Mobile: Cart + Hamburger */}
          <div className="flex items-center gap-3 md:hidden">
            <LanguageSwitcher />
            <CartButton />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2.5 rounded-lg hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {mobileOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <nav className="md:hidden border-t border-gray-100 py-4 space-y-1">
            <Link
              href="/#locations"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 text-base font-medium text-italia-gray hover:text-italia-dark hover:bg-gray-50 rounded-lg"
            >
              Locations
            </Link>
            <Link
              href="/#about"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 text-base font-medium text-italia-gray hover:text-italia-dark hover:bg-gray-50 rounded-lg"
            >
              About
            </Link>
            <div className="border-t border-gray-100 pt-2 mt-2">
              {locations.map((loc) => (
                <Link
                  key={loc.slug}
                  href={`/locations/${loc.slug}`}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 text-base font-medium text-italia-red hover:bg-red-50 rounded-lg"
                >
                  <MapPin className="h-4 w-4" />
                  {loc.name}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </Container>
    </header>
  );
}
