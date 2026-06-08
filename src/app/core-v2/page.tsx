import { redirect } from "next/navigation";

// Core v2's operational default is the POS — the till the truck opens on.
export default function CoreV2Index() {
  redirect("/core-v2/pos");
}
