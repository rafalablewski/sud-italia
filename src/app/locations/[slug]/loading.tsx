export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Hero skeleton */}
      <div className="bg-italia-dark h-72 md:h-96" />

      {/* Category nav skeleton */}
      <div className="border-b border-gray-100 py-4 px-6">
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-9 w-24 bg-gray-200 rounded-full"
            />
          ))}
        </div>
      </div>

      {/* Menu items skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="h-8 w-32 bg-gray-200 rounded mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-32 bg-gray-100 rounded-2xl border border-gray-100"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
