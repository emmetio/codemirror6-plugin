import type { SyntaxType, AbbreviationContext } from 'emmet';
import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { getContext } from './context';
import type { HTMLContext, CSSContext, EmmetKnownSyntax } from './types';
import { last, getTagAttributes } from './utils';
import getEmmetConfig from './config';

const htmlSyntaxes: EmmetKnownSyntax[] = ['html', 'vue'];
const jsxSyntaxes: EmmetKnownSyntax[] = ['jsx', 'tsx'];
const xmlSyntaxes: EmmetKnownSyntax[] = ['xml', 'xsl', ...jsxSyntaxes];
const cssSyntaxes: EmmetKnownSyntax[] = ['css', 'scss', 'less'];
const markupSyntaxes: EmmetKnownSyntax[] = ['haml', 'jade', 'pug', 'slim', ...htmlSyntaxes, ...xmlSyntaxes, ...jsxSyntaxes];
const stylesheetSyntaxes: EmmetKnownSyntax[] = ['sass', 'sss', 'stylus', 'postcss', ...cssSyntaxes];

export interface SyntaxInfo {
    type: SyntaxType;
    syntax?: string;
    inline?: boolean;
    context?: HTMLContext | CSSContext;
}

export interface StylesheetRegion {
    range: [number, number];
    syntax: string;
    inline?: boolean;
}

export interface SyntaxCache {
    stylesheetRegions?: StylesheetRegion[];
}

const enum TokenType {
    Selector = "selector",
    PropertyName = "propertyName",
    PropertyValue = "propertyValue",
    BlockEnd = "blockEnd"
}

const enum CSSAbbreviationScope {
    /** Include all possible snippets in match */
    Global = "@@global",
    /** Include raw snippets only (e.g. no properties) in abbreviation match */
    Section = "@@section",
    /** Include properties only in abbreviation match */
    Property = "@@property",
    /** Resolve abbreviation in context of CSS property value */
    Value = "@@value"
}

/**
 * Returns Emmet syntax info for given location in view.
 * Syntax info is an abbreviation type (either 'markup' or 'stylesheet') and syntax
 * name, which is used to apply syntax-specific options for output.
 *
 * By default, if given location doesn’t match any known context, this method
 * returns `null`, but if `fallback` argument is provided, it returns data for
 * given fallback syntax
 */
export function syntaxInfo(state: EditorState, ctx?: number | HTMLContext | CSSContext): SyntaxInfo {
    let syntax = docSyntax(state);
    let inline: boolean | undefined;
    let context = typeof ctx === 'number' ? getContext(state, ctx) : ctx;

    if (context?.type === 'html' && context.css) {
        inline = true;
        syntax = 'css';
        context = context.css;
    } else if (context?.type === 'css') {
        syntax = 'css';
    }

    return {
        type: getSyntaxType(syntax),
        syntax,
        inline,
        context
    };
}

/**
 * Returns main editor syntax
 */
export function docSyntax(state: EditorState): EmmetKnownSyntax {
    return getEmmetConfig(state).syntax;
}

/**
 * Returns Emmet abbreviation type for given syntax
 */
export function getSyntaxType(syntax?: EmmetKnownSyntax): SyntaxType {
    return syntax && stylesheetSyntaxes.includes(syntax) ? 'stylesheet' : 'markup';
}

/**
 * Check if given syntax is XML dialect
 */
export function isXML(syntax: string): syntax is EmmetKnownSyntax {
    return xmlSyntaxes.includes(syntax as EmmetKnownSyntax);
}

/**
 * Check if given syntax is HTML dialect (including XML)
 */
export function isHTML(syntax: string): syntax is EmmetKnownSyntax {
    return htmlSyntaxes.includes(syntax as EmmetKnownSyntax) || isXML(syntax);
}

/**
 * Check if given syntax name is supported by Emmet
 */
export function isSupported(syntax: string): syntax is EmmetKnownSyntax {
    return markupSyntaxes.includes(syntax as EmmetKnownSyntax)
        || stylesheetSyntaxes.includes(syntax as EmmetKnownSyntax);
}

/**
 * Check if given syntax is a CSS dialect. Note that it’s not the same as stylesheet
 * syntax: for example, SASS is a stylesheet but not CSS dialect (but SCSS is)
 */
export function isCSS(syntax: string): syntax is EmmetKnownSyntax {
    return cssSyntaxes.includes(syntax as EmmetKnownSyntax);
}

/**
 * Check if given syntax is JSX dialect
 */
export function isJSX(syntax: string): syntax is EmmetKnownSyntax {
    return jsxSyntaxes.includes(syntax as EmmetKnownSyntax);
}

/**
 * Returns context for Emmet abbreviation from given HTML context
 */
export function getMarkupAbbreviationContext(state: EditorState, ctx: HTMLContext): AbbreviationContext | undefined {
    const parent = last(ctx.ancestors);
    if (parent) {
        let node: SyntaxNode | null = syntaxTree(state).resolve(parent.range.from, 1);
        while (node && node.name !== 'OpenTag') {
            node = node.parent;
        }

        return {
            name: parent.name,
            attributes: node ? getTagAttributes(state, node) : {}
        };
    }

    return;
}

/**
 * Returns context for Emmet abbreviation from given CSS context
 */
export function getStylesheetAbbreviationContext(ctx: CSSContext): AbbreviationContext {
    if (ctx.inline) {
        return { name: CSSAbbreviationScope.Property }
    }

    const parent = last(ctx.ancestors);
    let scope: string = CSSAbbreviationScope.Global;
    if (ctx.current) {
        if (ctx.current.type === TokenType.PropertyValue && parent) {
            scope = parent.name;
        } else if ((ctx.current.type === TokenType.Selector || ctx.current.type === TokenType.PropertyName) && !parent) {
            scope = CSSAbbreviationScope.Section;
        }
    } else if (!parent) {
        scope = CSSAbbreviationScope.Section;
    }

    return {
        name: scope
    };
}
