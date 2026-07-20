/**
 * Hand-written types for the JS implementation in `index.js`. Kept alongside
 * rather than generated, since the surface is a single function and adding a
 * build step to a config-only package would cost more than it saves.
 */
export declare function appAliases(rootDir: string): {
	"@": string;
	"@shared": string;
};
