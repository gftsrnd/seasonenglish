export interface FrozenMonthlyIllustration { word: string; artifactKey: string }

/** Ready working pictures of an approved framework, projected onto core words whose contract
 * carries no imageUrl: legacy approvals that dropped the URL, and words whose picture was
 * generated or uploaded after approval (a word without a picture stays fillable; a ready one is
 * locked, so a word's projected picture never changes once shown). The frozen contract URL
 * always wins. Done without rewriting the curriculum, hashes or published lessons.
 * The caller must join the owning framework as mf.
 */
export const FROZEN_MONTHLY_ILLUSTRATIONS_SQL = `(select coalesce(jsonb_agg(jsonb_build_object('word', image.word, 'artifactKey', image.artifact_key)), '[]'::jsonb)
  from month_framework_images image
  where image.framework_id = mf.id and mf.status = 'approved'
    and image.status = 'ready' and image.artifact_key is not null)`;

export function withFrozenMonthlyIllustrations<T extends { word: string; imageUrl?: string }>(cores: readonly T[], images: readonly FrozenMonthlyIllustration[] = []): T[] {
  const urls = new Map(images.map(image => [image.word.trim().toLocaleLowerCase("en-US"), `/api/v1/files/content-media/read?artifactKey=${encodeURIComponent(image.artifactKey)}`]));
  return cores.map(core => {
    const imageUrl = core.imageUrl || urls.get(core.word.trim().toLocaleLowerCase("en-US"));
    return imageUrl ? { ...core, imageUrl } : core;
  });
}
