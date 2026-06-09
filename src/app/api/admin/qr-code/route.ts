import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-middleware";
import QRCode from "qrcode";

// Renders the table-ordering QR as an SVG. Encodes
// <base>/qr?location=<slug>&table=<n> — what a seated guest scans to open
// the QR ordering page. `base` defaults to this request's origin (until the
// qr.<domain> subdomain is wired). Staff+ so the till can print table codes.
export const GET = withAdmin(
  { roles: ["staff"], locationParam: "location" },
  async (req, _ctx, { locationSlug }) => {
    const table = (req.nextUrl.searchParams.get("table") ?? "").trim().slice(0, 40);
    let base = (req.nextUrl.searchParams.get("base") ?? "").trim();
    if (!/^https?:\/\//i.test(base)) base = req.nextUrl.origin;
    base = base.replace(/\/+$/, "");

    const params = new URLSearchParams({ location: locationSlug ?? "" });
    if (table) params.set("table", table);
    const target = `${base}/qr?${params.toString()}`;

    const svg = await QRCode.toString(target, {
      type: "svg",
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
    });
    return new NextResponse(svg, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" },
    });
  },
);
