import type { MarkupAbbreviation, StylesheetAbbreviation, UserConfig } from 'emmet';
import { markupAbbreviation } from 'emmet';
import { ViewPlugin, Decoration, keymap, EditorView, showTooltip } from '@codemirror/view';
import type { DecorationSet, Command, Tooltip, ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import type { Range, EditorState, Extension, StateCommand, Transaction } from '@codemirror/state';
import { htmlLanguage } from '@codemirror/lang-html';
import { cssLanguage } from '@codemirror/lang-css';
import { snippet, pickedCompletion, completionStatus } from '@codemirror/autocomplete';
import type { CompletionResult, Completion, CompletionSource } from '@codemirror/autocomplete';
import { getCSSContext, getHTMLContext } from '../lib/context';
import { docSyntax, getMarkupAbbreviationContext, getStylesheetAbbreviationContext, getSyntaxType, isCSS, isHTML, isJSX, isSupported } from '../lib/syntax';
import getOutputOptions from '../lib/output';
import { type CSSContext, type AbbreviationError, type StartTrackingParams, type RangeObject, EmmetKnownSyntax } from '../lib/types';
import { contains, getCaret, rangeEmpty, substr } from '../lib/utils';
import { expand } from '../lib/emmet';
import { type HTMLElementPreview, createPreview } from './AbbreviationPreviewWidget';
import icon from '../completion-icon.svg';
import getEmmetConfig, { config, type EmmetPreviewConfig, type EmmetConfig } from '../lib/config';

interface EmmetCompletion extends Completion {
    tracker: AbbreviationTrackerValid;
    previewConfig: EmmetPreviewConfig;
    preview?: HTMLElementPreview;
}

interface EmmetTooltip extends Tooltip {
    tracker: AbbreviationTracker;
}

type AbbreviationTracker = AbbreviationTrackerValid | AbbreviationTrackerError;

/// CSS property and value keyword completion source.
// Проблема мигающего автокомплита в том, что он становится ActiveSource,
// а не ActiveResult, из-за этого помечется как Pending и не обновляется на первый
// проход.
// Текущая реализация укладывается в нужную концепцию,
// но проверка автокомплита обрабатывается раньше, чем обновляется трэкер.
// Нужно найти способ обновить трэкер раньше, чем отработает код автокомплита
export const emmetCompletionSource: CompletionSource = context => {
    const tracker = context.state.field(trackerField);
    if (tracker?.type === 'abbreviation' && tracker.preview) {
        return {
            from: tracker.range.from,
            to: tracker.range.to,
            filter: false,
            update(current, _from, _to, context) {
                const tracker = context.state.field(trackerField);
                if (!tracker || tracker.type === 'error') {
                    return null;
                }

                return {
                    ...current,
                    from: tracker.range.from,
                    to: tracker.range.to,
                    options: completionOptionsFromTracker(context.state, tracker)
                };
            },
            options: completionOptionsFromTracker(context.state, tracker)
        } as CompletionResult;
    }

    return null;
}

const cssCompletion: Extension = cssLanguage.data.of({ autocomplete: emmetCompletionSource });

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

    /** Indicates that current tracker shouldn’t be displayed in editor */
    inactive: boolean;

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

const trackerMark = Decoration.mark({ class: 'emmet-tracker' });

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
        const hasCompletion = tr.annotation(pickedCompletion);
        if (hasCompletion) {
            // When completion is applied, always reset tracker
            return null;
        }

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

const abbreviationPreview = StateField.define<EmmetTooltip | null>({
    create: getAbbreviationPreview,
    update(tooltip, tr) {
        if (!tr.docChanged && !tr.selection) {
            const tracker = tr.state.field(trackerField);
            return tracker ? tooltip : null;
        }
        return getAbbreviationPreview(tr.state, tooltip);
    },
    provide: f => showTooltip.from(f)
});

function getAbbreviationPreview(state: EditorState, prevTooltip?: EmmetTooltip | null): EmmetTooltip | null {
    const tracker = state.field(trackerField);

    if (tracker && !tracker.inactive && completionStatus(state) !== 'active') {
        if (tracker.config.type === 'stylesheet') {
            // Do not display preview for CSS since completions are populated
            // automatically for this syntax and abbreviation will be a part of
            // completion list
            return null;
        }

        if (prevTooltip && prevTooltip.tracker.type !== tracker.type) {
            prevTooltip = null;
        }

        const { range } = tracker;

        if (canDisplayPreview(state, tracker)) {
            return prevTooltip || {
                pos: range.from,
                above: false,
                arrow: false,
                tracker,
                create() {
                    const previewConfig = state.facet(config).preview;
                    let preview = '';
                    let syntax = '';

                    if (tracker.type === 'error') {
                        preview = tracker.error.message;
                        syntax = 'error';
                    } else {
                        preview = tracker.preview;
                        syntax = tracker.config.syntax || EmmetKnownSyntax.html;
                    }

                    const dom = createPreview(preview, syntax, previewConfig);
                    return {
                        dom,
                        update({ state }) {
                            const tracker = state.field(trackerField);
                            if (tracker && dom.update) {
                                const value = tracker.type === 'error'
                                    ? tracker.error.message
                                    : tracker.preview;
                                dom.update(value);
                            }
                        }
                    }
                }
            }
        }
    }

    return null;
}

const abbreviationTracker = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor() {
        this.decorations = Decoration.none;
    }

    update(update: ViewUpdate) {
        const { state } = update;

        const tracker = state.field(trackerField);
        const decors: Range<Decoration>[] = [];

        if (tracker && !tracker.inactive) {
            const { range } = tracker;

            if (!rangeEmpty(range) ) {
                decors.push(trackerMark.range(range.from, range.to));
            }
            this.decorations = Decoration.set(decors, true);
        } else {
            this.decorations = Decoration.none;
        }
    }
}, {
    decorations: v => v.decorations,
});

