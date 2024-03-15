import { EditorView } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import type { EmmetPreviewConfig, PreviewExtensions } from '../lib/config';
import { EmmetKnownSyntax } from '../plugin';

export interface HTMLElementPreview extends HTMLElement {
    update?: (value: string) => void;
}

export function createPreview(value: string, syntax: string, options?: EmmetPreviewConfig): HTMLElementPreview {
    const elem = document.createElement('div') as HTMLElementPreview;
    elem.className = 'emmet-preview';
    if (syntax === 'error') {
        elem.classList.add('emmet-preview_error');
    }

    let ext: PreviewExtensions = syntax === EmmetKnownSyntax.css ? css : html;
    if (options && syntax in options) {
        ext = options[syntax as keyof EmmetPreviewConfig]!;
    }

    const view = new EditorView({
        doc: value,
        extensions: [
            EditorState.readOnly.of(true),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            syntax === EmmetKnownSyntax.css ? css() : html(),
            ext()
        ],
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
