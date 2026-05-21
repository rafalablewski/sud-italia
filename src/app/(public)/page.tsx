import V8Landing from "@/components/landing/v8";

// Re-render the home page every 10 minutes so admin edits to loyalty
// settings (read by SociSection) propagate without a full deploy.
export const revalidate = 600;

export default function Home() {
  return <V8Landing />;
}