export function expandTracker(view: EditorView, tracker: AbbreviationTracker): void {
    const { from, to } = tracker.range;
    const expanded = expand(view.state, tracker.abbreviation, tracker.config);
    const fn = snippet(expanded);

    view.dispatch(view.state.update({
        effects: resetTracker.of(null)
    }));
    fn(view, { label: 'expand' }, from, to);
}

const tabKeyHandler: Command = (view) => {
    const { state } = view;
    if (completionStatus(state)) {
        // Must be handled by `acceptCompletion` command
        return false;
    }

    const tracker = state.field(trackerField, false);
    if (tracker && !tracker.inactive && contains(tracker.range, getCaret(state))) {
        expandTracker(view, tracker);
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
        fontSize: '0.9em'
    },
    '.emmet-preview_error': {
        color: 'red'
    },
    '.cm-completionIcon-emmet::after': {
        content: '" "',
        background: `url("${icon}") center/contain no-repeat`,
        display: 'inline-block',
        width: '11px',
        height: '11px',
        verticalAlign: 'middle'
    }
});

/**
 * A factory function that creates abbreviation tracker for known syntaxes.
 * When user starts typing, it detects whether user writes abbreviation and
 * if so, starts tracking by displaying an underline. Then if user hit Tab key
 * when cursor is inside tracked abbreviation, it will expand it. Or user can
 * press Escape key to reset tracker
 */
export default function tracker(options?: Partial<EmmetConfig>): Extension[] {
    return [
        trackerField,
        abbreviationTracker,
        abbreviationPreview,
        trackerTheme,
        cssCompletion,
        options ? config.of(options) : [],
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
    if (!canStartTyping(prefix, input, getSyntaxFromPos(state, pos))) {
        return null;
    }

    const config = getActivationContext(state, pos);
    if (!config) {
        return null;
    }

    // Additional check for stylesheet abbreviation start: it’s slightly
    // differs from markup prefix, but we need activation context
    // to ensure that context under caret is CSS
    if (config.type === 'stylesheet') {
        if (!canStartTyping(prefix, input, EmmetKnownSyntax.css)) {
            return null;
        }

        // Do not trigger abbreviation tracking inside CSS property value.
        // Allow it for colors only
        const ctxName = config.context?.name;
        if (ctxName && !ctxName.startsWith('@@') && input !== '#') {
            return null;
        }
    }

    const syntax = config.syntax || EmmetKnownSyntax.html;
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
        return getCSSActivationContext(state, pos, EmmetKnownSyntax.css, getCSSContext(state, pos));
    }

    const syntax = docSyntax(state);

    if (isHTML(syntax)) {
        const ctx = getHTMLContext(state, pos);

        if (ctx.css) {
            return getCSSActivationContext(state, pos, EmmetKnownSyntax.css, ctx.css);
        }

        if (!ctx.current) {
            return {
                syntax,
                type: 'markup',
                context: getMarkupAbbreviationContext(state, ctx),
                options: getOutputOptions(state)
            };
        }
    } else {
        return {
            syntax,
            type: getSyntaxType(syntax),
            options: getOutputOptions(state)
        };
    }

    return undefined;
}

