import antfu from '@antfu/eslint-config';
import player from '@nomercy-entertainment/eslint-plugin-player';

export default antfu({
	ignores: [
		'dist/**',
		'.github/**',
		'README.md',
		// Linting `eslint.config.js` itself triggers a full config-cache rebuild
		// on save (~70s on Windows with antfu's plugin set). Run `npx eslint
		// eslint.config.js` manually when editing this file.
		'eslint.config.js',
	],
	typescript: {
		overrides: {
			'no-nested-ternary': 'error',
			'antfu/top-level-function': 'off',
			'no-console': 'off',
			'no-extend-native': 'off',
			'ts/method-signature-style': 'off',
			'unused-imports/no-unused-vars': 'error',
			// Mutual-closure patterns (cleanup ↔ handler const arrows in promise callbacks) are safe
			// at runtime; the rule's variable-TDZ check fires false positives here.
			'ts/no-use-before-define': ['error', { classes: false, functions: false, variables: false }],
			// dot-notation conflicts with TS noPropertyAccessFromIndexSignature: typed index-signature
			// properties must use bracket notation; ESLint's autofix would break the build.
			'dot-notation': 'off',
		},
	},
	test: {
		overrides: {
			'test/prefer-lowercase-title': 'off',
			// Tests use compact `beforeEach(() => { stmt; })` and `try { stmt; } catch (e) { err = e; }` patterns by convention.
			'style/max-statements-per-line': 'off',
			// Stub/mock constructors legitimately capture `this` to expose the instance in tests.
			'ts/no-this-alias': 'off',
		},
	},
	stylistic: {
		indent: 'tab',
		quotes: 'single',
		semi: true,
		overrides: {
			'style/newline-per-chained-call': [
				'error',
				{ ignoreChainWithDepth: 2 },
			],
			'style/object-curly-newline': [
				'error',
				{
					ObjectExpression: {
						multiline: true,
						minProperties: 2,
						consistent: true,
					},
					ObjectPattern: {
						multiline: true,
						minProperties: 4,
						consistent: true,
					},
					ImportDeclaration: {
						multiline: true,
						minProperties: 4,
						consistent: true,
					},
					ExportDeclaration: {
						multiline: true,
						minProperties: 4,
						consistent: true,
					},
				},
			],
			'style/object-property-newline': [
				'error',
				{ allowAllPropertiesOnSameLine: true },
			],
			'style/function-paren-newline': ['error', 'multiline-arguments'],
			'style/array-element-newline': ['error', 'consistent'],
			'style/array-bracket-newline': ['error', 'consistent'],
		},
	},
}, {
	// antfu/consistent-chaining conflicts with style/newline-per-chained-call
	// (ignoreChainWithDepth: 2): both try to autofix depth-3 inline chains in
	// opposite directions, producing an oscillating fix loop. The explicit
	// style/newline-per-chained-call config is the project rule; this one loses.
	rules: {
		'antfu/consistent-chaining': 'off',
		// Compact try { x; } catch { /* ignore */ } blocks are established project style.
		'style/max-statements-per-line': 'off',
	},
}, {
	// playwright.config.ts runs in Node; process global is always available.
	files: ['playwright.config.ts'],
	rules: {
		'node/prefer-global/process': 'off',
	},
}, {
	files: ['src/__tests__/**/*.ts'],
	rules: {
		'style/newline-per-chained-call': 'off',
		'style/object-curly-newline': 'off',
	},
}, {
	// NoMercy player code standard (packages/eslint-plugin-player).
	files: ['src/**/*.ts'],
	plugins: { player },
	rules: {
		'player/no-single-letter-ident': 'error',
		'player/no-compat-vocab': 'error',
		'player/no-history-comments': 'error',
		'player/no-object-literal-cast': 'error',
		'player/no-unknown-cast': 'error',
		'player/no-raw-player-bus': 'error',
		'player/no-raw-timers-in-plugin': 'error',
		'player/no-raw-throw-in-plugin': 'error',
		'player/no-raw-fetch-in-plugin': 'error',
		'player/plugin-id-required': 'error',
	},
}, {
	// Mock construction in tests legitimately casts; test-fixture plugins throw
	// raw errors, use raw timers, and build ad-hoc plugin classes to exercise
	// the real paths — the boundary rules target authored plugins, not fixtures.
	files: ['src/**/*.test.ts', 'src/__tests__/**/*.ts'],
	rules: {
		'player/no-object-literal-cast': 'off',
		'player/no-unknown-cast': 'off',
		'player/no-raw-throw-in-plugin': 'off',
		'player/no-raw-timers-in-plugin': 'off',
		'player/no-raw-player-bus': 'off',
		'player/no-raw-fetch-in-plugin': 'off',
		'player/plugin-id-required': 'off',
	},
}, {
	// The v1 compat shim's entire purpose is deprecation — its declare-module
	// overloads carry real `@deprecated` JSDoc so editors surface the warning
	// at v1 consumers' call sites. The blanket ban exists to keep that marker
	// out of the clean v2 core; this is the one file it describes on purpose.
	files: ['src/plugins/v1-compat.ts'],
	rules: {
		'player/no-compat-vocab': 'off',
	},
});
