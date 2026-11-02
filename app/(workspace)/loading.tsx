/** Shown while a workspace page loads its data: the shape of a page, so nothing jumps when it arrives. */
export default function WorkspaceLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className="skeleton h-3 w-32" />
        <div className="skeleton h-8 w-[min(420px,80%)]" />
        <div className="skeleton h-8 w-[min(560px,90%)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="panel space-y-4 p-5"><div className="skeleton h-3 w-24" /><div className="skeleton h-7 w-32" /><div className="skeleton h-3 w-40" /></div>)}
      </div>
      <div className="panel overflow-hidden">
        <div className="border-b border-line px-5 py-4"><div className="skeleton h-4 w-40" /></div>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-6 border-b border-line/70 px-5 py-4 last:border-0">
            <div className="flex-1 space-y-2"><div className="skeleton h-3.5 w-44" /><div className="skeleton h-3 w-20" /></div>
            <div className="skeleton h-3.5 w-20" />
            <div className="skeleton h-6 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
