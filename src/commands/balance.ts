import { syntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import type { EditorState, SelectionRange, StateCommand } from '@codemirror/state';
import { cssLanguage } from '@codemirror/lang-css';
import { htmlLanguage } from '@codemirror/lang-html';
import type { SyntaxNode } from '@lezer/common';
import type { RangeObject } from '../lib/types';
import { contains, fullCSSDeclarationRange, last, narrowToNonSpace, rangeContains, rangesEqual } from '../lib/utils';
import { getPropertyRanges } from '../lib/context';

// TODO use RangeObject instead of TextRange

export const balanceOutward: StateCommand = ({ state, dispatch }) => {
    const nextSel: SelectionRange[] = [];
    let hasMatch = false;

    for (const sel of state.selection.ranges) {
        const ranges = getOutwardRanges(state, sel.from);
        if (ranges) {
            hasMatch = true;
            const targetRange = ranges.find(r => rangeContains(r, sel) && !rangesEqual(r, sel)) || sel;
            nextSel.push(EditorSelection.range(targetRange.from, targetRange.to));
        } else {
            nextSel.push(sel);
        }
    }

    if (hasMatch) {
        const tr = state.update({
            selection: EditorSelection.create(nextSel)
        });

        dispatch(tr);
        return true;
    }

    return false;
};

export const balanceInward: StateCommand = ({ state, dispatch }) => {
    const nextSel: SelectionRange[] = [];
    let hasMatch = false;
    for (const sel of state.selection.ranges) {
        const ranges = getInwardRanges(state, sel.from);
        if (ranges) {
            hasMatch = true;
            // Try to find range which equals to selection: we should pick leftmost
            let ix = ranges.findIndex(r => rangesEqual(sel, r));
            let targetRange: RangeObject = sel;

            if (ix < ranges.length - 1) {
                targetRange = ranges[ix + 1];
            } else if (ix !== -1) {
                // No match found, pick closest region
                targetRange = ranges.slice(ix).find(r => rangeContains(r, sel)) || sel;
            }

            nextSel.push(EditorSelection.range(targetRange.from, targetRange.to));
        } else {
            nextSel.push(sel);
        }
    }

    if (hasMatch) {
        const tr = state.update({
            selection: EditorSelection.create(nextSel)
        });

        dispatch(tr);
        return true;
    }

    return false;
};

function getOutwardRanges(state: EditorState, pos: number): RangeObject[] | undefined {
    if (cssLanguage.isActiveAt(state, pos)) {
        return getCSSOutwardRanges(state, pos);
    }

    if (htmlLanguage.isActiveAt(state, pos)) {
        return getHTMLOutwardRanges(state, pos);
    }

    return;
}

function getInwardRanges(state: EditorState, pos: number): RangeObject[] | undefined {
    if (cssLanguage.isActiveAt(state, pos)) {
        return getCSSInwardRanges(state, pos);
    }

    if (htmlLanguage.isActiveAt(state, pos)) {
        return getHTMLInwardRanges(state, pos);
    }

    return;
}

function getHTMLOutwardRanges(state: EditorState, pos: number): RangeObject[] {
    const result: RangeObject[] = [];
    const tree = syntaxTree(state).resolveInner(pos, -1);

    for (let node: SyntaxNode | null = tree; node; node = node.parent) {
        if (node.name === 'Element') {
            pushHTMLRanges(node, result);
        }
    }

    return compactRanges(result, false);
}

function getHTMLInwardRanges(state: EditorState, pos: number): RangeObject[] {
    const result: RangeObject[] = [];
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

function getCSSOutwardRanges(state: EditorState, pos: number): RangeObject[]  {
    const result: RangeObject[] = [];
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);

    while (node) {
        pushCSSRanges(state, node, pos, result);
        node = node.parent;
    }

    return compactRanges(result, false);
}

function getCSSInwardRanges(state: EditorState, pos: number): RangeObject[] {
    const result: RangeObject[] = [];
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


function pushHTMLRanges(node: SyntaxNode, ranges: RangeObject[]): void {
    const selfClose = node.getChild('SelfClosingTag');
    if (selfClose) {
        ranges.push(selfClose);
    } else {
        const open = node.getChild('OpenTag');
        if (open) {
            const close = node.getChild('CloseTag');
            if (close) {
                // Inner range
                ranges.push({ from: open.to, to: close.from });
                // Outer range
                ranges.push({ from: open.from, to: close.to });
            } else {
                ranges.push(open);
            }
        }
    }
}

function pushCSSRanges(state: EditorState, node: SyntaxNode, pos: number, ranges: RangeObject[]): void {
    if (node.name === 'Block') {
        ranges.push(narrowToNonSpace(state, {
            from: node.from + 1,
            to: node.to - 1
        }));
    } else if (node.name === 'RuleSet') {
        ranges.push(node);
    } else if (node.name === 'Declaration') {
        const { name, value } = getPropertyRanges(node);
        if (value && contains(value, pos)) {
            ranges.push(value);
        }
        if (name && contains(name, pos)) {
            ranges.push(name);
        }

        ranges.push(fullCSSDeclarationRange(node));
    }
}

function compactRanges(ranges: RangeObject[], inward: boolean): RangeObject[] {
    const result: RangeObject[] = [];
    ranges = [...ranges].sort(inward
            ? ((a, b) => a.from - b.from || b.to - a.to)
            : ((a, b) => b.from - a.from || a.to - b.to));

    for (const range of ranges) {
        const prev = last(result);
        if (!prev || prev.from !== range.from || prev.to !== range.to) {
            result.push(range)
        }
    }

    return result;
}

function getChildOfType(node: SyntaxNode, types: string[]): SyntaxNode | null {
    const cur = node.cursor();
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
