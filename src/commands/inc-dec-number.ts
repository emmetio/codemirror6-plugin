import { EditorSelection } from '@codemirror/state';
import type { StateCommand, TransactionSpec } from '@codemirror/state';
import type { StateCommandTarget } from '../lib/types';

export const incrementNumber1: StateCommand = target => incDecNumber(target, 1);
export const decrementNumber1: StateCommand = target => incDecNumber(target, -1);
export const incrementNumber01: StateCommand = target => incDecNumber(target, .1);
export const decrementNumber01: StateCommand = target => incDecNumber(target, -.1);
export const incrementNumber10: StateCommand = target => incDecNumber(target, 10);
export const decrementNumber10: StateCommand = target => incDecNumber(target, -10);

function incDecNumber({ state, dispatch }: StateCommandTarget, delta: number): boolean {
    const specs: TransactionSpec[] = [];

    for (const sel of state.selection.ranges) {
        let { from, to } = sel;
        if (from === to) {
            // No selection, extract number
            const line = state.doc.lineAt(from);
            const numRange = extractNumber(line.text, from - line.from);
            if (numRange) {
                from = line.from + numRange[0];
                to = line.from + numRange[1];
            }
        }

        if (from !== to) {
            // Try to update value in given region
            let value = updateNumber(state.doc.sliceString(from, to), delta);
            specs.push({
                changes: { from, to, insert: value },
                selection: EditorSelection.range(from, from + value.length)
            });
        } else {
            specs.push({ selection: sel });
        }
    }

    if (specs.some(s => s.changes)) {
        const tr = state.update(...specs);
        dispatch(tr);
        return true;
    }

    return false;
}

/**
 * Extracts number from text at given location
 */
function extractNumber(text: string, pos: number): [number, number] | undefined {
    let hasDot = false;
    let end = pos;
    let start = pos;
    let ch: number;
    const len = text.length;

    // Read ahead for possible numbers
    while (end < len) {
        ch = text.charCodeAt(end);
        if (isDot(ch)) {
            if (hasDot) {
                break;
            }
            hasDot = true;
        } else if (!isNumber(ch)) {
            break;
        }
        end++;
    }

    // Read backward for possible numerics
    while (start >= 0) {
        ch = text.charCodeAt(start - 1);
        if (isDot(ch)) {
            if (hasDot) {
                break;
            }
            hasDot = true;
        } else if (!isNumber(ch)) {
            break;
        }
        start--;
    }

    // Negative number?
    if (start > 0 && text[start - 1] === '-') {
        start--;
    }

    if (start !== end) {
        return [start, end];
    }

    return;
}

function updateNumber(num: string, delta: number, precision = 3): string {
    const value = parseFloat(num) + delta;

    if (isNaN(value)) {
        return num;
    }

    const neg = value < 0;
    let result = Math.abs(value).toFixed(precision);

    // Trim trailing zeroes and optionally decimal number
    result = result.replace(/\.?0+$/, '');

    // Trim leading zero if input value doesn't have it
    if ((num[0] === '.' || num.startsWith('-.')) && result[0] === '0') {
        result = result.slice(1);
    }

    return (neg ? '-' : '') + result;
}

function isDot(ch: number) {
    return ch === 46;
}

/**
 * Check if given code is a number
 */
export function isNumber(code: number): boolean {
    return code > 47 && code < 58;
}
