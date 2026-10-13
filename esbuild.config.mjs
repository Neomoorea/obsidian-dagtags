import esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const production = process.argv[2] === "production";

// Compiled files go to dist/, ready to be dropped into <vault>/.obsidian/plugins/dagtags/.
mkdirSync("dist", { recursive: true });

// Keeps dist/manifest.json identical to the source manifest on every (re)build.
const copyManifest = {
	name: "copy-manifest",
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length === 0) copyFileSync("manifest.json", "dist/manifest.json");
		});
	},
};

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian", "electron"],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: production ? false : "inline",
	minify: production,
	outfile: "dist/main.js",
	plugins: [copyManifest],
});

if (production) {
	await context.rebuild();
	await context.dispose();
} else {
	await context.watch();
	console.log("Watching for changes...");
}
