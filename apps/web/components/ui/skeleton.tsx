import { cn } from '@/lib/utils';

/** Bloco de esqueleto para estados de carregamento. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-card', className)} {...props} />;
}
