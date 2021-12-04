import type { TextRange } from '@emmetio/action-utils';

export type CSSTokenType = 'selector' | 'propertyName' | 'propertyValue';

export interface CSSMatch {
    /** CSS selector, property or section name */
    name: string;
    /** Type of ancestor element */
    type: CSSTokenType;
    /** Range of selector or section (just name, not entire block) */
    range: TextRange;
}

export interface CSSContext<M = CSSMatch> {
    type: 'css',

    /** List of ancestor sections for current context */
    ancestors: M[];

    /** CSS match directly under given position */
    current: M | null;

    /** Whether CSS context is inline, e.g. in `style=""` HTML attribute */
    inline: boolean;

    /**
     * If current CSS context is embedded into HTML, this property contains
     * range of CSS source in original content
     */
    embedded?: TextRange;
}