function getCSSActivationContext(state: EditorState, pos: number, syntax: EmmetKnownSyntax, ctx: CSSContext): UserConfig | undefined {
    const allowedContext = !ctx.current
        || ctx.current.type === 'propertyName'
        || ctx.current.type === 'propertyValue'
        || isTypingBeforeSelector(state, pos, ctx);

    if (allowedContext) {
        return {
            syntax,
            type: 'stylesheet',
            context: getStylesheetAbbreviationContext(ctx),
            options: getOutputOptions(state, ctx.inline)
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
        return /^[a-zA-Z!@#]$/.test(input);
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
        inactive: false,
        offset: params.offset || 0,
    }

    try {
        let parsedAbbr: MarkupAbbreviation | StylesheetAbbreviation | undefined;
        let simple = false;

        if (config.type === 'markup') {
            parsedAbbr = markupAbbreviation(abbreviation, {
                jsx: config.syntax === 'jsx'
            });
            simple = isSimpleMarkupAbbreviation(parsedAbbr);
        }

        const previewConfig = createPreviewConfig(config);
        const preview = expand(state, parsedAbbr || abbreviation, previewConfig);
        if (!preview) {
            // Handle edge case: abbreviation didn’t return any result for preview.
            // Most likely it means a CSS context where given abbreviation is not applicable
            return null;
        }

        return {
            ...base,
            type: 'abbreviation',
            simple,
            preview,
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
    if (hasSnippet(state)) {
        return null;
    }

    if (!tracker || tracker.inactive) {
        // Start abbreviation tracking
        update.changes.iterChanges((_fromA, _toA, fromB, _toB, text) => {
            if (text.length) {
                tracker = typingAbbreviation(state, fromB, text.toString()) || tracker;
            }
        });

        if (!tracker || !tracker.inactive) {
            return tracker;
        }
    }

    // Continue abbreviation tracking
    update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
        if (!tracker) {
            return;
        }

        const { range } = tracker;
        if (!contains(range, fromA)) {
            // Update is outside of abbreviation, reset it only if it’s not inactive
            if (!tracker.inactive) {
                tracker = null;
            }
        } else if (contains(range, fromB)) {
            const removed = toA - fromA;
            const inserted = toB - fromA;
            const to = range.to + inserted - removed;
            if (to <= range.from || hasInvalidChars(text.toString())) {
                tracker = null;
            } else {
                const abbrRange = tracker.inactive ? range : { from: range.from, to };
                const nextTracker = createTracker(state, abbrRange, {
                    config: tracker.config,
                    forced: tracker.forced
                });

                if (!nextTracker) {
                    // Next tracker is empty mostly due to invalid abbreviation.
                    // To allow users to fix error, keep previous tracker
                    // instance as inactive
                    tracker = { ...tracker, inactive: true };
                } else {
                    tracker = nextTracker;
                }
            }
        }
    });

    return tracker;
}

function getSyntaxFromPos(state: EditorState, pos: number): EmmetKnownSyntax {
    if (cssLanguage.isActiveAt(state, pos)) {
        return EmmetKnownSyntax.css;
    }

    if (htmlLanguage.isActiveAt(state, pos)) {
        return EmmetKnownSyntax.html;
    }

    return '' as EmmetKnownSyntax;
}

function canStartTyping(prefix: string, input: string, syntax: EmmetKnownSyntax) {
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

export function canDisplayPreview(state: EditorState, tracker: AbbreviationTracker): boolean {
    if (completionStatus(state) === 'active') {
        return false;
    }

    const config = getEmmetConfig(state);
    if (!config.previewEnabled) {
        return false;
    }

    if (Array.isArray(config.previewEnabled)) {
        const { type, syntax } = tracker.config;
        if (!config.previewEnabled.includes(type!) && !config.previewEnabled.includes(syntax!)) {
            return false;
        }
    }

    return tracker.type === 'error' || (!tracker.simple || tracker.forced) && !!tracker.abbreviation && contains(tracker.range, getCaret(state));
}

function completionOptionsFromTracker(state: EditorState, tracker: AbbreviationTrackerValid, prev?: EmmetCompletion): EmmetCompletion[] {
    const opt = state.facet(config);
    return [{
        label: 'Emmet abbreviation',
        type: 'emmet',
        boost: opt.completionBoost,
        tracker,
        previewConfig: opt.preview,
        preview: prev?.preview,
        info: completionInfo,
        apply: (view, completion) => {
            view.dispatch({
                annotations: pickedCompletion.of(completion)
            });
            expandTracker(view, tracker);
        }
    }];
}

function completionInfo(completion: Completion): Node {
    let { tracker, previewConfig, preview } = completion as EmmetCompletion;
    if (preview?.update) {
        preview.update(tracker.preview);
    } else {
        (completion as EmmetCompletion).preview = preview = createPreview(tracker.preview, tracker.config.syntax || EmmetKnownSyntax.html, previewConfig);
    }

    return preview;
}
