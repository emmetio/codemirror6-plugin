import './style.css'

import { EditorState, EditorView, basicSetup } from '@codemirror/basic-setup';
import { html } from '@codemirror/lang-html';
import { keymap } from '@codemirror/view';
import { expandAbbreviation } from './plugin';
import createTracker from './tracker';
import { balanceOutward, balanceInward } from './commands/balance';

const text = `<html style="color: green">
  <!-- this is a comment -->
  <head>
    <title>HTML Example</title>
    <style>
    body {
      padding: 10px;
    }
    .foo, #bar, div:not(:first-of-type) {
        margin: 0;
    }
    </style>
  </head>
  <body>
    <ul>
      <li><a href="">dsfjs dkfj</a></li>
      <li><a href=""></a></li>
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
            underlineTheme,
            keymap.of([{
                key: 'Cmd-e',
                run: expandAbbreviation
            }, {
                key: 'Cmd-Shift-d',
                run: balanceInward
            }]),
        ]
    }),
    parent: document.querySelector<HTMLDivElement>('#app')!
});
