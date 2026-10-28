# Pronunciation asset contract

The verified registry is the default for lesson generation. It contains 19 bundled Ogg Vorbis recordings under `apps/web/public/media/audio/phonemes/`. Each registry and manifest entry records the stable `id`, public `url`, packaged `localPath`, SHA-256, licence, and source page.

`pronunciation.content.phonemeAudioUrl` and `phonemeAudioId` identify the target-only clip. `wordAudioUrls` is a separate optional field and is emitted only when all three selected word clips are registered. Missing word clips therefore warn without suppressing a valid target phoneme clip. No URL is emitted for an unsupported or composite target such as `/wɜː/` or `/st st/`.

The source recordings are Wikimedia Commons phonetic samples and isolated target-sound recordings. The manifest keeps the exact source page and licence for every file; the verifier checks the Ogg signature, non-empty file, SHA-256, URL/local-file mapping, and rejects unregistered media.

## Rollback

To restore the pre-asset behavior without deleting files, pass `EMPTY_PRONUNCIATION_ASSET_REGISTRY` as the optional registry argument to `buildPronunciationAssets` (or to the weekly-generation option). This preserves the lesson and fallback paths while omitting all pronunciation URLs. The repository-level rollback is the single commit that introduced the verified registry and bundled media; reverting that commit restores the previous empty default registry.

Verification: `pnpm verify:pronunciation`.
