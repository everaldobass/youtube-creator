import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert
      variant="error"
      title="Não foi possível concluir"
      description={message}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Tentar de novo
          </Button>
        ) : undefined
      }
    />
  );
}
