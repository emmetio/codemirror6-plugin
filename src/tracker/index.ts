import type { MarkupAbbreviation, StylesheetAbbreviation, UserConfig } from 'emmet';
import { stylesheetAbbreviation, markupAbbreviation } from 'emmet';
import { ViewPlugin, Decoration, keymap, EditorView } from '@codemirror/view';
import type { DecorationSet, Command, ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension, StateCommand, Transaction } from '@codemirror/state';
import type { Range } from '@codemirror/rangeset';
import { htmlLanguage } from '@codemirror/lang-html';
import { cssLanguage } from '@codemirror/lang-css';
import { snippet } from '@codemirror/autocomplete';
import { getCSSContext, getHTMLContext } from '../lib/context';
import { docSyntax, getMarkupAbbreviationContext, getStylesheetAbbreviationContext, getSyntaxType, isCSS, isHTML, isJSX, isSupported } from '../lib/syntax';
import getOutputOptions from '../lib/output';
import type { CSSContext, AbbreviationError, StartTrackingParams, RangeObject } from '../lib/types';
import { contains, getCaret, rangeEmpty, substr } from '../lib/utils';
import { expand } from '../lib/emmet';
import AbbreviationPreviewWidget from './AbbreviationPreviewWidget';

type AbbreviationTracker = AbbreviationTrackerValid | AbbreviationTrackerError;

interface AbbreviationTrackerBase {
    /** Range in editor for abbreviation */
    range: RangeObject;

    /** Actual abbreviation, tracked by current tracker */
    abbreviation: string;

    /**
     * Abbreviation was forced, e.g. must remain in editor even if empty or contains
     * invalid abbreviation
     */
    forced: boolean;

    /**
     * Relative offset from range start where actual abbreviation starts.
     * Used tp handle prefixes in abbreviation
     */
    offset: number;

    config: UserConfig;
}

export interface AbbreviationTrackerValid extends AbbreviationTrackerBase {
    type: 'abbreviation';

    /**
     * Abbreviation is simple, e.g. contains single element.
     * It’s suggested to not display preview for simple abbreviation
     */
    simple: boolean;

    /** Preview of expanded abbreviation */
    preview: string;
}

export interface AbbreviationTrackerError extends AbbreviationTrackerBase {
    type: 'error';
    error: AbbreviationError;
}

export const JSX_PREFIX = '<';

const underlineMark = Decoration.mark({ class: 'emmet-tracker' });

const resetTracker = StateEffect.define();
const forceTracker = StateEffect.define();

export const enterAbbreviationMode: StateCommand = ({ state, dispatch }) => {
    const tr = state.update({
        effects: [forceTracker.of(null)]
    });
    dispatch(tr);
    return true;
};

const trackerField = StateField.define<AbbreviationTracker | null>({
    create: () => null,
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(resetTracker)) {
                return null;
            }

            if (effect.is(forceTracker)) {
                const sel = tr.newSelection.main;
                const config = getActivationContext(tr.state, sel.from);
                if (config) {
                    return createTracker(tr.state, sel, {
                        forced: true,
                        config
                    });
                }
            }
        }

        if (!tr.docChanged) {
            return value;
        }

        return handleUpdate(tr.state, value, tr);
    }
});

const abbreviationTracker = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor() {
        this.decorations = Decoration.none;
    }

    update(update: ViewUpdate) {
        const { state } = update;
        const tracker = state.field(trackerField);
        const decors: Range<Decoration>[] = [];

        if (tracker) {
            const { range } = tracker;

            if (!rangeEmpty(range)) {
                decors.push(underlineMark.range(range.from, range.to));
            }

            if (tracker.type === 'abbreviation' && (!tracker.simple || tracker.forced) && tracker.abbreviation && contains(range, getCaret(state))) {
                const preview = Decoration.widget({
                    widget: new AbbreviationPreviewWidget(tracker.preview, tracker.config.syntax || 'html'),
                    side: 1
                });
                decors.push(preview.range(range.from));
            } else if (tracker.type === 'error' && tracker.forced) {
                const errMessage = `↑\n${tracker.error.message}`;
                const preview = Decoration.widget({
                    widget: new AbbreviationPreviewWidget(errMessage, 'error'),
                    side: 1
                });
                decors.push(preview.range(range.from + tracker.error.pos));
            }
            this.decorations = Decoration.set(decors, true);
        } else {
            this.decorations = Decoration.none;
        }
    }
}, {
    decorations: v => v.decorations,
});

