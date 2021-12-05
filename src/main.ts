import './style.css'

import { EditorState, EditorView, basicSetup } from "@codemirror/basic-setup";
import { html } from "@codemirror/lang-html";
import { keymap } from "@codemirror/view";
import { expandAbbreviation } from './plugin';

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
    line 1
    line 2
    line 3
    The indentation tries to be <em style="color: green;">somewhat &amp;quot;do what I mean&amp;quot;</em>...
    but might not match your style.
  </body>
</html>`;

let view = new EditorView({
    state: EditorState.create({
        doc: text,
        extensions: [basicSetup, html(), keymap.of([{
            key: 'Cmd-e',
            run: expandAbbreviation
        }])]
    }),
    parent: document.querySelector<HTMLDivElement>('#app')!
});
