import { redirect } from "next/navigation";

// The Core v2 suite lands on the POS till.
export default function CoreV2Index() {
  redirect("/core-v2/pos");
}