const tabKeyHandler: Command = ({ state, dispatch }) => {
    const tracker = state.field(trackerField, false);
    if (tracker && contains(tracker.range, getCaret(state))) {
        const { from, to } = tracker.range;
        const expanded = expand(tracker.abbreviation, tracker.config);
        const fn = snippet(expanded);
        fn({ state, dispatch }, { label: 'expand' }, from, to);
        return true;
    }
    return false;
};

const escKeyHandler: Command = ({ state, dispatch }) => {
    const tracker = state.field(trackerField, false);
    if (tracker) {
        dispatch({
            effects: resetTracker.of(null)
        });
        return true;
    }

    return false;
};

const trackerTheme = EditorView.baseTheme({
    '.emmet-tracker': {
        textDecoration: 'underline 1px green',
    },
    '.emmet-preview': {
        position: 'absolute',
        boxShadow: '2px 2px 10px rgba(0, 0, 0, 0.3)',
        borderRadius: '3px',
        background: '#fff',
        display: 'inline-block',
        marginLeft: '-5px',
        marginTop: '1.6em',
        fontSize: '0.8em'
    },
    '.emmet-preview_error': {
        color: 'red'
    }
});

/**
 * A factory function that creates abbreviation tracker for known syntaxes.
 * When user starts typing, it detects whether user writes abbreviation and
 * if so, starts tracking by displaying an underline. Then if user hit Tab key
 * when cursor is inside tracked abbreviation, it will expand it. Or user can
 * press Escape key to reset tracker
 */
export default function tracker(): Extension[] {
    return [
        trackerField,
        abbreviationTracker,
        trackerTheme,
        keymap.of([{
            key: 'Tab',
            run: tabKeyHandler
        }, {
            key: 'Escape',
            run: escKeyHandler
        }])
    ]
}

export { resetTracker as trackerResetAction }

/**
 * Check if abbreviation tracking is allowed in editor at given location
 */
export function allowTracking(state: EditorState): boolean {
    return isSupported(docSyntax(state));
}

/**
 * Detects if user is typing abbreviation at given location
 * @param pos Location where user started typing
 * @param input Text entered at `pos` location
 */
function typingAbbreviation(state: EditorState, pos: number, input: string): AbbreviationTracker | null {
    if (input.length !== 1) {
        // Expect single character enter to start abbreviation tracking
        return null;
    }

    // Start tracking only if user starts abbreviation typing: entered first
    // character at the word bound
    const line = state.doc.lineAt(pos);
    const prefix = line.text.substring(Math.max(0, pos - line.from - 1), pos - line.from);

    // Check if current syntax is supported for tracking
    if (!canStartStarting(prefix, input, getSyntaxFromPos(state, pos))) {
        return null;
    }

    const config = getActivationContext(state, pos);

    if (!config) {
        return null;
    }

    if (config.type === 'stylesheet' && !canStartStarting(prefix, input, 'css')) {
        // Additional check for stylesheet abbreviation start: it’s slightly
        // differs from markup prefix, but we need activation context
        // to ensure that context under caret is CSS
        return null;
    }

    const syntax = config.syntax || 'html';
    let from = pos;
    let to = pos + input.length;
    let offset = 0;

    if (isJSX(syntax) && prefix === JSX_PREFIX) {
        offset = JSX_PREFIX.length;
        from -= offset;
    }

    return createTracker(state, { from, to }, { config });
}

