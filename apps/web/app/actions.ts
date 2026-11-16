'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

/** Cria um rascunho com os valores padrão e abre a etapa 1. */
export async function createDraftProject() {
  const project = await api.createProject();
  redirect(`/projetos/${project.id}/definicoes`);
}

export async function duplicateProject(formData: FormData) {
  await api.duplicateProject(String(formData.get('id')));
  revalidatePath('/');
}

export async function deleteProject(formData: FormData) {
  await api.deleteProject(String(formData.get('id')));
  revalidatePath('/');
}
