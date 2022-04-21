import { syntaxTree } from '@codemirror/language';
import type { EditorState, SelectionRange, StateCommand } from '@codemirror/state';
import { EditorSelection } from '@codemirror/state';
import { cssLanguage } from '@codemirror/lang-css';
import type { SyntaxNode, TreeCursor } from '@lezer/common';
import type { RangeObject, StateCommandTarget } from '../lib/types';
import { fullCSSDeclarationRange, isQuote, isSpace, rangeContains, substr } from '../lib/utils';
import { getPropertyRanges, getSelectorRange } from '../lib/context';

export const selectNextItem: StateCommand = target => selectItemCommand(target, false);
export const selectPreviousItem: StateCommand = target => selectItemCommand(target, true);

const htmlParents = new Set(['OpenTag', 'CloseTag', 'SelfClosingTag']);
const cssEnter = new Set(['Block', 'RuleSet', 'StyleSheet']);
const cssParents = new Set(['RuleSet', 'Block', 'StyleSheet', 'Declaration']);

function selectItemCommand({ state, dispatch }: StateCommandTarget, reverse: boolean): boolean {
    let handled = false;
    const selections: SelectionRange[] = [];
    for (const sel of state.selection.ranges) {
        const range = cssLanguage.isActiveAt(state, sel.from)
            ? getCSSRange(state, sel, reverse)
            : getHTMLRange(state, sel, reverse);
        if (range) {
            handled = true;
            selections.push(EditorSelection.range(range.from, range.to));
        } else {
            selections.push(sel);
        }
    }

    if (handled) {
        const tr = state.update({
            selection: EditorSelection.create(selections)
        });
        dispatch(tr);
        return true;
    }

    return false;
}

function getHTMLRange(state: EditorState, sel: SelectionRange, reverse?: boolean): RangeObject | undefined {
    const node = getStartHTMLNode(state, sel);
    const cursor = node.cursor();

    do {
        if (cursor.name === 'OpenTag' || cursor.name === 'SelfClosingTag') {
            const ranges = getHTMLCandidates(state, cursor.node);
            const range = findRange(sel, ranges, reverse);
            if (range) {
                return range;
            }
        }
    } while (moveHTMLCursor(cursor, reverse));

    return;
}

function getCSSRange(state: EditorState, sel: SelectionRange, reverse?: boolean) {
    const node = getStartCSSNode(state, sel);
    const cursor = node.cursor();

    do {
        const ranges = getCSSCandidates(state, cursor.node);
        const range = findRange(sel, ranges, reverse);
        if (range) {
            return range;
        }
    } while (moveCSSCursor(cursor, reverse));

    return;
}

function moveHTMLCursor(cursor: TreeCursor, reverse?: boolean): boolean {
    const enter = cursor.name === 'Element';
    return reverse ? cursor.prev(enter) : cursor.next(enter);
}

function moveCSSCursor(cursor: TreeCursor, reverse?: boolean): boolean {
    const enter = cssEnter.has(cursor.name);
    return reverse ? cursor.prev(enter) : cursor.next(enter);
}

function getStartHTMLNode(state: EditorState, sel: SelectionRange): SyntaxNode {
    let node: SyntaxNode = syntaxTree(state).resolveInner(sel.to, 1);

    // In case if we’re inside tag, find closest start node
    let ctx: SyntaxNode | null = node;
    while (ctx) {
        if (htmlParents.has(ctx.name)) {
            return ctx;
        }
        ctx = ctx.parent;
    }

    return node;
}

function getStartCSSNode(state: EditorState, sel: SelectionRange): SyntaxNode {
    let node: SyntaxNode = syntaxTree(state).resolveInner(sel.to, 1);

    // In case if we’re inside tag, find closest start node
    let ctx: SyntaxNode | null = node.parent;
    while (ctx) {
        if (cssParents.has(ctx.name)) {
            return ctx;
        }
        ctx = ctx.parent;
    }

    return node;
}

/**
 * Returns candidates for selection from given StartTag or SelfClosingTag
 */
function getHTMLCandidates(state: EditorState, node: SyntaxNode): RangeObject[] {
    let result: RangeObject[] = [];
    let child = node.firstChild;
    while (child) {
        if (child.name === 'TagName') {
            result.push(child);
        } else if (child.name === 'Attribute') {
            result.push(child);
            const attrName = child.getChild('AttributeName');
            const attrValue = attrValueRange(state, child);
            if (attrName && attrValue) {
                result.push(attrName, attrValue);
                if (substr(state, attrName).toLowerCase() === 'class') {
                    // For class names, split value into space-separated tokens
                    result = result.concat(tokenList(substr(state, attrValue)));
                }
            }
        }
        child = child.nextSibling;
    }

    return result;
}

/**
 * Returns candidates for RuleSet node
 */
function getCSSCandidates(state: EditorState, node: SyntaxNode): RangeObject[] {
    let result: RangeObject[] = [];
    if (node.name === 'RuleSet') {
        const selector = getSelectorRange(node);
        result.push(selector);
        const block = node.getChild('Block');
        if (block) {
            for (const child of block.getChildren('Declaration')) {
                result = result.concat(getCSSCandidates(state, child));
            }
        }
    } else if (node.name === 'Declaration') {
        result.push(fullCSSDeclarationRange(node));
        const { name, value } = getPropertyRanges(node);
        name && result.push(name);
        value && result.push(value);
    }

    return result;
}

function attrValueRange(state: EditorState, attr: SyntaxNode): RangeObject | undefined {
    const value = attr.getChild('AttributeValue');
    if (value) {
        let { from, to } = value;
        const valueStr = substr(state, value);
        if (isQuote(valueStr[0])) {
            from++;
            if (valueStr[0] === valueStr[valueStr.length - 1]) {
                to--;
            }
        }

        if (from !== to) {
            return { from, to };
        }
    }

    return;
}

/**
 * Returns ranges of tokens in given value. Tokens are space-separated words.
 */
function tokenList(value: string, offset = 0): RangeObject[] {
    const ranges: RangeObject[] = [];
    const len = value.length;
    let pos = 0;
    let start = 0;
    let end = len;

    while (pos < len) {
        end = pos;
        const ch = value.charAt(pos++);
        if (isSpace(ch)) {
            if (start !== end) {
                ranges.push({
                    from: offset + start,
                    to: offset + end
                });
            }

            while (isSpace(value.charAt(pos))) {
                pos++;
            }

            start = pos;
        }
    }

    if (start !== pos) {
        ranges.push({
            from: offset + start,
            to: offset + pos
        });
    }

    return ranges;
}

function findRange(sel: SelectionRange, ranges: RangeObject[], reverse = false): RangeObject | undefined {
    if (reverse) {
        ranges = ranges.slice().reverse();
    }

    let needNext = false;
    let candidate: RangeObject | undefined;

    for (const r of ranges) {
        if (needNext) {
            return r;
        }
        if (r.from === sel.from && r.to === sel.to) {
            // This range is currently selected, request next
            needNext = true;
        } else if (!candidate && (rangeContains(r, sel) || (reverse && r.from <= sel.from) || (!reverse && r.from >= sel.from))) {
            candidate = r;
        }
    }

    return !needNext ? candidate : undefined;
}
