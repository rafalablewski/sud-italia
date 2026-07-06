import { redirect } from "next/navigation";
import { coreHref } from "@/core/routes";

// Tables management moved INTO Book (below the timeline). This standalone route
// is retired — redirect any bookmark / old link to Book, where the floor-plan
// manager now lives and its KPIs fold into the summary strip. The auth gate is
// handled by Book's own page.
export default function CoreTablesPage() {
  redirect(coreHref("/service/book"));
}
