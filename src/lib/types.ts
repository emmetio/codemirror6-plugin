import type { AbbreviationContext, UserConfig } from 'emmet';
import type { EditorState, Transaction } from '@codemirror/state';

export type CSSTokenType = 'selector' | 'propertyName' | 'propertyValue';

export interface RangeObject {
    from: number;
    to: number;
}

export interface ContextTag extends AbbreviationContext {
    open: RangeObject;
    close?: RangeObject;
}

export interface CSSMatch {
    /** CSS selector, property or section name */
    name: string;
    /** Type of ancestor element */
    type: CSSTokenType;
    /** Range of selector or section (just name, not entire block) */
    range: RangeObject;
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
    embedded?: RangeObject;
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
    range: RangeObject;
}

export interface HTMLMatch {
    /** Element name */
    name: string;
    /** Element type */
    type: HTMLType;
    /** Range of matched element in source code */
    range: RangeObject;
}

export interface StateCommandTarget {
    state: EditorState;
    dispatch: (transaction: Transaction) => void;
}

export interface AbbreviationError {
    message: string;
    pos: number;
}

export interface StartTrackingParams {
    config: UserConfig;
    offset?: number;
    forced?: boolean;
}
