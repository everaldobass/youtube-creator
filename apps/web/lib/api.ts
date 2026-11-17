import { notFound } from 'next/navigation';
import type { ProjectDto } from '@yt/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  // 404 da API = recurso inexistente (renderiza a página 404 do Next).
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  listProjects: () => request<ProjectDto[]>('/projects'),
  getProject: (id: string) => request<ProjectDto>(`/projects/${id}`),
  createProject: (body: Partial<ProjectDto> = {}) =>
    request<ProjectDto>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  duplicateProject: (id: string) => request<ProjectDto>(`/projects/${id}/duplicate`, { method: 'POST' }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
};

import type {
  DescriptionResponse,
  EditorialResponse,
  ExportResponse,
  ImagesResponse,
  MusicResponse,
  NarrationResponse,
  ScenesResponse,
  TagsResponse,
  ThumbnailsResponse,
  TitleDto,
  VisualAssetsResponse,
} from '@yt/shared';

export const apiServer = {
  listTitles: (id: string) => request<TitleDto[]>(`/projects/${id}/titles`),
  listScenes: (id: string) => request<ScenesResponse>(`/projects/${id}/scenes`),
  editorial: (id: string) => request<EditorialResponse>(`/projects/${id}/editorial`),
  narration: (id: string) => request<NarrationResponse>(`/projects/${id}/narration`),
  images: (id: string) => request<ImagesResponse>(`/projects/${id}/images`),
  visual: (id: string) => request<VisualAssetsResponse>(`/projects/${id}/visual`),
  tags: (id: string) => request<TagsResponse>(`/projects/${id}/tags`),
  thumbnails: (id: string) => request<ThumbnailsResponse>(`/projects/${id}/thumbnails`),
  description: (id: string) => request<DescriptionResponse>(`/projects/${id}/description`),
  exportStatus: (id: string) => request<ExportResponse>(`/projects/${id}/export`),
  music: (id: string) => request<MusicResponse>(`/projects/${id}/music`),
};
