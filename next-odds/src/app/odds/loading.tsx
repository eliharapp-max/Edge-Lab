export default function Loading() {
  return (
    <div className="p-6">
      <div className="animate-pulse space-y-3">
        <div className="h-6 w-48 rounded bg-gray-200" />
        <div className="h-10 w-full rounded bg-gray-200" />
        <div className="h-72 w-full rounded bg-gray-200" />
      </div>
    </div>
  );
}
