import type { ChangeSpec, EditorState, StateCommand } from '@codemirror/state';
import { getTagContext } from '../lib/emmet';
import { isSpace } from '../lib/utils';

export const splitJoinTag: StateCommand = ({ state, dispatch }) => {
    const changes: ChangeSpec[] = [];
    for (const sel of state.selection.ranges) {
        const tag = getTagContext(state, sel.from);
        if (tag) {
            const { open, close } = tag;
            if (close) {
                // Join tag: remove tag contents, if any, and add closing slash
                let closing = isSpace(getChar(state, open.to - 2)) ? '/' : ' /';
                changes.push({
                    from: open.to - 1,
                    to: close.to,
                    insert: `${closing}>`
                });
            } else {
                // Split tag: add closing part and remove closing slash
                let insert = `</${tag.name}>`;
                let from = open.to;
                let to = open.to;

                if (getChar(state, open.to - 2) === '/') {
                    from -= 2;
                    if (isSpace(getChar(state, from - 1))) {
                        from--;
                    }
                    insert = '>' + insert;
                }

                changes.push({ from, to, insert });
            }
        }
    }

    if (changes.length) {
        const tr = state.update({ changes });
        dispatch(tr);
        return true;
    }

    return false;
};

function getChar(state: EditorState, pos: number): string {
    return state.doc.sliceString(pos, pos + 1);
}
