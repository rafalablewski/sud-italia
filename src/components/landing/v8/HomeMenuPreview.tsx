import { getMenuWithOverrides } from "@/data/menus";
import { getActiveLocations } from "@/data/locations";
import { V8MenuSection } from "./location/V8MenuSection";
import { Bi } from "./Bi";

/**
 * Menu listing on the home page. The mockup shows menu items inline;
 * to honour that without inventing data, the home page renders the
 * primary active location's menu (Kraków by default — the first entry
 * in getActiveLocations()).
 *
 * The "Add" button on each item writes to the cart with that
 * location's slug, so a customer who orders directly from the home
 * page sees Kraków items at checkout. A "Showing Kraków menu" line
 * with a swap link makes the location explicit and matches the
 * "two trucks, one kitchen" voice.
 */
export async function HomeMenuPreview() {
  const locations = getActiveLocations();
  const primary = locations[0];
  if (!primary) return null;

  const fullMenu = await getMenuWithOverrides(primary.slug);
  const initialAvailability: Record<string, boolean> = {};
  for (const item of fullMenu) initialAvailability[item.id] = item.available;

  const otherLocations = locations.filter((l) => l.slug !== primary.slug);

  return (
    <div className="v8-home-menu">
      <div className="v8-home-menu-flag">
        <span>
          <Bi en="Showing the" pl="Pokazuję menu" />{" "}
          <strong>{primary.city}</strong> <Bi en="menu" pl="lokalu" />{" "}
          <span className="v8-it">· il menù di {primary.city}</span>
        </span>
        {otherLocations.length > 0 && (
          <span className="v8-home-menu-switch">
            {otherLocations.map((l) => (
              <a key={l.slug} href={`/locations/${l.slug}`}>
                <Bi en={`See ${l.city}`} pl={`Zobacz ${l.city}`} />{" "}
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </span>
        )}
      </div>
      <V8MenuSection
        items={fullMenu}
        locationSlug={primary.slug}
        initialAvailability={initialAvailability}
      />
    </div>
  );
}
