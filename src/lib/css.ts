import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { TextRange } from '@emmetio/action-utils';
import type { CSSContext, CSSMatch } from './types';

/**
 * Returns CSS context for given location in source code
 */
export function getCSSContext(state: EditorState, pos: number, embedded?: TextRange) {
    const result: CSSContext = {
        type: 'css',
        ancestors: [],
        current: null,
        inline: false,
        embedded
    };

    const tree = syntaxTree(state).resolveInner(pos, -1);
    const stack: CSSMatch[] = [];

    for (let node: SyntaxNode | null = tree; node; node = node.parent) {
        if (node.name === 'RuleSet') {
            const sel = getSelectorRange(node);
            stack.push({
                name: substr(state, sel),
                type: 'selector',
                range: sel
            });
        } else if (node.name === 'Declaration') {
            const { name, value } = getPropertyRanges(node);
            if (value && pos >= value[0] && pos <= value[1]) {
                // Direct hit on CSS value
                stack.push({
                    name: substr(state, value),
                    type: 'propertyValue',
                    range: value
                });
            }

            if (name) {
                stack.push({
                    name: substr(state, name),
                    type: 'propertyName',
                    range: name
                });
            }
        }
    }

    console.log(stack);
}

function getSelectorFromRuleSet(state: EditorState, node: SyntaxNode) {
    const sel = getSelectorRange(node);
    console.log('check ruleset children', {
        full: state.doc.sliceString(node.from, node.to),
        selector: state.doc.sliceString(sel[0], sel[1])
    });
}

/**
 * Returns range of CSS selector from given rule block
 */
function getSelectorRange(node: SyntaxNode): TextRange {
    let from = node.from;
    let to = from;
    for (let child = node.firstChild; child && child.name !== 'Block'; child = child.nextSibling) {
        to = child.to;
    }

    return [from, to];
}

/**
 * Returns CSS property name and value ranges.
 * @param node The `name: Declaration` node
 */
function getPropertyRanges(node: SyntaxNode): { name: TextRange | undefined, value: TextRange | undefined } {
    let name: TextRange | undefined;
    let value: TextRange | undefined;
    let ptr = node.firstChild;
    if (ptr?.name === 'PropertyName') {
        name = [ptr.from, ptr.to];
        ptr = ptr.nextSibling;
        if (ptr?.name === ':') {
            ptr = ptr.nextSibling;
        }

        if (ptr) {
            value = [ptr.from, node.lastChild!.to];
        }
    }

    return { name, value };
}

function getContextFromDeclaration(state: EditorState, node: SyntaxNode) {
    console.log('check declaration children');
    const { name, value } = getPropertyRanges(node);
    const propName = name ? state.doc.sliceString(name[0], name[1]) : '';
    const propValue = value ? state.doc.sliceString(value[0], value[1]) : '';

    console.log('css', { propName, propValue });
}

function substr(state: EditorState, range: TextRange): string {
    return state.doc.sliceString(range[0], range[1]);
}
