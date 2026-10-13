/**
 * A port of the native Bases search (`QueryController.applySearchQuery` in Obsidian 1.14), used as a
 * test double so the plugin is tested against the behaviour it has to coexist with.
 *
 * The native rule: lowercase the query, split it into tokens (whitespace separates; punctuation and
 * CJK characters become tokens of their own), then keep a row only if every token is a substring of
 * at least one of its displayed property values. No OR, no wildcards, no `tag:`.
 */

const PUNCTUATION = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-.\/:;<=>?@\[\]^_`{|}~]/;
const WHITESPACE = /\s/;
const CJK = /[\u0F00-\u0FFF\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;

export function tokenize(query: string): string[] {
	const text = query.toLowerCase();
	const tokens: string[] = [];
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charAt(i);
		if (WHITESPACE.test(ch)) {
			if (start !== i) tokens.push(text.substring(start, i));
			start = i + 1;
		} else if (PUNCTUATION.test(ch) || CJK.test(ch)) {
			if (start !== i) tokens.push(text.substring(start, i));
			tokens.push(ch);
			start = i + 1;
		}
	}
	if (start !== text.length) tokens.push(text.substring(start));
	return tokens;
}

export interface FakeEntry {
	file: unknown;
	getValue(property: string): { toString(): string } | null;
}

export function nativeApplySearchQuery(
	this: { searchQuery: string | null | undefined },
	entries: FakeEntry[],
	visibleProperties: string[],
): FakeEntry[] {
	if (!this.searchQuery?.trim()) return entries;
	const tokens = tokenize(this.searchQuery);
	if (tokens.length === 0) return entries;

	return entries.filter((entry) => {
		const pending = tokens.slice();
		for (const property of visibleProperties) {
			const value = entry.getValue(property);
			if (!value) continue;
			const text = value.toString().toLowerCase();
			for (let i = pending.length - 1; i >= 0; i--) {
				if (text.includes(pending[i])) pending.splice(i, 1);
			}
			if (pending.length === 0) return true;
		}
		return false;
	});
}
