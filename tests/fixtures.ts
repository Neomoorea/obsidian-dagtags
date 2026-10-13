import type { FakeEntry } from "./native-bases-search";

export interface NoteSpec {
	/** Inline tags, written with the leading "#". */
	tags?: string[];
	/** Frontmatter tags, written without it. */
	frontmatter?: string[];
	/** Displayed Bases properties. */
	props?: Record<string, string>;
}

/** A fake vault: an `app` for the plugin and the Bases entries a view would hold for it. */
export function makeVault(notes: Record<string, NoteSpec>) {
	const files = Object.keys(notes).map((path) => ({ path }));
	const specs = new Map(files.map((file) => [file, notes[file.path]]));

	const app = {
		vault: { getMarkdownFiles: () => files },
		metadataCache: {
			getFileCache: (file: { path: string }) => {
				const spec = specs.get(file);
				if (!spec) return null;
				return {
					tags: (spec.tags ?? []).map((tag) => ({ tag })),
					frontmatter: spec.frontmatter ? { tags: spec.frontmatter } : undefined,
				};
			},
		},
		workspace: { on: () => ({}), getLeavesOfType: () => [] },
	};

	const entries: (FakeEntry & { file: { path: string } })[] = files.map((file) => ({
		file,
		getValue: (property: string) => {
			const value = specs.get(file)?.props?.[property];
			return value === undefined ? null : { toString: () => value };
		},
	}));

	return { app, entries, files };
}

export const paths = (entries: { file: unknown }[]) => entries.map((e) => (e.file as { path: string }).path);
