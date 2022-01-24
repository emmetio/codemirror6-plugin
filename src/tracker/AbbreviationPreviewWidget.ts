import { EditorState } from '@codemirror/state';
import { WidgetType, EditorView } from '@codemirror/view';
import { defaultHighlightStyle } from '@codemirror/highlight';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import type { EmmetPreviewConfig, LangOrLangFactory } from './config';
import type { LanguageSupport } from '@codemirror/language';

interface HTMLElementWithView extends HTMLElement {
    view?: EditorView;
}

export default class AbbreviationPreviewWidget extends WidgetType {
    constructor(public value: string, public syntax: string, private options?: EmmetPreviewConfig) {
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
        if (this.syntax === 'error') {
            elem.classList.add('emmet-preview_error');
        }

        elem.view = new EditorView({
            state: EditorState.create({
                doc: this.value,
                extensions: [
                    defaultHighlightStyle.fallback,
                    this.getLang()
                ]
            }),
            parent: elem
        });
        return elem;
    }

    private getLang(): LanguageSupport {
        let lang: LangOrLangFactory = this.syntax === 'css' ? css : html;

        if (this.options && this.syntax in this.options) {
            lang = this.options[this.syntax as keyof EmmetPreviewConfig]!;
        }

        return typeof lang === 'function' ? lang() : lang;
    }
}
