import path from "node:path";

/**
 * Path aliases shared by the app and extension Vite builds. Mirrors the
 * `paths` in the TypeScript configs so `@`/`@shared` resolve identically in
 * both toolchains. `rootDir` is the absolute repo root.
 */
export function appAliases(rootDir) {
	return {
		"@": path.resolve(rootDir, "src/react-app"),
		"@shared": path.resolve(rootDir, "src/shared"),
	};
}
