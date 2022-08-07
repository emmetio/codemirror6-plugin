import type { Options } from 'emmet';
import type { EditorState, Line } from '@codemirror/state';
import getEmmetConfig from './config';
import { isHTML, docSyntax } from './syntax';

export default function getOutputOptions(state: EditorState, inline?: boolean): Partial<Options> {
    const syntax = docSyntax(state) || 'html';
    const config = getEmmetConfig(state);

    const opt: Partial<Options> = {
        // 'output.baseIndent': lineIndent(state.doc.lineAt(pos)),
        // 'output.indent': getIndentation(state),
        'output.field': field,
        'output.indent': '\t',
        'output.format': !inline,
        'output.attributeQuotes': config.attributeQuotes,
        'stylesheet.shortHex': config.shortHex
    };

    if (syntax === 'html') {
        opt['output.selfClosingStyle'] = config.markupStyle;
        opt['output.compactBoolean'] = config.markupStyle === 'html';
    }

    if (isHTML(syntax)) {
        if (config.comments) {
            opt['comment.enabled'] = true;
            if (config.commentsTemplate) {
                opt['comment.after'] = config.commentsTemplate;
            }
        }

        opt['bem.enabled'] = config.bem;
    }

    return opt;
}

/**
 * Produces tabstop for CodeMirror editor
 */
export function field(index: number, placeholder?: string) {
    return placeholder ? `\${${index}:${placeholder}}` : `\${${index}}`;
}

/**
 * Returns indentation of given line
 */
export function lineIndent(line: Line): string {
    const indent = line.text.match(/^\s+/);
    return indent ? indent[0] : '';
}

/**
 * Returns token used for single indentation in given editor
 */
export function getIndentation(state: EditorState): string {
    const { tabSize } = state;
    return tabSize ? ' '.repeat(tabSize) : '\t';
}
