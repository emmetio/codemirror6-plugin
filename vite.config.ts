import { defineConfig } from 'vite'

export default defineConfig(({ command }) => {
    if (command === 'build') {
        return {
            build: {
                target: 'esnext',
                sourcemap: true,
                minify: false,
                rollupOptions: {
                    input: './src/plugin.ts',
                    external: /^@(codemirror|lezer)\//,
                    output: {
                        manualChunks: {},
                        entryFileNames: '[name].js'
                    }
                }
            }
        };
    }

    return {};
});
