import { nativeApplySearchQuery } from "./native-bases-search";

export const notices: string[] = [];
export class Notice { constructor(msg: string) { notices.push(msg); } }

export function getAllTags(cache: any): string[] | null {
	const tags: string[] = (cache.tags ?? []).map((t: any) => t.tag);
	const frontmatter = cache.frontmatter?.tags;
	if (frontmatter) {
		for (const tag of ([] as string[]).concat(frontmatter)) tags.push(tag.startsWith("#") ? tag : `#${tag}`);
	}
	return tags.length > 0 ? tags : null;
}

export class Plugin {
	app: any = (globalThis as any).__app;
	commands: any[] = [];
	cleanups: (() => void)[] = [];
	registerDomEvent(el: any, type: string, cb: any, opts: any) { el.addEventListener(type, cb, opts); }
	registerEvent() {}
	register(cb: () => void) { this.cleanups.push(cb); }
	addCommand(c: any) { this.commands.push(c); }
	/** Mirrors Obsidian: cleanups run when the plugin is disabled. */
	unload() { for (const cb of this.cleanups.splice(0)) cb(); }
}

/** Stands in for Obsidian's real class: the plugin only ever touches its prototype. */
export class QueryController {}
(QueryController.prototype as any).applySearchQuery = nativeApplySearchQuery;
