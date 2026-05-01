import type { Board, Link, Pixel, Website } from '@/generated/prisma/client';
import { findBoard, findLink, findPixel, findWebsite } from '@/queries/prisma';

export async function getEntity(entityId: string): Promise<Website | Link | Pixel | Board | null> {
  // Most permission-check lookups are for websites; try sequentially
  // and short-circuit instead of firing 4 parallel queries to find one row.
  // Use the bare find* variants (no share-attachment side query) since
  // callers only read userId/teamId.
  const website = await findWebsite({ where: { id: entityId } });
  if (website) return website;

  const link = await findLink({ where: { id: entityId } });
  if (link) return link;

  const pixel = await findPixel({ where: { id: entityId } });
  if (pixel) return pixel;

  return findBoard({ where: { id: entityId } });
}
