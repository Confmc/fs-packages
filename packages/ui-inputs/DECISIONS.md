# ui-inputs — decisions

Why this package is shaped the way it is. Every entry names a cost it accepts or
a limitation it lives with, so the argument sits here rather than in a comment
nobody dates.

## D1 — Select typeahead scans the whole option list; there is no large-list budget

_2026-10-05, #285. Crit finding on head `dc7cf20` ("Select typeahead folds and
scans unbounded option lists on the browser main thread"); follow-up row WR-2035._

The typeahead in SingleSelect, MultiSelect and GroupSelect folds every option
label once per change of the options (`foldedLabels`, a computed in
`useListbox`), and each printable key runs a prefix search over the folded
labels. Both are O(n) in the number of options, and both run on the main thread.

**Why this is accepted.**

- **The scan is the matching.** A prefix search has to look at the labels to
  find one.
- **Each key folds nothing.** Labels are folded once per options change, not on
  every key, so a held key that matches nothing costs one scan per key.
- **It adds no new cost class to these controls.** Every options change already
  maps every label (`optionLabels`) and, with `alphabeticalSort` on, sorts the
  options with `localeCompare`. Opening the list renders every row; there is no
  virtualization. One extra O(n) fold per options change sits under that work.

**What is not decided.** No supported ceiling on the number of options exists,
and none of the three costs has been measured at large n. WR-2035 asks for that
measurement first. Typeahead is the smallest of the three, so it is the wrong
place to start.

## D2 — AltGr and macOS Option characters do not start typeahead

_2026-10-05, #285. Crit finding `30ba9376644d`; follow-up row WR-2031._

`isTypeahead` refuses any keydown that carries `ctrlKey` or `altKey`, so that
command chords such as Ctrl+A or Alt+F never type. A character printed with
AltGr (which Windows reports as Ctrl+Alt) or with macOS Option carries the same
flags, so a label starting with such a character cannot be reached by typing it.

**Why it is not fixed here.** In the browser test lane (Chromium 153 via
Playwright), a real AltGr press reports `getModifierState('AltGraph')` as
`false`; only a synthetic event reports `true`. So an AltGr branch could only be
proven against synthetic events. On macOS, Option plus a key looks the same as
Alt plus a letter elsewhere; telling them apart needs layout or platform
detection. WR-2031 measures what native `<select>` does on each platform first.
