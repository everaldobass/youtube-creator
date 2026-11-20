import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto padrão enquanto uma rota carrega. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-8 sm:px-6 lg:px-8" aria-busy="true">
      <div className="border-b border-border-soft pb-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-3 h-4 w-full max-w-lg" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-full rounded-xl" />
        ))}
      </div>
    </main>
  );
}
