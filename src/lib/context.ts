import { syntaxTree } from '@codemirror/language';
import { cssLanguage } from '@codemirror/lang-css';
import { htmlLanguage } from '@codemirror/lang-html';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { CSSContext, CSSMatch, HTMLAncestor, HTMLContext, HTMLType, RangeObject } from './types';
import { contains, getAttributeValueRange, substr } from './utils';

// TODO use RangeObject instead of TextRange

interface InlineProp {
    name: RangeObject;
    value?: RangeObject;
}

const nodeToHTMLType: Record<string, HTMLType> = {
    OpenTag: 'open',
    CloseTag: 'close',
    SelfClosingTag: 'selfClose'
};

export function getContext(state: EditorState, pos: number): HTMLContext | CSSContext | undefined {
    if (cssLanguage.isActiveAt(state, pos)) {
        return getCSSContext(state, pos);
    }

    if (htmlLanguage.isActiveAt(state, pos)) {
        return getHTMLContext(state, pos);
    }

    // const topLang = state.facet(language);
    // if (topLang === htmlLanguage) {
    //     // HTML syntax may embed CSS
    //     return cssLanguage.isActiveAt(state, pos)
    //         ? getCSSContext(state, pos)
    //         : getHTMLContext(state, pos);
    // }

    // if (topLang === cssLanguage) {
    //     return getCSSContext(state, pos);
    // }

    return;
}

/**
 * Returns CSS context for given location in source code
 */
export function getCSSContext(state: EditorState, pos: number, embedded?: RangeObject) {
    const result: CSSContext = {
        type: 'css',
        ancestors: [],
        current: null,
        inline: false,
        embedded
    };

    const tree = syntaxTree(state).resolveInner(pos, -1);
    const stack: CSSMatch[] = [];

    for (let node: SyntaxNode | null = tree; node; node = node.parent) {
        if (node.name === 'RuleSet') {
            const sel = getSelectorRange(node);
            stack.push({
                name: substr(state, sel),
                type: 'selector',
                range: node
            });
        } else if (node.name === 'Declaration') {
            const { name, value } = getPropertyRanges(node);
            if (value && contains(value, pos)) {
                // Direct hit on CSS value
                stack.push({
                    name: substr(state, value),
                    type: 'propertyValue',
                    range: value
                });
            }

            if (name) {
                stack.push({
                    name: substr(state, name),
                    type: 'propertyName',
                    range: name
                });
            }
        }
    }

    const tip = stack.shift();

    // Check if stack tip contains current position: make it current
    // context item if so
    if (tip) {
        const range: RangeObject = tip.type === 'selector'
            ? { from: tip.range.from, to: tip.range.from + tip.name.length }
            : tip.range;
        if (contains(range, pos)) {
            result.current = tip;
            tip.range = range;
        } else {
            stack.unshift(tip);
        }
    }

    result.ancestors = stack.reverse()
    return result;
}

export function getHTMLContext(state: EditorState, pos: number): HTMLContext {
    const result: HTMLContext = {
        type: 'html',
        ancestors: [],
        current: null,
    };

    const tree = syntaxTree(state).resolveInner(pos);

    for (let node: SyntaxNode | null = tree; node; node = node ? node.parent : null) {
        if (node.name in nodeToHTMLType) {
            const m = getContextMatchFromTag(state, node);
            if (m) {
                result.current = {
                    ...m,
                    type: nodeToHTMLType[node.name]
                };

                // Skip `Element` parent from ancestors stack
                node = node.parent;
            }
        } else if (node.name === 'Element') {
            const child = node.getChild('OpenTag');
            if (child) {
                const m = getContextMatchFromTag(state, child);
                if (m) {
                    result.ancestors.push(m);
                }
            }
        }
    }

    result.ancestors.reverse();
    detectCSSContextFromHTML(state, pos, result);
    return result;
}

function detectCSSContextFromHTML(state: EditorState, pos: number, ctx: HTMLContext) {
    if (ctx.current?.type === 'open') {
        // Maybe inline CSS? E.g. style="..." attribute
        let node: SyntaxNode | null = syntaxTree(state).resolve(ctx.current.range.from, 1);
        while (node && node.name !== 'OpenTag') {
            node = node.parent;
        }

        if (node) {
            for (const attr of node.getChildren('Attribute')) {
                if (attr.from > pos) {
                    break;
                }

                if (contains(attr, pos) && getAttributeName(state, attr) === 'style') {
                    const attrValue = attr.getChild('AttributeValue');
                    if (attrValue) {
                        const cleanValueRange = getAttributeValueRange(state, attrValue);
                        if (contains(cleanValueRange, pos)) {
                            ctx.css = getInlineCSSContext(substr(state, cleanValueRange), pos - cleanValueRange.from, cleanValueRange.from);
                        }
                    }
                }
            }
        }
    }
}

