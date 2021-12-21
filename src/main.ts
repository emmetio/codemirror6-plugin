import './style.css'

import { EditorState, EditorView, basicSetup } from '@codemirror/basic-setup';
import { html } from '@codemirror/lang-html';
import { keymap } from '@codemirror/view';
import { expandAbbreviation } from './plugin';
import createTracker, { enterAbbreviationMode } from './tracker';
import { balanceOutward, balanceInward } from './commands/balance';
import { toggleComment } from './commands/comment';
import { evaluateMath } from './commands/evaluate-math';
import { goToNextEditPoint, goToPreviousEditPoint } from './commands/go-to-edit-point';
import { goToTagPair } from './commands/go-to-tag-pair';
import { incrementNumber1, decrementNumber1 } from './commands/inc-dec-number';
import { removeTag } from './commands/remove-tag';
import { selectNextItem, selectPreviousItem } from './commands/select-item';
import { splitJoinTag } from './commands/split-join-tag';
import { wrapWithAbbreviation } from './commands/wrap-with-abbreviation';

const text = `<html style="color: green">
  <!-- this is a comment -->
  <head>
    <title>HTML Example</title>
    <style>
    body {
      padding: 10px;
      position: absolute;
    }
    .foo, #bar, div:not(:first-of-type) {
        margin: 0;
        /* border-top: 10px solid black; */
    }
    </style>
  </head>
  <body>
    <ul>
      <li><a href="">dsfjs dkfj</a></li>
      <!-- <li><a href=""></a></li> -->
      <li><a href=""></a></li>
      <li><a href=""></a></li>
    </ul>
    line 1
    line 2
    line 3
    The indentation tries to be <em style="color: green;">somewhat &amp;quot;do what I mean&amp;quot;</em>...
    but might not match your style.
  </body>
</html>`;

const underlineTheme = EditorView.baseTheme({
    '.cm-underline': {
        textDecoration: 'underline 1px green',
    }
});

let view = new EditorView({
    state: EditorState.create({
        doc: text,
        extensions: [
            basicSetup,
            html(),
            createTracker(),
            wrapWithAbbreviation(),
            underlineTheme,
            keymap.of([{
                key: 'Cmd-e',
                run: expandAbbreviation
            },{
                key: 'Cmd-Shift-e',
                run: enterAbbreviationMode
            }, {
                key: 'Cmd-Shift-d',
                run: balanceOutward
            }, {
                key: 'Ctrl-/',
                run: toggleComment
            }, {
                key: 'Ctrl-y',
                run: evaluateMath
            }, {
                key: 'Ctrl-Alt-ArrowLeft',
                run: goToPreviousEditPoint
            }, {
                key: 'Ctrl-Alt-ArrowRight',
                run: goToNextEditPoint
            }, {
                key: 'Ctrl-g',
                run: goToTagPair
            }, {
                key: 'Ctrl-Alt-ArrowUp',
                run: incrementNumber1
            }, {
                key: 'Ctrl-Alt-ArrowDown',
                run: decrementNumber1
            }, {
                key: 'Ctrl-\'',
                run: removeTag
            }, {
                key: 'Ctrl-Shift-\'',
                run: splitJoinTag
            }, {
                key: 'Ctrl-.',
                run: selectNextItem
            }, {
                key: 'Ctrl-,',
                run: selectPreviousItem
            }]),
        ]
    }),
    parent: document.querySelector<HTMLDivElement>('#app')!
});
