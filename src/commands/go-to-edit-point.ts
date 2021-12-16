import { EditorSelection } from '@codemirror/state';
import type { EditorState, SelectionRange, StateCommand } from '@codemirror/state';
import { isQuote, isSpace } from '../lib/utils';

export const goToNextEditPoint: StateCommand = ({ state, dispatch }) => {
    const tr = state.update({
        selection: getNextSel(state, 1)
    });
    dispatch(tr);
    return true;
};

export const goToPreviousEditPoint: StateCommand = ({ state, dispatch }) => {
    const tr = state.update({
        selection: getNextSel(state, -1)
    });
    dispatch(tr);
    return true;
};

function getNextSel(state: EditorState, inc: number): EditorSelection {
    const nextSel: SelectionRange[] = [];
    for (const sel of state.selection.ranges) {
        const nextPos = findNewEditPoint(state, sel.from + inc, inc);
        if (nextPos != null) {
            nextSel.push(EditorSelection.cursor(nextPos));
        } else {
            nextSel.push(sel);
        }
    }

    return EditorSelection.create(nextSel);
}

function findNewEditPoint(state: EditorState, pos: number, inc: number): number | undefined {
    const doc = state.doc.toString();
    const docSize = doc.length;
    let curPos = pos;

    while (curPos < docSize && curPos >= 0) {
        curPos += inc;
        const cur = doc[curPos];
        const next = doc[curPos + 1];
        const prev = doc[curPos - 1];

        if (isQuote(cur) && next === cur && prev === '=') {
            // Empty attribute value
            return curPos + 1;
        }

        if (cur === '<' && prev === '>') {
            // Between tags
            return curPos;
        }

        if (isNewLine(cur)) {
            const line = state.doc.lineAt(curPos + inc);
            if (!line.length || isSpace(line.text)) {
                // Empty line
                return line.from + line.text.length;
            }
        }
    }

    return;
}

function isNewLine(ch: string) {
    return ch === '\r' || ch === '\n';
}
