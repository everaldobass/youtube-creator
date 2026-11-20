'use client';

import type { JobDto } from '@yt/shared';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { post } from '@/lib/client-api';

/** Mostra o motivo da falha de um job com o botão "Tentar de novo". */
export function JobError({ job, onRetried }: { job: JobDto; onRetried: () => void }) {
  if (job.status !== 'erro') return null;
  return (
    <Alert
      variant="error"
      className="mt-2.5"
      title="A geração falhou"
      description={job.erro ?? 'O servidor não concluiu esta tarefa.'}
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await post(`/jobs/${job.id}/retry`).catch(() => undefined);
            onRetried();
          }}
        >
          Tentar de novo
        </Button>
      }
    />
  );
}
