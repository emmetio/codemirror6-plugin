import type { EditorState, SelectionRange } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { TextRange, RangeObject, RangeType } from './types';

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
export function narrowToNonSpace(state: EditorState, range: TextRange): TextRange {
    const text = substr(state, range);
    let startOffset = 0;
    let endOffset = text.length;

    while (startOffset < endOffset && isSpace(text[startOffset])) {
        startOffset++;
    }

    while (endOffset > startOffset && isSpace(text[endOffset - 1])) {
        endOffset--;
    }

    return [range[0] + startOffset, range[0] + endOffset];
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
export function substr(state: EditorState, range: TextRange | RangeObject): string {
    let from: number;
    let to: number;
    if (Array.isArray(range)) {
        [from, to] = range;
    } else {
        from = range.from;
        to = range.to;
    }
    return state.doc.sliceString(from, to);
}

/**
 * Check if given range or syntax name contains given position
 */
export function contains(range: TextRange | RangeObject, pos: number): boolean {
    if (Array.isArray(range)) {
        return pos >= range[0] && pos <= range[1];
    }

    return pos >= range.from && pos <= range.to;
}

/**
 * Converts node range to text range
 */
export function nodeRange(node: RangeObject): TextRange {
    return [node.from, node.to];
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
export function getAttributeValueRange(state: EditorState, node: RangeObject): TextRange {
    const range = nodeRange(node);
    const value = substr(state, range);
    if (isQuote(value[0])) {
        range[0]++;
    }

    if (isQuote(value[value.length - 1])) {
        range[1]--;
    }

    return range;
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
export function rangesEqual(a: RangeType, b: RangeType): boolean {
    return rangeFrom(a) === rangeTo(b) && rangeTo(a) === rangeTo(b);
}

/**
 * Check if range `a` fully contains range `b`
 */
export function rangeContains(a: RangeType, b: RangeType): boolean {
    return rangeFrom(a) <= rangeFrom(b) && rangeTo(a) >= rangeTo(b);
}

/**
 * Check if given range is empty
 */
export function rangeEmpty(r: RangeType): boolean {
    return rangeFrom(r) === rangeTo(r);
}

export function rangeFrom(r: RangeType): number {
    return Array.isArray(r) ? r[0] : r.from;
}

export function rangeTo(r: RangeType): number {
    return Array.isArray(r) ? r[1] : r.to;
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
export function getSelectionsFromSnippet(snippet: string, base = 0): { ranges: TextRange[], snippet: string } {
    // Find and collect selection ranges from snippet
    const ranges: TextRange[] = [];
    let result = '';
    let sel: TextRange | null = null;
    let offset = 0;
    let i = 0;
    let ch: string;

    while (i < snippet.length) {
        ch = snippet.charAt(i++);
        if (ch === tabStopStart || ch === tabStopEnd) {
            result += snippet.slice(offset, i - 1);
            offset = i;

            if (ch === tabStopStart) {
                sel = [base + result.length, base + result.length];
                ranges.push(sel);
            } else if (sel) {
                sel[1] = base + result.length;
                sel = null;
            }
        }
    }

    if (!ranges.length) {
        ranges.push([snippet.length + base, snippet.length + base]);
    }

    return {
        ranges,
        snippet: result + snippet.slice(offset)
    };
}

export function selToRange(sel: SelectionRange): TextRange {
    return [
        Math.min(sel.anchor, sel.head),
        Math.max(sel.anchor, sel.head)
    ];
}
