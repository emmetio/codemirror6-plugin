import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import expandAbbreviation, { extract as extractAbbreviation, resolveConfig } from 'emmet';
import type { UserConfig, AbbreviationContext, ExtractedAbbreviation, Options, ExtractOptions, MarkupAbbreviation, StylesheetAbbreviation, SyntaxType } from 'emmet';
import { syntaxInfo, getMarkupAbbreviationContext, getStylesheetAbbreviationContext } from './syntax';
import { getTagAttributes, substr } from './utils';
import getEmmetConfig from './config';
import getOutputOptions, { field } from './output';
import { EmmetKnownSyntax, type ContextTag } from './types';

export interface ExtractedAbbreviationWithContext extends ExtractedAbbreviation {
    context?: AbbreviationContext;
    inline?: boolean;
}

/**
 * Cache for storing internal Emmet data.
 * TODO reset whenever user settings are changed
 */
let cache = {};

export const JSX_PREFIX = '<';

/**
 * Expands given abbreviation into code snippet
 */
export function expand(state: EditorState, abbr: string | MarkupAbbreviation | StylesheetAbbreviation, config?: UserConfig) {
    let opt: UserConfig = { cache };
    const outputOpt: Partial<Options> = {
        'output.field': field,
    };

    if (config) {
        Object.assign(opt, config);
        if (config.options) {
            Object.assign(outputOpt, config.options);
        }
    }

    opt.options = outputOpt;

    const pluginConfig = getEmmetConfig(state);
    if (pluginConfig.config) {
        opt = resolveConfig(opt, pluginConfig.config);
    }

    return expandAbbreviation(abbr as string, opt);
}

/**
 * Extracts abbreviation from given source code by detecting actual syntax context.
 * For example, if host syntax is HTML, it tries to detect if location is inside
 * embedded CSS.
 *
 * It also detects if abbreviation is allowed at given location: HTML tags,
 * CSS selectors may not contain abbreviations.
 * @param code Code from which abbreviation should be extracted
 * @param pos Location at which abbreviation should be expanded
 * @param type Syntax of abbreviation to expand
 */
export function extract(code: string, pos: number, type: SyntaxType = 'markup', options?: Partial<ExtractOptions>): ExtractedAbbreviation | undefined {
    return extractAbbreviation(code, pos, {
        lookAhead: type !== 'stylesheet',
        type,
        ...options
    });
}

/**
 * Returns matched HTML/XML tag for given point in view
 */
export function getTagContext(state: EditorState, pos: number): ContextTag | undefined {
    let element: SyntaxNode | null = syntaxTree(state).resolve(pos, 1);
    while (element && element.name !== 'Element') {
        element = element.parent;
    }

    if (element) {
        const selfClose = element.getChild('SelfClosingTag');
        if (selfClose) {
            return {
                name: getTagName(state, selfClose),
                attributes: getTagAttributes(state, selfClose),
                open: selfClose
            }
        }

        const openTag = element.getChild('OpenTag');
        if (openTag) {
            const closeTag = element.getChild('CloseTag');
            const ctx: ContextTag = {
                name: getTagName(state, openTag),
                attributes: getTagAttributes(state, openTag),
                open: openTag,
            };

            if (closeTag) {
                ctx.close = closeTag;
            }

            return ctx;
        }
    }

    return;
}

export function getTagName(state: EditorState, node: SyntaxNode): string {
    const tagName = node.getChild('TagName');
    return tagName ? substr(state, tagName) : '';
}

/**
 * Returns Emmet options for given character location in editor
 */
export function getOptions(state: EditorState, pos: number): UserConfig {
    const info = syntaxInfo(state, pos);
    const { context } = info;

    const config: UserConfig = {
        type: info.type,
        syntax: info.syntax || EmmetKnownSyntax.html,
        options: getOutputOptions(state, info.inline)
    };

    if (context) {
        // Set context from syntax info
        if (context.type === 'html' && context.ancestors.length) {
            config.context = getMarkupAbbreviationContext(state, context);
        } else if (context.type === 'css') {
            config.context = getStylesheetAbbreviationContext(context);
        }
    }

    return config;
}

export function resetCache() {
    cache = {};
}
