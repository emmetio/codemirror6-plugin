import { Facet } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

export type PreviewExtensions = () => Extension;

export interface EmmetPreviewConfig {
    /** Extensions factory for displaying HTML-like abbreviation preview  */
    html?: PreviewExtensions;
    /** Extensions factory for displaying CSS-like abbreviation preview  */
    css?: PreviewExtensions;
}

export interface EmmetConfig {
    preview: EmmetPreviewConfig;
}

export const config = Facet.define<Partial<EmmetConfig>, EmmetConfig>({
    combine(value) {
        const baseConfig: EmmetConfig = {
            preview: { }
        };
        const { preview } = baseConfig;
        for (const item of value) {
            Object.assign(baseConfig, item);
            if (item.preview) {
                Object.assign(preview, item.preview)
                baseConfig.preview = preview;
            }
        }

        return baseConfig;
    }
});
