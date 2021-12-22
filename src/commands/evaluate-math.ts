import { EditorSelection } from '@codemirror/state';
import type { ChangeSpec, SelectionRange, StateCommand } from '@codemirror/state';
import evaluate, { extract } from '@emmetio/math-expression';

export const evaluateMath: StateCommand = ({ state, dispatch }) => {
    const changes: ChangeSpec[] = [];
    const nextSel: SelectionRange[] = [];

    for (const sel of state.selection.ranges) {
        let { from, to } = sel;
        if (from === to) {
            const line = state.doc.lineAt(sel.from);
            const expr = extract(line.text, sel.from - line.from);
            if (expr) {
                from = expr[0] + line.from;
                to = expr[1] + line.from;
            }
        }

        if (from !== to) {
            try {
                const result = evaluate(state.doc.sliceString(from ,to));
                if (result !== null) {
                    const insert = result.toFixed(4).replace(/\.?0+$/, '');
                    changes.push({ from, to, insert });
                    nextSel.push(EditorSelection.range(from + insert.length, from + insert.length));
                }
            } catch (err) {
                nextSel.push(sel);
                console.error(err);
            }
        }
    }

    if (changes.length) {
        const tr = state.update({
            changes,
            selection: EditorSelection.create(nextSel)
        });
        dispatch(tr);
        return true;
    }

    return false;
}
