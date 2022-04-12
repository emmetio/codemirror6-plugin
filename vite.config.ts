import { defineConfig } from 'vite'

export default defineConfig(({ command }) => {
    if (command === 'build') {
        return {
            build: {
                target: 'es2017',
                sourcemap: true,
                minify: false,
                lib: {
                    entry: './src/plugin.ts',
                    formats: ['es'],
                    fileName: () => 'plugin.js'
                },
                rollupOptions: {
                    external: /^@(codemirror|lezer)\//,
                }
            }
        };
    }

    return {};
});
