/** Static plate lookup — ties a registered heritage ID to the artwork
 *  photograph shipped inside the frontend's own ``public/media/artworks/``
 *  folder. Using these deploy-safe, URL-encoded paths means the archive
 *  plates render without the API: pure static hosting, Vercel-safe.
 */
const PLATE_URLS: Record<string, string> = {
  "VR-OD-PAT-2026-000001": "/media/artworks/artwork-01.jpg",
  "VR-OD-PAT-2026-000002": "/media/artworks/artwork-02.jpg",
  "VR-OD-PAT-2026-000003": "/media/artworks/artwork-03.jpg",
  "VR-OD-PAT-2026-000004": "/media/artworks/artwork-04.jpg",
  "VR-OD-PAT-2026-000005": "/media/artworks/artwork-05.jpg",
  "VR-OD-PAT-2026-000006": "/media/artworks/artwork-06.jpg",
  "VR-OD-PAT-2026-000007": "/media/artworks/artwork-07.jpg",
  "VR-OD-PAT-2026-000008": "/media/artworks/artwork-08.jpg",
};

export function plateUrlFor(heritageId: string): string | null {
  return PLATE_URLS[heritageId] ?? null;
}