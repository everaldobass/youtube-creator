import type { JobDto } from '@yt/shared';

export const jobsAtivos = (jobs: JobDto[]) => jobs.filter((j) => j.status === 'fila' || j.status === 'executando');
export const jobDoAlvo = (jobs: JobDto[], alvoId: string) => jobs.find((j) => j.alvoId === alvoId);
