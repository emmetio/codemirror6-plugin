import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { RangeObject } from './types';

/** Characters to indicate tab stop start and end in generated snippet */
export const tabStopStart = String.fromCodePoint(0xFFF0);
export const tabStopEnd = String.fromCodePoint(0xFFF1);
export const stateKey = '$$emmet';

export interface AbbrError {
    message: string,
    pos: number
}

export type DisposeFn = () => void;

export interface EmmetState {
    id: string;
    tracker?: DisposeFn | null;
    tagMatch?: DisposeFn | null;
}

/**
 * Returns copy of region which starts and ends at non-space character
 */
export function narrowToNonSpace(state: EditorState, range: RangeObject): RangeObject {

    const text = substr(state, range);
    let startOffset = 0;
    let endOffset = text.length;

    while (startOffset < endOffset && isSpace(text[startOffset])) {
        startOffset++;
    }

    while (endOffset > startOffset && isSpace(text[endOffset - 1])) {
        endOffset--;
    }

    return {
        from: range.from + startOffset,
        to: range.from + endOffset
    };
}

/**
 * Returns current caret position for single selection
 */
export function getCaret(state: EditorState): number {
    return state.selection.main.from;
}

/**
 * Returns contents of given range or node
 */
export function substr(state: EditorState, range: RangeObject): string {
    return state.doc.sliceString(range.from, range.to);
}

/**
 * Check if given range or syntax name contains given position
 */
export function contains(range: RangeObject, pos: number): boolean {
    return pos >= range.from && pos <= range.to;
}

/**
 * Returns range of full CSS declaration
 */
export function fullCSSDeclarationRange(node: SyntaxNode): RangeObject {
    return {
        from: node.from,
        to: node.nextSibling?.name === ';' ? node.nextSibling.to : node.to
    };
}

export function isQuote(ch: string | undefined) {
    return ch === '"' || ch === "'";
}

/**
 * Returns own (unquoted) attribute value range
 */
export function getAttributeValueRange(state: EditorState, node: RangeObject): RangeObject {
    let { from, to } = node;
    const value = substr(state, node);
    if (isQuote(value[0])) {
        from++;
    }

    if (isQuote(value[value.length - 1])) {
        to--;
    }

    return { from, to };
}

/**
 * Returns given HTML element’s attributes as map
 */
export function getTagAttributes(state: EditorState, node: SyntaxNode): Record<string, string | null> {
    const result: Record<string, string | null> = {};
    for (const attr of node.getChildren('Attribute')) {
        const attrNameNode = attr.getChild('AttributeName');
        if (attrNameNode) {
            const attrName = substr(state, attrNameNode);
            const attrValueNode = attr.getChild('AttributeValue');
            result[attrName] = attrValueNode ? substr(state, getAttributeValueRange(state, attrValueNode)) : null;
        }
    }

    return result;
}
export function isSpace(ch: string): boolean {
    return /^[\s\n\r]+$/.test(ch);
}

export function htmlEscape(str: string): string {
    const replaceMap: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
    };
    return str.replace(/[<>&]/g, ch => replaceMap[ch]);
}

/**
 * Check if `a` and `b` contains the same range
 */
export function rangesEqual(a: RangeObject, b: RangeObject): boolean {
    return a.from === b.from && a.to === b.to;
}

/**
 * Check if range `a` fully contains range `b`
 */
export function rangeContains(a: RangeObject, b: RangeObject): boolean {
    return a.from <= b.from && a.to >= b.to;
}

/**
 * Check if given range is empty
 */
export function rangeEmpty(r: RangeObject): boolean {
    return r.from === r.to;
}

/**
 * Returns last element in given array
 */
export function last<T>(arr: T[]): T | undefined {
    return arr.length > 0 ? arr[arr.length - 1] : undefined;
}

/**
 * Finds and collects selections ranges from given snippet
 */
export function getSelectionsFromSnippet(snippet: string, base = 0): { ranges: RangeObject[], snippet: string } {
    // Find and collect selection ranges from snippet
    const ranges: RangeObject[] = [];
    let result = '';
    let sel: RangeObject | null = null;
    let offset = 0;
    let i = 0;
    let ch: string;

    while (i < snippet.length) {
        ch = snippet.charAt(i++);
        if (ch === tabStopStart || ch === tabStopEnd) {
            result += snippet.slice(offset, i - 1);
            offset = i;

            if (ch === tabStopStart) {
                sel = {
                    from: base + result.length,
                    to: base + result.length
                };
                ranges.push(sel);
            } else if (sel) {
                sel = null;
            }
        }
    }

    if (!ranges.length) {
        ranges.push({
            from: snippet.length + base,
            to: snippet.length + base
        });
    }

    return {
        ranges,
        snippet: result + snippet.slice(offset)
    };
}
