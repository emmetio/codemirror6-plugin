import { EditorSelection } from '@codemirror/state';
import type { SelectionRange, StateCommand } from '@codemirror/state';
import { htmlLanguage } from '@codemirror/lang-html';
import { getTagContext } from '../lib/emmet';

export const goToTagPair: StateCommand = ({ state, dispatch }) => {
    const nextRanges: SelectionRange[] = [];
    let found = false;
    for (const sel of state.selection.ranges) {
        const pos = sel.from;
        let nextSel = sel;
        if (htmlLanguage.isActiveAt(state, pos)) {
            const ctx = getTagContext(state, pos);
            if (ctx && ctx.open && ctx.close) {
                found = true;
                const { open, close } = ctx;
                const nextPos = open[0] <= pos && pos < open[1]
                    ? close[0]
                    : open[0];
                nextSel = EditorSelection.cursor(nextPos);
            }
        }

        nextRanges.push(nextSel);
    }

    if (found) {
        const tr = state.update({
            selection: EditorSelection.create(nextRanges)
        });
        dispatch(tr);
        return true;
    }

    return false;
};
