import type { ChangeSpec, EditorState, StateCommand, TransactionSpec } from '@codemirror/state';
import { getTagContext } from '../lib/emmet';
import type { ContextTag } from '../lib/types';
import { lineIndent } from '../lib/output';
import { narrowToNonSpace, rangeEmpty, isSpace } from '../lib/utils';

export const removeTag: StateCommand = ({ state, dispatch }) => {
    const specs: TransactionSpec[] = [];
    for (const sel of state.selection.ranges) {
        const tag = getTagContext(state, sel.from);
        if (tag) {
            specs.push(removeTagSpec(state, tag));
        } else {
            specs.push({ selection: sel });
        }
    }

    if (specs.some(t => t.changes)) {
        const tr = state.update(...specs);
        dispatch(tr);
        return true;
    }

    return false;
};

function removeTagSpec(state: EditorState, { open, close }: ContextTag): TransactionSpec {
    const changes: ChangeSpec[] = [];
    if (close) {
        // Remove open and close tag and dedent inner content
        const innerRange = narrowToNonSpace(state, { from: open.to, to: close.from });
        if (!rangeEmpty(innerRange)) {
            // Gracefully remove open and close tags and tweak indentation on tag contents
            changes.push({ from: open.from, to: innerRange.from });

            const lineStart = state.doc.lineAt(open.from);
            const lineEnd = state.doc.lineAt(close.to);
            if (lineStart.number !== lineEnd.number) {
                // Skip two lines: first one for open tag, on second one
                // indentation will be removed with open tag
                let lineNum = lineStart.number + 2;
                const baseIndent = getLineIndent(state, open.from);
                const innerIndent = getLineIndent(state, innerRange.from);

                while (lineNum <= lineEnd.number) {
                    const line = state.doc.line(lineNum);
                    if (isSpace(line.text.slice(0, innerIndent.length))) {
                        changes.push({
                            from: line.from,
                            to: line.from + innerIndent.length,
                            insert: baseIndent
                        });
                    }
                    lineNum++;
                }
            }

            changes.push({ from: innerRange.to, to: close.to });
        } else {
            changes.push({ from: open.from, to: close.to });
        }
    } else {
        changes.push(open);
    }

    return { changes };
}

/**
 * Returns indentation for line found from given character location
 */
function getLineIndent(state: EditorState, pos: number): string {
    return lineIndent(state.doc.lineAt(pos));
}
