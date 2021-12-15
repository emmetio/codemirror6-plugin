import { syntaxTree } from '@codemirror/language';
import { EditorSelection, SelectionRange } from '@codemirror/state';
import type { EditorState, StateCommand } from '@codemirror/state';
import { cssLanguage } from '@codemirror/lang-css';
import { htmlLanguage } from '@codemirror/lang-html';
import type { SyntaxNode } from '@lezer/common';
import type { TextRange } from '../lib/types';
import { contains, last, narrowToNonSpace, nodeRange, selToRange } from '../lib/utils';
import { getPropertyRanges } from '../lib/context';

export const balanceOutward: StateCommand = ({ state, dispatch }) => {
    const nextSel: SelectionRange[] = [];
    let hasMatch = false;

    for (const sel of state.selection.ranges) {
        const selRange = selToRange(sel);
        const ranges = getOutwardRanges(state, selRange[0]);
        if (ranges) {
            hasMatch = true;
            const targetRange = ranges.find(r => rangeContains(r, selRange) && !rangesEqual(r, selRange)) || selRange;
            nextSel.push(EditorSelection.range(targetRange[0], targetRange[1]));
        } else {
            nextSel.push(sel);
        }
    }

    if (!hasMatch) {
        return false;
    }

    const tr = state.update({
        selection: EditorSelection.create(nextSel)
    });

    dispatch(tr);
    return true;
};

export const balanceInward: StateCommand = ({ state, dispatch }) => {
    const nextSel: SelectionRange[] = [];
    let hasMatch = false;
    for (const sel of state.selection.ranges) {
        const selRange = selToRange(sel);
        const ranges = getInwardRanges(state, selRange[0]);
        if (ranges) {
            hasMatch = true;
            // Try to find range which equals to selection: we should pick leftmost
            let ix = ranges.findIndex(r => rangesEqual(selRange, r));
            let targetRange = selRange;

            if (ix < ranges.length - 1) {
                targetRange = ranges[ix + 1];
            } else if (ix !== -1) {
                // No match found, pick closest region
                targetRange = ranges.slice(ix).find(r => rangeContains(r, selRange)) || selRange;
            }

            nextSel.push(EditorSelection.range(targetRange[0], targetRange[1]));
        } else {
            nextSel.push(sel);
        }
    }

    if (!hasMatch) {
        return false;
    }

    const tr = state.update({
        selection: EditorSelection.create(nextSel)
    });

    dispatch(tr);
    return true;
};

function getOutwardRanges(state: EditorState, pos: number): TextRange[] | undefined {
    if (cssLanguage.isActiveAt(state, pos)) {
        return getCSSOutwardRanges(state, pos);
    }

    if (htmlLanguage.isActiveAt(state, pos)) {
        return getHTMLOutwardRanges(state, pos);
    }

    return;
}

function getInwardRanges(state: EditorState, pos: number): TextRange[] | undefined {
    if (cssLanguage.isActiveAt(state, pos)) {
        return getCSSInwardRanges(state, pos);
    }

    if (htmlLanguage.isActiveAt(state, pos)) {
        return getHTMLInwardRanges(state, pos);
    }

    return;
}

function getHTMLOutwardRanges(state: EditorState, pos: number): TextRange[] {
    const result: TextRange[] = [];
    const tree = syntaxTree(state).resolveInner(pos, -1);

    for (let node: SyntaxNode | null = tree; node; node = node.parent) {
        if (node.name === 'Element') {
            pushHTMLRanges(node, result);
        }
    }

    return compactRanges(result, false);
}

function getHTMLInwardRanges(state: EditorState, pos: number): TextRange[] {
    const result: TextRange[] = [];
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);

    // Find closest element
    while (node && node.name !== 'Element') {
        node = node.parent;
    }

    // Find all first child elements
    while (node) {
        pushHTMLRanges(node, result);
        node = node.getChild('Element');
    }

    return compactRanges(result, true);
}

function getCSSOutwardRanges(state: EditorState, pos: number): TextRange[]  {
    const result: TextRange[] = [];
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);

    while (node) {
        pushCSSRanges(state, node, pos, result);
        node = node.parent;
    }

    return compactRanges(result, false);
}

function getCSSInwardRanges(state: EditorState, pos: number): TextRange[] {
    const result: TextRange[] = [];
    const knownNodes = ['Block', 'RuleSet', 'Declaration'];
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);

    while (node && !knownNodes.includes(node.name)) {
        node = node.parent;
    }

    while (node) {
        pushCSSRanges(state, node, pos, result);
        node = getChildOfType(node, knownNodes);
    }

    return result;
}


function pushHTMLRanges(node: SyntaxNode, ranges: TextRange[]): void {
    const selfClose = node.getChild('SelfClosingTag');
    if (selfClose) {
        ranges.push(nodeRange(selfClose));
    } else {
        const open = node.getChild('OpenTag');
        if (open) {
            const close = node.getChild('CloseTag');
            if (close) {
                // Inner range
                ranges.push([open.to, close.from]);
                // Outer range
                ranges.push([open.from, close.to]);
            } else {
                ranges.push(nodeRange(open))
            }
        }
    }
}

function pushCSSRanges(state: EditorState, node: SyntaxNode, pos: number, ranges: TextRange[]): void {
    if (node.name === 'Block') {
        ranges.push(narrowToNonSpace(state, [node.from + 1, node.to - 1]));
    } else if (node.name === 'RuleSet') {
        ranges.push(nodeRange(node));
    } else if (node.name === 'Declaration') {
        const { name, value } = getPropertyRanges(node);
        if (value && contains(value, pos)) {
            ranges.push(value);
        }
        if (name && contains(name, pos)) {
            ranges.push(name);
        }

        const propRange = nodeRange(node);
        const next = node.nextSibling;
        if (next?.name === ';') {
            propRange[1] = next.to;
        }
        ranges.push(propRange);
    }
}

function compactRanges(ranges: TextRange[], inward: boolean): TextRange[] {
    const result: TextRange[] = [];
    ranges = [...ranges].sort(inward
            ? ((a, b) => a[0] - b[0] || b[1] - a[1])
            : ((a, b) => b[0] - a[0] || a[1] - b[1]));

    for (const range of ranges) {
        const prev = last(result);
        if (!prev || prev[0] !== range[0] || prev[1] !== range[1]) {
            result.push(range)
        }
    }

    return result;
}

function rangeContains(a: TextRange, b: TextRange): boolean {
    return a[0] <= b[0] && a[1] >= b[1];
}

/**
 * Check if `a` and `b` contains the same range
 */
export function rangesEqual(a: TextRange, b: TextRange): boolean {
    return a[0] === b[0] && a[1] === b[1];
}

function getChildOfType(node: SyntaxNode, types: string[]): SyntaxNode | null {
    const cur = node.cursor;
    if (cur.firstChild()) {
        for (;;) {
            for (const t of types) {
                if (cur.node.name === t) {
                    return cur.node;
                }
            }
            if (!cur.nextSibling()) {
                break;
            }
        }
    }

    return null;
}
