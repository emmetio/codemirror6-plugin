import type { TextRange } from '@emmetio/action-utils';
import expand, { extract } from 'emmet';
import type { StateCommand, EditorState } from '@codemirror/state';
import { language } from '@codemirror/language';
import { htmlLanguage } from '@codemirror/lang-html';
import { cssLanguage } from '@codemirror/lang-css';

/** Characters to indicate tab stop start and end in generated snippet */
export const tabStopStart = String.fromCodePoint(0xFFF0);
export const tabStopEnd = String.fromCodePoint(0xFFF1);

export const expandAbbreviation: StateCommand = ({ state, dispatch }) => {
    const sel = state.selection.main;
    const line = state.doc.lineAt(sel.anchor);
    const abbr = extract(line.text, sel.anchor - line.from, { lookAhead: true });

    getLang(state);

    console.log('extract abbr', {
        line: line.text,
        pos: sel.anchor - line.from,
        result: abbr,
        lang: state.languageDataAt('html', sel.anchor)
    });

    if (abbr) {
        const start = line.from + abbr.start;
        const expanded = expand(abbr.abbreviation, {
            options: {
                'output.field': field()
            }
        });
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

function field() {
    let handled = -1;
    return (index: number, placeholder: string) => {
        if (handled === -1 || handled === index) {
            handled = index;
            return placeholder
                ? tabStopStart + placeholder + tabStopEnd
                : tabStopStart;
        }

        return placeholder || '';
    }
}

/**
 * Finds and collects selections ranges from given snippet
 */
function getSelectionsFromSnippet(snippet: string, base = 0): { ranges: TextRange[], snippet: string } {
    // Find and collect selection ranges from snippet
    const ranges: TextRange[] = [];
    let result = '';
    let sel: TextRange | null = null;
    let offset = 0;
    let i = 0;
    let ch: string;

    while (i < snippet.length) {
        ch = snippet.charAt(i++);
        if (ch === tabStopStart || ch === tabStopEnd) {
            result += snippet.slice(offset, i - 1);
            offset = i;

            if (ch === tabStopStart) {
                sel = [base + result.length, base + result.length];
                ranges.push(sel);
            } else if (sel) {
                sel[1] = base + result.length;
                sel = null;
            }
        }
    }

    return {
        ranges,
        snippet: result + snippet.slice(offset)
    };
}


function getLang(state: EditorState) {
    const topLang = state.facet(language);
    console.log('top lang', topLang);

    if (topLang === htmlLanguage) {
        const sel = state.selection.main;
        console.log('in html');
        if (cssLanguage.isActiveAt(state, sel.anchor)) {
            console.log('in css');
        }
    }
}
