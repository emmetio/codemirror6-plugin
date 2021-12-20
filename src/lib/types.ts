import type { EditorState, Transaction } from '@codemirror/state';
import type { TextRange } from '@emmetio/action-utils';

export type CSSTokenType = 'selector' | 'propertyName' | 'propertyValue';

export type { TextRange }

export interface RangeObject {
    from: number;
    to: number;
}

export type RangeType = RangeObject | TextRange;

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

export type HTMLType = 'open' | 'close' | 'selfClose';

export interface HTMLContext {
    type: 'html',
    /** List of ancestor elements for current context */
    ancestors: HTMLAncestor[];
    /** Tag match directly under given position */
    current: HTMLMatch | null;
    /** CSS context, if any */
    css?: CSSContext;
}

export interface HTMLAncestor {
    /** Element name */
    name: string;
    /** Range of element’s open tag in source code */
    range: TextRange;
}

export interface HTMLMatch {
    /** Element name */
    name: string;
    /** Element type */
    type: HTMLType;
    /** Range of matched element in source code */
    range: TextRange;
}

export interface StateCommandTarget {
    state: EditorState;
    dispatch: (transaction: Transaction) => void;
}
