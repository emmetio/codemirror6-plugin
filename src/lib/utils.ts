import type { AttributeToken } from '@emmetio/html-matcher';
import type { CSSProperty } from '@emmetio/action-utils';
import type { EditorState, SelectionRange } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { TextRange } from './types';

/** Characters to indicate tab stop start and end in generated snippet */
export const tabStopStart = String.fromCodePoint(0xFFF0);
export const tabStopEnd = String.fromCodePoint(0xFFF1);
export const stateKey = '$$emmet';

interface RangeObject {
    from: number;
    to: number;
}

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

export const pairs: Record<string, string> = {
    '{': '}',
    '[': ']',
    '(': ')'
};

export const pairsEnd: string[] = [];
for (const key of Object.keys(pairs)) {
    pairsEnd.push(pairs[key]);
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
    const sel = state.selection.main;
    return Math.max(sel.anchor, sel.head);
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
 * Returns value of given attribute, parsed by Emmet HTML matcher
 */
export function attributeValue(attr: AttributeToken): string | undefined {
    const { value } = attr
    return value && isQuoted(value)
        ? value.slice(1, -1)
        : value;
}

/**
 * Returns region that covers entire attribute
 */
export function attributeRange(attr: AttributeToken): TextRange {
    const end = attr.value != null ? attr.valueEnd! : attr.nameEnd;
    return [attr.nameStart, end];
}

/**
 * Returns patched version of given HTML attribute, parsed by Emmet HTML matcher
 */
export function patchAttribute(attr: AttributeToken, value: string | number, name = attr.name) {
    let before = '';
    let after = '';

    if (attr.value != null) {
        if (isQuoted(attr.value)) {
            // Quoted value or React-like expression
            before = attr.value[0];
            after = attr.value[attr.value.length - 1];
        }
    } else {
        // Attribute without value (boolean)
        before = after = '"';
    }

    return `${name}=${before}${value}${after}`;
}

/**
 * Returns patched version of given CSS property, parsed by Emmet CSS matcher
 */
export function patchProperty(state: EditorState, prop: CSSProperty, value: string, name?: string) {
    if (name == null) {
        name = substr(state, prop.name);
    }

    const before = substr(state, [prop.before, prop.name[0]]);
    const between = substr(state, [prop.name[1], prop.value[0]]);
    const after = substr(state, [prop.value[1], prop.after]);

    return [before, name, between, value, after].join('');
}

/**
 * Check if given value is either quoted or written as expression
 */
export function isQuoted(value: string | undefined): boolean {
    return !!value && (isQuotedString(value) || isExprString(value));
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

/**
 * Check if given string is quoted with single or double quotes
 */
export function isQuotedString(str: string): boolean {
    return str.length > 1 && isQuote(str[0]) && str[0] === str.slice(-1);
}

/**
 * Check if given string contains expression, e.g. wrapped with `{` and `}`
 */
function isExprString(str: string): boolean {
    return str[0] === '{' && str.slice(-1) === '}';
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
export function rangesEqual(a: TextRange, b: TextRange): boolean {
    return a[0] === b[0] && a[1] === b[1];
}

/**
 * Check if range `a` fully contains range `b`
 */
export function rangeContains(a: TextRange, b: TextRange): boolean {
    return a[0] <= b[0] && a[1] >= b[1];
}

/**
 * Check if given range is empty
 */
export function rangeEmpty(r: TextRange): boolean {
    return r[0] === r[1];
}

/**
 * Generates snippet with error pointer
 */
export function errorSnippet(err: AbbrError, baseClass = 'emmet-error-snippet'): string {
    const msg = err.message.split('\n')[0];
    const spacer = ' '.repeat(err.pos || 0);
    return `<div class="${baseClass}">
        <div class="${baseClass}-ptr">
            <div class="${baseClass}-line"></div>
            <div class="${baseClass}-tip"></div>
            <div class="${baseClass}-spacer">${spacer}</div>
        </div>
        <div class="${baseClass}-message">${htmlEscape(msg.replace(/\s+at\s+\d+$/, ''))}</div>
    </div>`;
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
