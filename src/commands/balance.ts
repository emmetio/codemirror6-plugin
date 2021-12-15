import { syntaxTree } from '@codemirror/language';
import { EditorSelection, SelectionRange } from '@codemirror/state';
import type { EditorState, StateCommand } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { docSyntax, isHTML } from '../lib/syntax';
import type { TextRange } from '../lib/types';
import { last, nodeRange, selToRange } from '../lib/utils';

export interface BalancedTag {
    /** Name of balanced tag */
    name: string;
    /** Range of opening tag */
    open: TextRange;
    /** Range of closing tag. If absent, tag is self-closing */
    close?: TextRange;
}

export const balanceOutward: StateCommand = ({ state, dispatch }) => {
    if (isHTML(docSyntax(state))) {
        const nextSel: SelectionRange[] = [];
        for (const sel of state.selection.ranges) {
            const selRange = selToRange(sel);
            const ranges = getHTMLOutwardRanges(state, selRange[0]);
            const targetRange = ranges.find(r => rangeContains(r, selRange) && r[1] > selRange[1]) || selRange;
            nextSel.push(EditorSelection.range(targetRange[0], targetRange[1]));
        }

        const tr = state.update({
            selection: EditorSelection.create(nextSel)
        });

        dispatch(tr);
        return true;
    }

    return false;
};

export const balanceInward: StateCommand = ({ state, dispatch }) => {
    if (isHTML(docSyntax(state))) {
        const nextSel: SelectionRange[] = [];
        for (const sel of state.selection.ranges) {
            const selRange = selToRange(sel);
            const ranges = getHTMLInwardRanges(state, selRange[0]);

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
        }

        const tr = state.update({
            selection: EditorSelection.create(nextSel)
        });

        dispatch(tr);
        return true;
    }

    return false;
};

function getHTMLOutwardRanges(state: EditorState, pos: number): TextRange[] {
    const result: TextRange[] = [];
    const tree = syntaxTree(state).resolveInner(pos, -1);

    for (let node: SyntaxNode | null = tree; node; node = node.parent) {
        if (node.name === 'Element') {
            pushTagRanges(node, result);
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
        pushTagRanges(node, result);
        node = node.getChild('Element');
    }

    return compactRanges(result, true);
}

function pushTagRanges(node: SyntaxNode, ranges: TextRange[]): void {
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

function compactRanges(ranges: TextRange[], inward: boolean): TextRange[] {
    const result: TextRange[] = [];
    ranges = [...ranges].sort(inward
            ? ((a, b) => a[0] - b[0])
            : ((a, b) => b[0] - a[0]));

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
