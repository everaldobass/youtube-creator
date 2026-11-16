'use client';

import type { JobDto } from '@yt/shared';
import { Button } from '@/components/ui/button';
import { post } from '@/lib/client-api';

/** Mostra o motivo da falha de um job com o botão "Tentar de novo". */
export function JobError({ job, onRetried }: { job: JobDto; onRetried: () => void }) {
  if (job.status !== 'erro') return null;
  return (
    <div role="alert" className="mt-2 rounded-md border border-primary/50 p-2 text-xs">
      <p>{job.erro ?? 'A geração falhou.'}</p>
      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        onClick={async () => {
          await post(`/jobs/${job.id}/retry`).catch(() => undefined);
          onRetried();
        }}
      >
        Tentar de novo
      </Button>
    </div>
  );
}
