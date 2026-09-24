import esbuild from "esbuild";

const production = process.argv[2] === "production";

await esbuild.build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian", "electron"],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: production ? false : "inline",
	minify: production,
	outfile: "main.js",
});
