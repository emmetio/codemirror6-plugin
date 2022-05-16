import { EditorState } from '@codemirror/state';
import { WidgetType, EditorView } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import type { EmmetPreviewConfig, PreviewExtensions } from './config';

export interface HTMLElementPreview extends HTMLElement {
    update?: (value: string) => void;
}

export default class AbbreviationPreviewWidget extends WidgetType {
    constructor(public value: string, public syntax: string, private options?: EmmetPreviewConfig) {
        super();
    }

    eq(other: any) {
        console.log('compare', {
            curValue: this.value,
            otherValue: other.value,
            curSyntax: this.syntax,
            otherSyntax: other.syntax
        });

        return other.value === this.value && other.syntax === this.syntax;
    }

    updateDOM(_dom: HTMLElementPreview): boolean {
        console.log('update dom', _dom);

        if (_dom.update) {
            console.log('update preview');
            _dom.update(this.value);
            return true;
        }

        return false;
    }

    toDOM() {
        console.log('create preview');
        return createPreview(this.value, this.syntax, this.options);
    }
}

export function createPreview(value: string, syntax: string, options?: EmmetPreviewConfig): HTMLElementPreview {
    const elem = document.createElement('div') as HTMLElementPreview;
    elem.className = 'emmet-preview';
    if (syntax === 'error') {
        elem.classList.add('emmet-preview_error');
    }

    let ext: PreviewExtensions = syntax === 'css' ? css : html;
    if (options && syntax in options) {
        ext = options[syntax as keyof EmmetPreviewConfig]!;
    }

    const view = new EditorView({
        state: EditorState.create({
            doc: value,
            extensions: [
                EditorState.readOnly.of(true),
                syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                ext()
            ]
        }),
        parent: elem
    });

    elem.update = (nextValue) => {
        const tr = view.state.update({
            changes: {
                from: 0,
                to: view.state.doc.length,
                insert: nextValue
            }
        });
        view.dispatch(tr);
    };

    return elem;
}
