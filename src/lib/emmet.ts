import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import expandAbbreviation, { extract as extractAbbreviation, resolveConfig } from 'emmet';
import type { UserConfig, AbbreviationContext, ExtractedAbbreviation, Options, ExtractOptions, MarkupAbbreviation, StylesheetAbbreviation, SyntaxType } from 'emmet';
import { balancedInward, balancedOutward } from '@emmetio/html-matcher';
import { balancedInward as cssBalancedInward, balancedOutward as cssBalancedOutward } from '@emmetio/css-matcher';
import { selectItemCSS, selectItemHTML } from '@emmetio/action-utils';
import type { TextRange } from '@emmetio/action-utils';
import evaluate, { extract as extractMath } from '@emmetio/math-expression';
import type { ExtractOptions as MathExtractOptions } from '@emmetio/math-expression';
import { syntaxInfo, getMarkupAbbreviationContext, getStylesheetAbbreviationContext } from './syntax';
import { getTagAttributes, nodeRange, substr } from './utils';
import getEmmetConfig from './config';
import getOutputOptions, { field } from './output';

interface EvaluatedMath {
    start: number;
    end: number;
    result: number;
    snippet: string;
}

export interface ContextTag extends AbbreviationContext {
    open: TextRange;
    close?: TextRange;
}

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
export function expand(abbr: string | MarkupAbbreviation | StylesheetAbbreviation, config?: UserConfig) {
    let opt: UserConfig = { cache };
    const outputOpt: Partial<Options> = {
        'output.field': field(),
    };

    if (config) {
        Object.assign(opt, config);
        if (config.options) {
            Object.assign(outputOpt, config.options);
        }
    }

    opt.options = outputOpt;

    const pluginConfig = getEmmetConfig();
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
 * @param syntax Syntax of abbreviation to expand
 */
export function extract(code: string, pos: number, type: SyntaxType = 'markup', options?: Partial<ExtractOptions>): ExtractedAbbreviation | undefined {
    return extractAbbreviation(code, pos, {
        lookAhead: type !== 'stylesheet',
        type,
        ...options
    });
}

/**
 * Returns list of tags for balancing for given code
 */
export function balance(code: string, pos: number, inward = false, xml = false) {
    const options = { xml };
    return inward
        ? balancedInward(code, pos, options)
        : balancedOutward(code, pos, options);
}

/**
 * Returns list of selector/property ranges for balancing for given code
 */
export function balanceCSS(code: string, pos: number, inward?: boolean) {
    return inward
        ? cssBalancedInward(code, pos)
        : cssBalancedOutward(code, pos);
}

/**
 * Returns model for selecting next/previous item
 */
export function selectItem(code: string, pos: number, isCSS?: boolean, isPrevious?: boolean) {
    return isCSS
        ? selectItemCSS(code, pos, isPrevious)
        : selectItemHTML(code, pos, isPrevious);
}

/**
 * Finds and evaluates math expression at given position in line
 */
export function evaluateMath(code: string, pos: number, options?: Partial<MathExtractOptions>): EvaluatedMath | undefined {
    const expr = extractMath(code, pos, options);
    if (expr) {
        try {
            const [start, end] = expr;
            const result = evaluate(code.slice(start, end));
            if (result !== null) {
                return {
                    start, end, result,
                    snippet: result.toFixed(4).replace(/\.?0+$/, '')
                };
            }
        } catch (err) {
            console.error(err);
        }
    }
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
                open: nodeRange(selfClose)
            }
        }

        const openTag = element.getChild('OpenTag');
        if (openTag) {
            const closeTag = element.getChild('CloseTag');
            const ctx: ContextTag = {
                name: getTagName(state, openTag),
                attributes: getTagAttributes(state, openTag),
                open: nodeRange(openTag),
            };

            if (closeTag) {
                ctx.close = nodeRange(closeTag);
            }

            return ctx;
        }
    }

    return;
}

function getTagName(state: EditorState, node: SyntaxNode): string {
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
        syntax: info.syntax || 'html',
        options: getOutputOptions(state, pos, info.inline)
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
