import type { StateCommand } from '@codemirror/state';
import { expand, extract, getOptions } from '../lib/emmet';
import { getSyntaxType } from '../lib/syntax';
import { snippet } from '@codemirror/autocomplete';
import { getActivationContext } from '../tracker';
import type { EmmetKnownSyntax } from '../lib/types';

export const expandAbbreviation: StateCommand = ({ state, dispatch }) => {
    const sel = state.selection.main;
    const line = state.doc.lineAt(sel.anchor);
    const options = getOptions(state, sel.anchor);
    const abbr = extract(line.text, sel.anchor - line.from, getSyntaxType(options.syntax as EmmetKnownSyntax));

    if (abbr) {
        const start = line.from + abbr.start;
        const expanded = expand(state, abbr.abbreviation, getActivationContext(state, start) || options);
        const fn = snippet(expanded);
        fn({ state, dispatch }, { label: 'expand' }, start, line.from + abbr.end);
        return true;
    }

    return false;
};

