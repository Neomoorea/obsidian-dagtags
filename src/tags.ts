import { App, TFile, getAllTags } from "obsidian";

/**
 * Built from the public metadata API, so inline AND frontmatter tags are included.
 * Returned without the leading "#", in the casing they were written.
 */
export function tagsOfFile(app: App, file: TFile | null | undefined): string[] {
	if (!file) return [];
	const cache = app.metadataCache.getFileCache(file);
	if (!cache) return [];
	return (getAllTags(cache) ?? []).map((tag) => tag.replace(/^#/, ""));
}

/**
 * Every tag in the vault, without "#", de-duplicated case-insensitively.
 * Computed on demand, so there is no cache to invalidate.
 */
export function collectVaultTags(app: App): string[] {
	const seen = new Map<string, string>();
	for (const file of app.vault.getMarkdownFiles()) {
		for (const tag of tagsOfFile(app, file)) {
			const key = tag.toLowerCase();
			if (!seen.has(key)) seen.set(key, tag);
		}
	}
	return [...seen.values()];
}
