import { Button } from '@/components/ui/button';

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-primary/50 bg-card p-4">
      <p className="text-sm font-medium">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
