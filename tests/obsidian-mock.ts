export const notices: string[] = [];
export class Notice { constructor(msg: string) { notices.push(msg); } }
export function getAllTags(cache: any): string[] | null { return cache.tags?.map((t: any) => t.tag) ?? null; }
export class Plugin {
	app: any = (globalThis as any).__app;
	commands: any[] = [];
	registerDomEvent(el: any, type: string, cb: any, opts: any) { el.addEventListener(type, cb, opts); }
	registerEvent() {}
	addCommand(c: any) { this.commands.push(c); }
}