/**
 * Detects and returns valid abbreviation activation context for given location
 * in editor which can be used for abbreviation expanding.
 * For example, in given HTML code:
 * `<div title="Sample" style="">Hello world</div>`
 * it’s not allowed to expand abbreviations inside `<div ...>` or `</div>`,
 * yet it’s allowed inside `style` attribute and between tags.
 *
 * This method ensures that given `pos` is inside location allowed for expanding
 * abbreviations and returns context data about it.
 */
export function getActivationContext(state: EditorState, pos: number): UserConfig | undefined {
    if (cssLanguage.isActiveAt(state, pos)) {
        return getCSSActivationContext(state, pos, 'css', getCSSContext(state, pos));
    }

    const syntax = docSyntax(state);

    if (isHTML(syntax)) {
        const ctx = getHTMLContext(state, pos);

        if (ctx.css) {
            return getCSSActivationContext(state, pos, 'css', ctx.css);
        }

        if (!ctx.current) {
            return {
                syntax,
                type: 'markup',
                context: getMarkupAbbreviationContext(state, ctx),
                options: getOutputOptions(state, pos)
            };
        }
    } else {
        return {
            syntax,
            type: getSyntaxType(syntax),
            options: getOutputOptions(state, pos)
        };
    }

    return undefined;
}

function getCSSActivationContext(state: EditorState, pos: number, syntax: string, ctx: CSSContext): UserConfig | undefined {
    const allowedContext = !ctx.current
        || ctx.current.type === 'propertyName'
        || ctx.current.type === 'propertyValue'
        || isTypingBeforeSelector(state, pos, ctx);

    if (allowedContext) {
        return {
            syntax,
            type: 'stylesheet',
            context: getStylesheetAbbreviationContext(ctx),
            options: getOutputOptions(state, pos, ctx.inline)
        };
    }

    return;
}

/**
 * Handle edge case: start typing abbreviation before selector. In this case,
 * entered character becomes part of selector
 * Activate only if it’s a nested section and it’s a first character of selector
 */
function isTypingBeforeSelector(state: EditorState, pos: number, { current }: CSSContext): boolean {
    if (current?.type === 'selector' && current.range.from === pos - 1) {
        // Typing abbreviation before selector is tricky one:
        // ensure it’s on its own line
        const line = state.doc.lineAt(current.range.from);
        return line.text.trim().length === 1;
    }

    return false;
}

