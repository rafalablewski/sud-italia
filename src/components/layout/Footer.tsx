import Link from "next/link";
import { Container } from "@/components/ui/Container";
import {
  SITE_NAME,
  COMPANY_NAME,
  CONTACT_EMAIL,
  CONTACT_PHONE,
  SOCIAL_LINKS,
} from "@/lib/constants";
import { getActiveLocations } from "@/data/locations";
import { MapPin, Mail, Phone } from "lucide-react";

export function Footer() {
  const locations = getActiveLocations();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-italia-dark text-white mt-auto">
      <Container className="py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-italia-red flex items-center justify-center">
                <span className="text-white font-heading text-sm font-bold">SI</span>
              </div>
              <span className="text-xl font-heading font-bold">{SITE_NAME}</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Authentic Italian street food by {COMPANY_NAME}. Bringing the flavors of
              Southern Italy to Poland, one food truck at a time.
            </p>
          </div>

          {/* Locations */}
          <div>
            <h3 className="font-heading font-semibold text-lg mb-4">Locations</h3>
            <ul className="space-y-3">
              {locations.map((loc) => (
                <li key={loc.slug}>
                  <Link
                    href={`/locations/${loc.slug}`}
                    className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm"
                  >
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    {loc.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-heading font-semibold text-lg mb-4">Contact</h3>
            <ul className="space-y-3">
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm"
                >
                  <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${CONTACT_PHONE.replace(/\s/g, "")}`}
                  className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm"
                >
                  <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                  {CONTACT_PHONE}
                </a>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h3 className="font-heading font-semibold text-lg mb-4">Follow Us</h3>
            <div className="flex gap-4">
              <a
                href={SOCIAL_LINKS.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                Instagram
              </a>
              <a
                href={SOCIAL_LINKS.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                Facebook
              </a>
              <a
                href={SOCIAL_LINKS.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                TikTok
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-8 text-center text-gray-500 text-sm">
          &copy; {year} {SITE_NAME} by {COMPANY_NAME}. All rights reserved.
        </div>
      </Container>
    </footer>
  );
}
