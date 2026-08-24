import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/** Shared flat config: TypeScript + React hooks/refresh, browser globals. */
export default tseslint.config(
	{ ignores: ["dist", "worker-configuration.d.ts"] },
	{
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
		},
		plugins: {
			"react-hooks": reactHooks,
			"react-refresh": reactRefresh,
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			"react-refresh/only-export-components": [
				"warn",
				{ allowConstantExport: true },
			],
			// ── Design-system guards ────────────────────────────────────────
			// Each of these was swept the app clean by hand more than once and
			// grew back, because nothing failed when it did. They match class
			// strings, so a violation is caught in the editor rather than in a
			// design review six weeks later. See DESIGN.md §3 and §6.
			"no-restricted-syntax": [
				"error",
				{
					selector:
						"Literal[value=/^(?=[\\s\\S]*transition-(all|colors|opacity|transform|shadow))(?![\\s\\S]*ease-out-qu)[\\s\\S]*$/]",
					message:
						"Pair every transition with a duration token and ease-out-quart (DESIGN.md §6). A bare `transition-colors` silently falls back to Tailwind's default curve, which is not part of the system.",
				},
				{
					selector:
						"TemplateElement[value.raw=/^(?=[\\s\\S]*transition-(all|colors|opacity|transform|shadow))(?![\\s\\S]*ease-out-qu)[\\s\\S]*$/]",
					message:
						"Pair every transition with a duration token and ease-out-quart (DESIGN.md §6).",
				},
				{
					// Also matches a *bare* `ring-1`/`ring-2` in a class string that
					// mentions focus — ProjectForm.tsx:137 wrote `ring-2 …
					// focus-visible:ring-ring` and slipped past the first version
					// of this rule, which only looked for the `focus-visible:`
					// prefix on the width itself.
					selector:
						"Literal[value=/focus-visible:ring-[12]\\b|focus:ring-[12]\\b|focus:outline-hidden|(?=[\\s\\S]*focus)[\\s\\S]*(?:^|\\s)ring-[12]\\b/]",
					message:
						"Use the house focus ring: `focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50` (DESIGN.md §5, 'one focus vocabulary everywhere').",
				},
				{
					selector: "Literal[value=/\\btext-\\[/]",
					message:
						"Arbitrary font size. Use a named step — text-micro / text-xs / text-sm / text-base / text-xl (DESIGN.md §3, The Named-Step Rule).",
				},
				{
					selector: "Literal[value=/\\bz-(10|20|30|40|50)\\b/]",
					message:
						"Use the semantic layer scale — z-sticky / z-overlay / z-portal / z-tooltip (index.css) — so a new surface picks a meaning, not a number.",
				},
			],
		},
	},
);
