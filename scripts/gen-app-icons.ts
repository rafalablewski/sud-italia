/**
 * Generate the PWA home-screen icons for our two installable apps:
 *
 *   Ottaviano    (customer ordering + loyalty)  → public/icons/ottaviano/*
 *   OttavianoKDS (operator: Admin + Core)        → public/icons/kds/*
 *
 * Each app gets the full set iOS + Android need to install as a distinct
 * home-screen app:
 *   - icon-192.png / icon-512.png   (Android / manifest "any")
 *   - maskable-512.png              (Android adaptive — content in the safe zone)
 *   - apple-touch-180.png           (iOS "Add to Home Screen" — opaque, no alpha)
 *
 * Source art is authored as SVG below and rasterised with sharp (already a
 * Next dependency). Re-run after editing the art:  `npx tsx scripts/gen-app-icons.ts`
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "icons");

/** Ottaviano — customer. Brand red field, cream roundel, an "O" with a
 *  Neapolitan pizza-wedge cut and basil/tomato accents. Warm, appetising. */
function ottavianoSvg(): string {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E11D36"/>
      <stop offset="1" stop-color="#A60C22"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="150" fill="#FFF8F0"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#E11D36" stroke-width="26"/>
  <!-- pizza wedge cut out of the ring's centre -->
  <path d="M256 256 L256 128 A128 128 0 0 1 367 192 Z" fill="#E8B23A"/>
  <path d="M256 256 L256 128 A128 128 0 0 1 367 192 Z" fill="none" stroke="#C8102E" stroke-width="10" stroke-linejoin="round"/>
  <circle cx="282" cy="170" r="11" fill="#C8102E"/>
  <circle cx="312" cy="200" r="9" fill="#1E7A3D"/>
  <circle cx="276" cy="208" r="8" fill="#C8102E"/>
</svg>`;
}

/** OttavianoKDS — operator. Dark kitchen-display field, a 2×2 board of
 *  order tickets with cooking/ready/late status colours + a live-alert dot. */
function kdsSvg(): string {
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#11161F"/>
      <stop offset="1" stop-color="#070A0F"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bgk)"/>
  <!-- four KDS tickets -->
  <g>
    <rect x="118" y="118" width="124" height="124" rx="20" fill="#16202C" stroke="#2B3A4D" stroke-width="4"/>
    <rect x="118" y="118" width="124" height="26" rx="13" fill="#E8B23A"/>
    <rect x="270" y="118" width="124" height="124" rx="20" fill="#16202C" stroke="#2B3A4D" stroke-width="4"/>
    <rect x="270" y="118" width="124" height="26" rx="13" fill="#33C26A"/>
    <rect x="118" y="270" width="124" height="124" rx="20" fill="#16202C" stroke="#2B3A4D" stroke-width="4"/>
    <rect x="118" y="270" width="124" height="26" rx="13" fill="#E1556B"/>
    <rect x="270" y="270" width="124" height="124" rx="20" fill="#16202C" stroke="#2B3A4D" stroke-width="4"/>
    <rect x="270" y="270" width="124" height="26" rx="13" fill="#E8B23A"/>
  </g>
  <!-- ticket lines -->
  <g fill="#3A4A5E">
    <rect x="134" y="164" width="92" height="10" rx="5"/>
    <rect x="134" y="186" width="64" height="10" rx="5"/>
    <rect x="286" y="164" width="92" height="10" rx="5"/>
    <rect x="286" y="186" width="64" height="10" rx="5"/>
    <rect x="134" y="316" width="92" height="10" rx="5"/>
    <rect x="134" y="338" width="64" height="10" rx="5"/>
    <rect x="286" y="316" width="92" height="10" rx="5"/>
    <rect x="286" y="338" width="64" height="10" rx="5"/>
  </g>
  <!-- live alert dot -->
  <circle cx="384" cy="128" r="30" fill="#070A0F"/>
  <circle cx="384" cy="128" r="18" fill="#E11D36"/>
</svg>`;
}

async function emit(name: string, svg: string, opaqueBg: string): Promise<void> {
  const dir = join(OUT, name);
  await mkdir(dir, { recursive: true });
  const buf = Buffer.from(svg);
  const render = (size: number) =>
    sharp(buf, { density: 384 }).resize(size, size, { fit: "contain" }).png();

  // Standard "any" icons (transparent corners outside the rounded rect).
  await writeFile(join(dir, "icon-192.png"), await render(192).toBuffer());
  await writeFile(join(dir, "icon-512.png"), await render(512).toBuffer());

  // Maskable: shrink the art into the central ~80% safe zone on the brand
  // field so Android's adaptive mask never clips the glyph.
  const inner = await sharp(buf, { density: 384 }).resize(410, 410, { fit: "contain" }).png().toBuffer();
  await writeFile(
    join(dir, "maskable-512.png"),
    await sharp({ create: { width: 512, height: 512, channels: 4, background: opaqueBg } })
      .composite([{ input: inner, gravity: "center" }])
      .png()
      .toBuffer(),
  );

  // iOS apple-touch-icon must be fully opaque (iOS adds its own rounding and
  // dislikes alpha) — flatten onto the brand field.
  await writeFile(
    join(dir, "apple-touch-180.png"),
    await sharp(buf, { density: 384 }).resize(180, 180, { fit: "contain" }).flatten({ background: opaqueBg }).png().toBuffer(),
  );

  console.log(`✓ ${name}: icon-192, icon-512, maskable-512, apple-touch-180`);
}

/** Emit the single 1024×1024 opaque App Store icon + asset-catalog Contents.json
 *  into the iOS app's AppIcon.appiconset (Xcode derives all other sizes). App
 *  Store icons must be fully opaque — flatten onto the brand field. */
async function emitIos(svg: string, opaqueBg: string, appDir: string): Promise<void> {
  const dir = join(
    process.cwd(),
    "native",
    "ottaviano-ios",
    appDir,
    "Assets.xcassets",
    "AppIcon.appiconset",
  );
  await mkdir(dir, { recursive: true });
  const png = await sharp(Buffer.from(svg), { density: 512 })
    .resize(1024, 1024, { fit: "contain" })
    .flatten({ background: opaqueBg })
    .png()
    .toBuffer();
  await writeFile(join(dir, "icon-1024.png"), png);
  const contents = {
    images: [{ filename: "icon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
    info: { author: "xcode", version: 1 },
  };
  await writeFile(join(dir, "Contents.json"), JSON.stringify(contents, null, 2) + "\n");
  console.log(`✓ iOS AppIcon → ${appDir}`);
}

async function main(): Promise<void> {
  await emit("ottaviano", ottavianoSvg(), "#A60C22");
  await emit("kds", kdsSvg(), "#070A0F");
  // iOS App Store icon — only the SwiftUI OttavianoKDS app lives at
  // native/ottaviano-ios (operator only; "we build only SwiftUI"). The customer
  // app's iOS icon belongs to the RN app (native/ottaviano-rn), not here.
  await emitIos(kdsSvg(), "#070A0F", "Apps/OttavianoKDS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
