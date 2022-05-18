import { syntaxTree } from '@codemirror/language';
import type { LRLanguage } from '@codemirror/language';
import { htmlLanguage } from '@codemirror/lang-html';
import { cssLanguage } from '@codemirror/lang-css';
import type { ChangeSpec, EditorState, StateCommand } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { narrowToNonSpace } from '../lib/utils';

type CommentTokens = [string, string];

const htmlComment: CommentTokens = ['<!--', '-->'];
const cssComment: CommentTokens = ['/*', '*/'];

export const toggleComment: StateCommand = ({ state, dispatch }) => {
    let changes: ChangeSpec[] = [];

    for (const sel of state.selection.ranges) {
        if (cssLanguage.isActiveAt(state, sel.from)) {
            changes = changes.concat(toggleCSSComment(state, sel.from));
        } else if (htmlLanguage.isActiveAt(state, sel.from)) {
            changes = changes.concat(toggleHTMLComment(state, sel.from));
        }
    }

    if (!changes.length) {
        return false;
    }

    const tr = state.update({ changes });
    dispatch(tr);

    return true;
};

function toggleHTMLComment(state: EditorState, pos: number): ChangeSpec[] {
    let result: ChangeSpec[] = [];
    const ctx = getContextOfType(state, pos, ['Element', 'Comment']);
    if (ctx) {
        if (ctx.name === 'Comment') {
            result = result.concat(stripComment(state, ctx, htmlComment))
        } else {
            result = result.concat(addComment(state, ctx, htmlComment, htmlLanguage));
        }
    }

    return result;
}

function toggleCSSComment(state: EditorState, pos: number): ChangeSpec[] {
    let result: ChangeSpec[] = [];
    const ctx = getContextOfType(state, pos, ['RuleSet', 'Declaration', 'Comment']);
    if (ctx) {
        if (ctx.name === 'Comment') {
            result = result.concat(stripComment(state, ctx, cssComment));
        } else {
            result = result.concat(addComment(state, ctx, cssComment, cssLanguage));
        }
    }

    return result;
}

function getContextOfType(state: EditorState, pos: number, types: string[]): SyntaxNode | undefined {
    const names = new Set(types);
    let node: SyntaxNode | null = syntaxTree(state).resolve(pos, 1);
    while (node) {
        if (names.has(node.name)) {
            return node;
        }
        node = node.parent;
    }

    return;
}

function stripComment(state: EditorState, node: SyntaxNode, comment: CommentTokens): ChangeSpec[] {
    const innerRange = narrowToNonSpace(state, {
        from: node.from + comment[0].length,
        to: node.to - comment[1].length
    });
    return [
        { from: node.from, to: innerRange.from },
        { from: innerRange.to, to: node.to },
    ];
}

function addComment(state: EditorState, node: SyntaxNode, comment: CommentTokens, lang: LRLanguage): ChangeSpec[] {
    // Add comment tokens around element
    let { to } = node;
    if (node.name === 'Declaration' && node.nextSibling?.name === ';') {
        // edge case for CSS property
        to = node.nextSibling.to;
    }

    let result: ChangeSpec[] = [
        { from: node.from, insert: comment[0] + ' ' },
        { from: to, insert: ' ' + comment[1] },
    ];

    // Remove nested comments
    result = result.concat(stripChildComments(state, node, comment, lang));

    if (node.name === 'RuleSet') {
        // Edge case for CSS rule set: find nested block first
        const block = node.getChild('Block');
        if (block) {
            result = result.concat(stripChildComments(state, block, comment, lang));
        }
    }

    return result;
}

function stripChildComments(state: EditorState, node: SyntaxNode, comment: CommentTokens, lang: LRLanguage): ChangeSpec[] {
    let result: ChangeSpec[] = [];
    for (const child of node.getChildren('Comment')) {
        if (lang.isActiveAt(state, child.from)) {
            result = result.concat(stripComment(state, child, comment));
        }
    }

    return result;
}
