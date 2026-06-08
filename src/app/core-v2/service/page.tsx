import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ScaffoldSurface } from "@/core-v2/shell/ScaffoldSurface";

export default async function CoreV2ServicePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <ScaffoldSurface
      eyebrow="Service · Floor & Slots"
      tabs={[{ label: "Floor", active: true }, { label: "Slots" }]}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <path d="M3 11a9 9 0 0 1 18 0Z" />
          <path d="M12 2v3M2 16h20M5 20h14" />
        </svg>
      }
      title="Service — Floor & Slots"
      blurb="The live room: zoned table tiles (seated / booked / free), turn time, covers — plus tonight's capacity fill and the slot list with demand surge."
      step="Wiring in Step 6"
    />
  );
}
