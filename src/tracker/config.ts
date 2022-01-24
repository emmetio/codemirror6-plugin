import { Facet } from '@codemirror/state';
import type { LanguageSupport } from '@codemirror/language';

export type LangOrLangFactory = LanguageSupport | (() => LanguageSupport);

export interface EmmetPreviewConfig {
    /** Language definition for displaying HTML-like abbreviation preview  */
    html?: LangOrLangFactory;
    /** Language definition for displaying CSS-like abbreviation preview  */
    css?: LangOrLangFactory;
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
