# Emmet extension for CodeMirror 6 editor

[CodeMirror 6](http://codemirror.net/next/) extension that adds [Emmet](https://emmet.io) support to text editor.

> Extension development is sponsored by [Replit](https://replit.com)
---

## How to use

This extension can be installed as a regular npm module:

```
npm i @emmetio/codemirror6-plugin
```

The plugin API follows CodeMirror 6 design: it’s an ES6 module and provides a number of exported [extensions](https://codemirror.net/6/docs/guide/#extending-codemirror) which you should import and add into your `EditorState` instance.

In most cases, this package exports [Emmet actions](https://docs.emmet.io/actions/) as [`StateCommand`](https://codemirror.net/6/docs/ref/#state.StateCommand), which should be used as follows:

```js
import { EditorState, EditorView, basicSetup } from '@codemirror/basic-setup';
import { html } from '@codemirror/lang-html';
import { keymap } from '@codemirror/view';

// Import Expand Abbreviation command
import { expandAbbreviation } from '@emmetio/codemirror6-plugin';

new EditorView({
    state: EditorState.create({
        extensions: [
            basicSetup,
            html(),

            // Bind Expand Abbreviation command to keyboard shortcut
            keymap.of([{
                key: 'Cmd-e',
                run: expandAbbreviation
            }]),
        ]
    }),
    parent: document.body
});
```

## Expanding abbreviations

Emmet extension can _track abbreviations_ that user enters in some known syntaxes like HTML and CSS. When user enters something that looks like Emmet abbreviation, extension starts abbreviation tracking (adds `emmet-abbreviation` class to a text fragment). WHen abbreviation becomes _complex_ (expands to more that one element), it displays abbreviation preview:

![Emmet abbreviation example](./example/emmet-expand.gif)

To enable abbreviation tracker, you should import `abbreviationTracker` function and add its result to editor extensions:

```js
import { EditorState, EditorView, basicSetup } from '@codemirror/basic-setup';
import { html } from '@codemirror/lang-html';
import { abbreviationTracker } from '@emmetio/codemirror6-plugin';

new EditorView({
    state: EditorState.create({
        extensions: [
            basicSetup,
            html(),
            abbreviationTracker()
        ]
    }),
    parent: document.body
});
```

Abbreviation tracker is _context-aware_: it detect current syntax context and works only where abbreviation expected. For example, in HTML syntax it works in plain text context only and doesn’t work, for example, in attribute value or tag name.

To expand tracked abbreviation, hit <kbd>Tab</kbd> key while caret is inside abbreviation, or hit <kbd>Esc</kbd> key to reset tracker.

### Abbreviation mode

In case if abbreviation tracking is unavailable or you want to give user an opportunity to enter and expand abbreviation with interactive preview, a special _abbreviation mode_ is available. Run `enterAbbreviationMode` command to enter this mode: everything user types will be tracked as abbreviation with preview and validation. To expand tracked abbreviation, hit <kbd>Tab</kbd> key while caret is inside abbreviation, or hit <kbd>Esc</kbd> key to reset tracker.

### Notes on document syntax

Currently, CodeMirror API doesn’t provide viable option to get document syntax to allow plugins to understand how to work with document. So you have to specify document syntax manually in Emmet plugin. You can do so via `emmetConfig` facet or as an option to `abbreviationTracker`:

```js
import { EditorState, EditorView, basicSetup } from '@codemirror/basic-setup';
import { html } from '@codemirror/lang-html';
import { keymap } from '@codemirror/view';

import { emmetConfig, abbreviationTracker } from '@emmetio/codemirror6-plugin';

const editor1 = new EditorView({
    state: EditorState.create({
        extensions: [
            basicSetup,
            html(),
            // Option 1: specify document syntax as config facet
            emmetConfig.of({
                syntax: 'css'
            }),
            // Option 2: pass syntax as config value of abbreviation tracker
            abbreviationTracker({
                syntax: 'jsx'
            })
            ...
        ]
    }),
    parent: document.body
});
```

Note that syntax is most important option Emmet: it controls how abbreviation is parsed in document (wether it’s markup, stylesheet or JSX syntax) and style of generated output (HTML or XML style, CSS or SASS dialect and so on).

Some common syntaxes:
* `html`, `xml`: HTML or XML document; in `html` also tries to detect inline CSS fragments.
* `jsx` for JSX syntax. By default, requires abbreviation to start with `<` in order to skip false-positive abbreviation capturing for variables and functions, also modifies output to match JSX specs (e.g. rename `class` attribute to `className` etc.)
* `css`, `scss`, `sass`, `stylus`: various options of stylesheet abbreviations and output.
* `haml`, `jade`, `pug`, `slim`: supported markup preprocessors.

Default syntax is `html`.

## Available commands

The following commands are available in current package:

* `expandAbbreviation` – expand abbreviation left to current caret position. Unlike abbreviation tracker, this command works anywhere and doesn’t respect current context.
* `enterAbbreviationMode` – enters [abbreviation mode](#abbreviation_mode).
* `wrapWithAbbreviation` — [Wrap with Abbreviation](https://docs.emmet.io/actions/wrap-with-abbreviation/). Note that this is not a StateCommand but a function that you should call and pass returned result as extension. You can optionally pass keyboard shortcut as argument (<kbd>Ctrl-w</kbd> by default).
* `balanceOutward`/`balanceInward` — [Balance](https://docs.emmet.io/actions/match-pair/).
* `toggleComment` — [Toggle Comment](https://docs.emmet.io/actions/toggle-comment/)
* `evaluateMath` — [Evaluate Math Expression](https://docs.emmet.io/actions/evaluate-math/)
* `goToNextEditPoint`/`goToPreviousEditPoint` — [Go to Edit Point](https://docs.emmet.io/actions/go-to-edit-point/)
* `goToTagPair` — [Go to Matching Pair](https://docs.emmet.io/actions/go-to-pair/)
* `incrementNumberN`/`decrementNumberN` — [Increment/Decrement Number](https://docs.emmet.io/actions/inc-dec-number/) where `N` is `1`, `01` or `10`.
* `removeTag` — [Remove Tag](https://docs.emmet.io/actions/remove-tag/)
* `splitJoinTag` — [Split/Join Tag](https://docs.emmet.io/actions/split-join-tag/)
* `selectNextItem`/`selectPreviousItem` — [Select Item](https://docs.emmet.io/actions/select-item/)

