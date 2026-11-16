/** Chaves de arquivo no storage, sempre por projeto. */
export const chaveAudio = (projectId: string, sceneId: string) => `projects/${projectId}/audio/${sceneId}.wav`;
export const chaveImagem = (projectId: string, sceneId: string, ext: string) =>
  `projects/${projectId}/images/${sceneId}.${ext}`;
export const chaveThumb = (projectId: string, thumbId: string) =>
  `projects/${projectId}/thumbnails/${thumbId}-${Date.now()}.jpg`;
export const chaveVideo = (projectId: string) => `projects/${projectId}/exports/video.mp4`;
export const chaveMusica = (projectId: string, ext: string) =>
  `projects/${projectId}/music/musica-${Date.now()}.${ext}`;

export const MIME_PARA_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
export const EXT_PARA_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export const extDaChave = (chave: string) => chave.split('.').pop() ?? 'png';
