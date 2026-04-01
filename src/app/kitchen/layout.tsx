import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kitchen | Sud Italia",
  robots: "noindex, nofollow",
};

export default function KitchenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="admin-bg">{children}</div>;
}
