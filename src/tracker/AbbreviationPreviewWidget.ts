import { EditorState } from '@codemirror/state';
import { WidgetType, EditorView } from '@codemirror/view';
import { defaultHighlightStyle } from '@codemirror/highlight';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';

interface HTMLElementWithView extends HTMLElement {
    view?: EditorView;
}

export default class AbbreviationPreviewWidget extends WidgetType {
    constructor(public value: string, public syntax: string) {
        super();
    }

    eq(other: any) {
        return other.value === this.value && other.syntax === this.syntax;
    }

    updateDOM(_dom: HTMLElementWithView): boolean {
        if (_dom.view) {
            const tr = _dom.view.state.update({
                changes: {
                    from: 0,
                    to: _dom.view.state.doc.length,
                    insert: this.value
                }
            });
            _dom.view.dispatch(tr);
            return true;
        }

        return false;
    }

    toDOM() {
        const elem = document.createElement('div') as HTMLElementWithView;
        elem.className = 'emmet-preview';
        elem.view = new EditorView({
            state: EditorState.create({
                doc: this.value,
                extensions: [
                    defaultHighlightStyle.fallback,
                    this.syntax === 'css' ? css() : html()
                ]
            }),
            parent: elem
        });
        return elem;
    }
}