function getContextMatchFromTag(state: EditorState, node: SyntaxNode): HTMLAncestor | void {
    const tagName = node.getChild('TagName');
    if (tagName) {
        return {
            name: substr(state, tagName).toLowerCase(),
            range: node
        };
    }
}

/**
 * Returns range of CSS selector from given rule block
 */
export function getSelectorRange(node: SyntaxNode): RangeObject {
    let from = node.from;
    let to = from;
    for (let child = node.firstChild; child && child.name !== 'Block'; child = child.nextSibling) {
        to = child.to;
    }

    return { from, to };
}

/**
 * Returns CSS property name and value ranges.
 * @param node The `name: Declaration` node
 */
export function getPropertyRanges(node: SyntaxNode): { name: RangeObject | undefined, value: RangeObject | undefined } {
    let name: RangeObject | undefined;
    let value: RangeObject | undefined;
    let ptr = node.firstChild;
    if (ptr?.name === 'PropertyName') {
        name = ptr;
        ptr = ptr.nextSibling;
        if (ptr?.name === ':') {
            ptr = ptr.nextSibling;
        }

        if (ptr) {
            value = {
                from: ptr.from,
                to: node.lastChild!.to
            };
        }
    }

    return { name, value };
}

function getAttributeName(state: EditorState, node: SyntaxNode): string {
    const name = node.getChild('AttributeName');
    return name ? substr(state, name).toLowerCase() : '';
}

/**
 * Returns context for inline CSS
 */
export function getInlineCSSContext(code: string, pos: number, base = 0): CSSContext {
    // Currently, CodeMirror doesn’t provide syntax highlighting so we’ll perform
    // quick and naive persing of CSS properties
    const result: CSSContext = {
        type: 'css',
        ancestors: [],
        current: null,
        inline: true,
        embedded: {
            from: pos + base,
            to: pos + base + code.length
        }
    };

    const props = parseInlineProps(code, pos);

    for (const prop of props) {
        if (prop.value && contains(prop.value, pos)) {
            result.current = {
                name: code.substring(prop.value.from, prop.value.to).trim(),
                type: 'propertyValue',
                range: {
                    from: base + prop.value.from,
                    to: base + prop.value.to
                }
            };
            result.ancestors.push({
                name: code.substring(prop.name.from, prop.name.to).trim(),
                type: 'propertyName',
                range: {
                    from: base + prop.name.from,
                    to: base + prop.value.to
                }
            });
            break;
        } else if (contains(prop.name, pos)) {
            const end = prop.value ? prop.value.to : prop.name.to;
            result.current = {
                name: code.substring(prop.name.from, prop.name.to).trim(),
                type: 'propertyName',
                range: {
                    from: base + prop.name.from,
                    to: base + end
                }
            };
            break;
        }
    }

    return result;
}

export function parseInlineProps(code: string, limit = code.length): InlineProp[] {
    const space = ' \t\n\r';
    const propList: InlineProp[] = [];
    let prop: InlineProp | undefined;

    for (let i = 0; i < code.length; i++) {
        const ch = code[i];
        if (prop) {
            if (prop.value) {
                if (prop.value.from !== -1) {
                    prop.value.to = i;
                }
            } else {
                prop.name.to = i;
            }
        }

        if (ch === ';') {
            prop = undefined;
            if (i > limit) {
                break;
            }
        } else if (ch === ':') {
            if (prop && !prop.value) {
                prop.value = { from: -1, to: -1 };
            }
        } else {
            if (prop) {
                if (prop.value?.from === -1 && !space.includes(ch)) {
                    prop.value.from = prop.value.to = i;
                }
            } else if (!space.includes(ch)) {
                prop = {
                    name: { from: i, to: i }
                };
                propList.push(prop);
            }
        }
    }

    // Finalize state for trailing character
    if (prop) {
        if (prop.value) {
            prop.value.to++;
        } else {
            prop.name.to++;
        }
    }

    return propList;
}
