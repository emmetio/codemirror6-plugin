import type { UserConfig } from 'emmet';
import { EditorView, keymap, ViewPlugin } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import type { Extension, StateCommand, } from '@codemirror/state';
import { undo } from '@codemirror/commands';
import { expand, getOptions, getTagContext } from '../lib/emmet';
import { getSelectionsFromSnippet, narrowToNonSpace, rangeEmpty, substr } from '../lib/utils';
import type { RangeObject, ContextTag } from '../lib/types';
import { lineIndent } from '../lib/output';

interface WrapAbbreviation {
    abbreviation: string;
    range: RangeObject;
    options: UserConfig;
    context?: ContextTag;
}

const updateAbbreviation = StateEffect.define<WrapAbbreviation | null>();

const wrapAbbreviationField = StateField.define<WrapAbbreviation | null>({
    create: () => null,
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(updateAbbreviation)) {
                value = effect.value;
            }
        }
        return value;
    }
});

const wrapTheme = EditorView.baseTheme({
    '.emmet-wrap-with-abbreviation': {
        position: 'absolute',
        top: 0,
        zIndex: 2,
        width: '100%'
    },
    '.emmet-wrap-with-abbreviation__content': {
        background: '#fff',
        margin: '0 auto',
        padding: '5px',
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '30em',
        borderBottomLeftRadius: '5px',
        borderBottomRightRadius: '5px',
        boxShadow: '0 3px 10px rgba(0, 0, 0, 0.3)',
    },
    '.emmet-wrap-with-abbreviation__content input': {
        width: '100%',
        boxSizing: 'border-box'
    }
});

const enterWrapWithAbbreviation: StateCommand = ({ state, dispatch }) => {
    const abbr = state.field(wrapAbbreviationField);
    if (abbr === null) {
        const sel = state.selection.main;
        const context = getTagContext(state, sel.from);
        const wrapRange = getWrapRange(state, sel, context);
        const options = getOptions(state, wrapRange.from);
        options.text = getContent(state, wrapRange);

        const tr = state.update({
            effects: [updateAbbreviation.of({
                abbreviation: '',
                range: wrapRange,
                options,
                context
            })]
        });
        dispatch(tr);
        return true;
    }

    return false;
}

const wrapWithAbbreviationPlugin = ViewPlugin.fromClass(class WrapWithAbbreviationViewPlugin {
    private widget: HTMLElement | null = null;
    private input: HTMLInputElement | null = null;

    update(update: ViewUpdate) {
        const { state, view } = update;
        const abbr = state.field(wrapAbbreviationField);
        if (abbr) {
            if (!this.widget) {
                this.createInputPanel(view);
            }
            this.updateAbbreviation(abbr.abbreviation);
        } else if (this.widget) {
            this.disposeWidget();
            view.focus();
        }
    }

    // TODO use @codemirror/panel instead
    private createInputPanel(view: EditorView) {
        const widget = document.createElement('div');
        widget.className = 'emmet-wrap-with-abbreviation';

        const content = document.createElement('div');
        content.className = 'emmet-wrap-with-abbreviation__content';

        const input = document.createElement('input');
        input.placeholder = 'Enter abbreviation';

        let updated = false;

        const undoUpdate = () => {
            if (updated) {
                undo(view);
                updated = false;
            }
        };

        input.addEventListener('input', () => {
            const abbr = view.state.field(wrapAbbreviationField);
            if (abbr) {
                const nextAbbreviation = input.value;
                undoUpdate();

                const nextAbbr: WrapAbbreviation = {
                    ...abbr,
                    abbreviation: nextAbbreviation
                };

                if (nextAbbr.abbreviation) {
                    updated = true;
                    const { from, to } = nextAbbr.range;
                    const expanded = expand(view.state, nextAbbr.abbreviation, nextAbbr.options);
                    const { ranges, snippet } = getSelectionsFromSnippet(expanded, from);
                    const nextSel = ranges[0];

                    view.dispatch({
                        effects: [updateAbbreviation.of(nextAbbr)],
                        changes: [{
                            from,
                            to,
                            insert: snippet
                        }],
                        selection: {
                            head: nextSel.from,
                            anchor: nextSel.to
                        }
                    });
                } else {
                    view.dispatch({
                        effects: [updateAbbreviation.of(nextAbbr)],
                    });
                }
            }
        });

        input.addEventListener('keydown', evt => {
            if (evt.key === 'Escape' || evt.key === 'Enter') {
                if (evt.key === 'Escape') {
                    undoUpdate();
                }
                evt.preventDefault();
                view.dispatch({
                    effects: [updateAbbreviation.of(null)]
                });
            }
        });

        content.append(input)
        widget.append(content);
        view.dom.append(widget);
        this.widget = widget;
        this.input = input;
        input.focus();
    }

    private updateAbbreviation(value: string) {
        if (this.input && this.input.value !== value) {
            this.input.value = value;
        }
    }

    private disposeWidget() {
        if (this.widget) {
            this.widget.remove();
            this.widget = this.input = null;
        }
    }
});

export function wrapWithAbbreviation(key = 'Ctrl-w'): Extension[] {
    return [
        wrapAbbreviationField,
        wrapWithAbbreviationPlugin,
        wrapTheme,
        keymap.of([{
            key,
            run: enterWrapWithAbbreviation
        }])
    ];
}

function getWrapRange(editor: EditorState, range: RangeObject, context?: ContextTag): RangeObject {
    if (rangeEmpty(range) && context) {
        // No selection means user wants to wrap current tag container
        const { open, close } = context;
        const pos = range.from;

        // Check how given point relates to matched tag:
        // if it's in either open or close tag, we should wrap tag itself,
        // otherwise we should wrap its contents

        if (inRange(open, pos) || (close && inRange(close, pos))) {
            return {
                from: open.from,
                to: close ? close.to : open.to
            };
        }

        if (close) {
            return narrowToNonSpace(editor, { from: open.to, to: close.from });
        }
    }

    return range;
}

function inRange(range: RangeObject, pt: number): boolean {
    return range.from < pt && pt < range.to;
}

/**
 * Returns contents of given region, properly de-indented
 */
function getContent(state: EditorState, range: RangeObject): string | string[] {
    const baseIndent = lineIndent(state.doc.lineAt(range.from));
    const srcLines = substr(state, range).split('\n');
    const destLines = srcLines.map(line => {
        return line.startsWith(baseIndent)
            ? line.slice(baseIndent.length)
            : line;
    });

    return destLines;
}
