import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({
	enableTypescript: true,
})

export default [
	...baseConfig,
	{
		// Yarn's own release artifacts, not part of the module source
		ignores: ['.yarn/**'],
	},
]
