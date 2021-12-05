import type { StateCommand } from '@codemirror/state';
import { expand, extract, getOptions } from '../lib/emmet';
import { getSyntaxType } from '../lib/syntax';
import { getSelectionsFromSnippet } from '../lib/utils';

/** Characters to indicate tab stop start and end in generated snippet */
export const tabStopStart = String.fromCodePoint(0xFFF0);
export const tabStopEnd = String.fromCodePoint(0xFFF1);

export const expandAbbreviation: StateCommand = ({ state, dispatch }) => {
    const sel = state.selection.main;

    if (!sel.empty) {
        console.log('Skip due to non-empty selection');
        return false;
    }

    const line = state.doc.lineAt(sel.anchor);
    const options = getOptions(state, sel.anchor);
    const abbr = extract(line.text, sel.anchor - line.from, getSyntaxType(options.syntax));

    if (abbr) {
        const start = line.from + abbr.start;
        const expanded = expand(abbr.abbreviation, options);
        const { ranges, snippet } = getSelectionsFromSnippet(expanded, start);

        const nextSel = ranges[0];
        const transaction = state.update({
            changes: [{
                from: start,
                to: line.from + abbr.end,
                insert: snippet
            }],
            selection: {
                head: nextSel[0],
                anchor: nextSel[1]
            }
        });
        dispatch(transaction);
        return true;
    }

    return false;
};