function isValidPrefix(prefix: string, syntax: string): boolean {
    if (isJSX(syntax)) {
        return prefix === JSX_PREFIX;
    }

    if (isCSS(syntax)) {
        return prefix === '' || /^[\s>;"\']$/.test(prefix);
    }

    return prefix === '' || /^[\s>;"\']$/.test(prefix);
}

function isValidAbbreviationStart(input: string, syntax: string): boolean {
    if (isJSX(syntax)) {
        return /^[a-zA-Z.#\[\(]$/.test(input);
    }

    if (isCSS(syntax)) {
        return /^[a-zA-Z!@]$/.test(input);
    }

    return /^[a-zA-Z.#!@\[\(]$/.test(input);
}

/**
 * Creates abbreviation tracker for given range in editor. Parses contents
 * of abbreviation in range and returns either valid abbreviation tracker,
 * error tracker or `null` if abbreviation cannot be created from given range
 */
function createTracker(state: EditorState, range: RangeObject, params: StartTrackingParams): AbbreviationTracker | null {
    if (range.from > range.to) {
        // Invalid range
        return null;
    }

    let abbreviation = substr(state, range);
    const { config, forced } = params;
    if (params.offset) {
        abbreviation = abbreviation.slice(params.offset);
    }

    // Basic validation: do not allow empty abbreviations
    // or newlines in abbreviations
    if ((!abbreviation && !forced) || hasInvalidChars(abbreviation)) {
        return null;
    }

    const base: AbbreviationTrackerBase = {
        abbreviation,
        range,
        config,
        forced: !!forced,
        offset: params.offset || 0,
    }

    try {
        let parsedAbbr: MarkupAbbreviation | StylesheetAbbreviation | undefined;
        let simple = false;

        if (config.type === 'stylesheet') {
            parsedAbbr = stylesheetAbbreviation(abbreviation);
        } else {
            parsedAbbr = markupAbbreviation(abbreviation, {
                jsx: config.syntax === 'jsx'
            });
            simple = isSimpleMarkupAbbreviation(parsedAbbr);
        }

        const previewConfig = createPreviewConfig(config);
        return {
            ...base,
            type: 'abbreviation',
            simple,
            preview: expand(parsedAbbr as unknown as string, previewConfig),
        };
    } catch (error) {
        return base.forced ? {
            ...base,
            type: 'error',
            error: error as AbbreviationError,
        } : null;
    }
}

function hasInvalidChars(abbreviation: string): boolean {
    return /[\r\n]/.test(abbreviation);
}

/**
 * Check if given parsed markup abbreviation is simple.A simple abbreviation
 * may not be displayed to user as preview to reduce distraction
 */
function isSimpleMarkupAbbreviation(abbr: MarkupAbbreviation): boolean {
    if (abbr.children.length === 1 && !abbr.children[0].children.length) {
        // Single element: might be a HTML element or text snippet
        const first = abbr.children[0];
        // XXX silly check for common snippets like `!`. Should read contents
        // of expanded abbreviation instead
        return !first.name || /^[a-z]/i.test(first.name);
    }
    return !abbr.children.length;
}

function createPreviewConfig(config: UserConfig) {
    return {
        ...config,
        options: {
            ...config.options,
            'output.field': previewField,
            'output.indent': '  ',
            'output.baseIndent': ''
        }
    };
}

function previewField(_: number, placeholder: string) {
    return placeholder;
}

function handleUpdate(state: EditorState, tracker: AbbreviationTracker | null, update: Transaction): AbbreviationTracker | null {
    if (!tracker) {
        if (hasSnippet(state)) {
            return null;
        }

        // Start abbreviation tracking
        update.changes.iterChanges((_fromA, _toA, fromB, _toB, text) => {
            if (text.length) {
                tracker = typingAbbreviation(state, fromB, text.toString());
            }
        });
    } else {
        // Continue abbreviation tracking
        update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
            if (!tracker) {
                return;
            }

            const { range } = tracker;
            if (!contains(range, fromA)) {
                // Update is outside of abbreviation, reset
                tracker = null;
            } else if (contains(range, fromB)) {
                const removed = toA - fromA;
                const inserted = toB - fromA;
                const to = range.to + inserted - removed;
                if (to <= range.from || hasInvalidChars(text.toString())) {
                    tracker = null;
                } else {
                    tracker = createTracker(state, { from: range.from, to }, {
                        config: tracker.config,
                        forced: tracker.forced
                    });
                }
            }
        });
    }

    return tracker;
}

function getSyntaxFromPos(state: EditorState, pos: number): string {
    if (cssLanguage.isActiveAt(state, pos)) {
        return 'css';
    }

    if (htmlLanguage.isActiveAt(state, pos)) {
        return 'html';
    }

    return '';
}

function canStartStarting(prefix: string, input: string, syntax: string) {
    return isValidPrefix(prefix, syntax) && isValidAbbreviationStart(input, syntax);
}

/**
 * It’s a VERY hacky way to detect if snippet is currently active in given state.
 * Should ask package authors how to properly detect it
 */
function hasSnippet(state: any): boolean {
    if (Array.isArray(state.values)) {
        return state.values.some((item: any) => item && item.constructor?.name === 'ActiveSnippet');
    }

    return false;
}
