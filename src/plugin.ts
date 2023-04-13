export { default as abbreviationTracker } from './tracker';

/*
Emmet commands that should be used as standard CodeMirror commands.
For example:

```js
import { keymap } from '@codemirror/view';
import { html } from '@codemirror/lang-html';
import { EditorState, EditorView, basicSetup } from '@codemirror/basic-setup';
import { balanceOutward } from '@emmetio/codemirror6-plugin';

new EditorView({
    state: EditorState.create({
        extensions: [
            basicSetup,
            html(),
            keymap.of([{
                key: 'Cmd-Shift-d',
                run: balanceOutward
            }]),
        ]
    }),
    parent: document.body
})
```
*/
export { enterAbbreviationMode, emmetCompletionSource } from './tracker';
export { config as emmetConfig, type EmmetConfig } from './lib/config';
export type { EmmetKnownSyntax } from './lib/types';
export { expandAbbreviation } from './commands/expand';
export { balanceOutward, balanceInward } from './commands/balance';
export { toggleComment } from './commands/comment';
export { evaluateMath } from './commands/evaluate-math';
export { goToNextEditPoint, goToPreviousEditPoint } from './commands/go-to-edit-point';
export { goToTagPair } from './commands/go-to-tag-pair';
export {
    incrementNumber1, decrementNumber1,
    incrementNumber01, decrementNumber01,
    incrementNumber10, decrementNumber10
} from './commands/inc-dec-number';
export { removeTag } from './commands/remove-tag';
export { selectNextItem, selectPreviousItem } from './commands/select-item';
export { splitJoinTag } from './commands/split-join-tag';
export { wrapWithAbbreviation } from './commands/wrap-with-abbreviation';
