// Browser-mode INTERACTION spec (real Chromium, real CDP events) — scope: contract +
// interaction only; unit behaviour stays in the happy-dom suite; never duplicate a
// happy-dom spec here.
//
// What only a real browser can prove: disabled controls GENUINELY receive no events (VTU
// `trigger()` dispatches synthetically and would run handlers a real browser suppresses —
// the documented vacuous-assertion trap), Tab order is real, and keyboard walks ride the
// full CDP input pipeline.
import {afterEach, describe, expect, it} from 'vitest';
import {render} from 'vitest-browser-vue';
import {userEvent} from 'vitest/browser';
import {defineComponent, h, ref} from 'vue';

import Pressable from '../../src/components/Pressable.vue';
import '../../styles.css';

/** Mount a Pressable with a spy click handler; returns the recorded activation count. */
const renderPressable = async (props: Record<string, unknown>) => {
    const clicks = ref(0);
    const pressed = ref<boolean | undefined>(props.pressed as boolean | undefined);
    await render(
        defineComponent(
            () => () =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                h(Pressable as any, {
                    label: 'Show example',
                    ...props,
                    ...(pressed.value === undefined ? {} : {pressed: pressed.value}),
                    onClick: () => {
                        clicks.value += 1;
                    },
                    'onUpdate:pressed': (value: boolean) => {
                        pressed.value = value;
                    },
                }),
        ),
    );
    return {clicks, pressed};
};

const control = () => document.querySelector('.ui-pressable') as HTMLElement;

describe('Pressable — real keyboard walk', () => {
    it('Tab focuses the native button, and BOTH Enter and Space activate it', async () => {
        const {clicks} = await renderPressable({});

        await userEvent.tab();
        expect(document.activeElement).toBe(control()); // focusable with no author tabindex

        await userEvent.keyboard('{Enter}');
        expect(clicks.value).toBe(1);

        await userEvent.keyboard(' ');
        expect(clicks.value).toBe(2);
        // Exactly one activation per key: the component adds no key handling of its own on the
        // native path, so nothing double-fires.
    });

    it('toggle mode flips aria-pressed from the keyboard', async () => {
        const {pressed} = await renderPressable({pressed: false});
        expect(control().getAttribute('aria-pressed')).toBe('false');

        await userEvent.tab();
        await userEvent.keyboard('{Enter}');
        expect(pressed.value).toBe(true);
        await expect.poll(() => control().getAttribute('aria-pressed')).toBe('true');

        await userEvent.keyboard(' ');
        expect(pressed.value).toBe(false);
    });

    it('a plain Pressable carries NO aria-pressed — it is an action, not a toggle', async () => {
        await renderPressable({});
        expect(control().hasAttribute('aria-pressed')).toBe(false);
    });

    it('real Tab skips a disabled Pressable, and a forced real click activates nothing', async () => {
        const {clicks} = await renderPressable({disabled: true});
        expect(control().matches(':disabled')).toBe(true);

        await userEvent.tab();
        expect(document.activeElement).not.toBe(control());
        await userEvent.keyboard('{Enter} ');

        // {force: true} skips the actionability wait but still rides the real input pipeline —
        // Chromium suppresses click on a disabled control.
        await userEvent.click(control(), {force: true});
        expect(clicks.value).toBe(0);
    });

    it('the `as` fallback is reachable and activatable by the SAME keys as the native button', async () => {
        const {clicks} = await renderPressable({as: 'div'});
        expect(control().tagName).toBe('DIV');

        await userEvent.tab();
        expect(document.activeElement).toBe(control()); // tabindex="0" put it in the tab order

        await userEvent.keyboard('{Enter}');
        expect(clicks.value).toBe(1);

        // Space activates on keyUP, exactly as a native button does — and only once.
        await userEvent.keyboard(' ');
        expect(clicks.value).toBe(2);
    });

    it('real Tab skips a disabled `as` fallback', async () => {
        const {clicks} = await renderPressable({as: 'div', disabled: true});

        await userEvent.tab();
        expect(document.activeElement).not.toBe(control());
        await userEvent.keyboard('{Enter} ');
        expect(clicks.value).toBe(0);
    });
});

/**
 * A fallback nested in an ancestor that has its own @click — the shape a clickable row or card
 * actually has in a consuming app, and the only shape in which the hit-testing defect is visible.
 */
const renderNestedFallback = async (props: Record<string, unknown> = {}) => {
    const ancestorClicks = ref(0);
    const controlClicks = ref(0);
    await render(
        defineComponent(
            () => () =>
                h(
                    'div',
                    {
                        style: 'padding: 24px',
                        onClick: () => {
                            ancestorClicks.value += 1;
                        },
                    },
                    [
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                        h(Pressable as any, {
                            label: 'Show example',
                            as: 'div',
                            ...props,
                            onClick: () => {
                                controlClicks.value += 1;
                            },
                        }),
                    ],
                ),
        ),
    );
    return {ancestorClicks, controlClicks};
};

/**
 * The platform consequence of the chassis `type`, and it is browser-only on purpose: implicit form
 * submission is a real navigation the layout engine performs, not something a DOM shim can be
 * trusted to model. A consumer's `type="submit"` used to beat the chassis `type="button"` outright
 * — Vue merges fallthrough attrs onto the root AFTER the template bindings and the fallthrough wins
 * — so a `<Pressable>` inside a form submitted it, which is the one thing the component's own
 * docblock promises it never does.
 */
describe('Pressable — a consumer `type` cannot make it submit a surrounding form', () => {
    const renderInForm = async (children: (submits: {value: number}) => unknown[]) => {
        const submits = ref(0);
        await render(
            defineComponent(
                () => () =>
                    h(
                        'form',
                        {
                            onSubmit: (event: Event) => {
                                event.preventDefault(); // a real submit would navigate the runner away
                                submits.value += 1;
                            },
                        },
                        children(submits),
                    ),
            ),
        );
        return submits;
    };

    it('stays inert as a submitter even when handed type="submit"', async () => {
        const submits = await renderInForm(() => [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
            h(Pressable as any, {label: 'Go', type: 'submit'}),
        ]);

        await userEvent.click(control());

        expect(control().getAttribute('type')).toBe('button');
        expect(submits.value).toBe(0);
    });

    it('POSITIVE CONTROL — a plain <button> in the same fixture DOES submit it', async () => {
        // Both halves of the control. It proves the fixture can submit at all (so the zero above
        // means "withheld", not "no form here"), and it is the platform fact that makes the chassis
        // `type` load-bearing: a button in a form with no type of its own IS a submit button.
        const submits = await renderInForm(() => [h('button', {id: 'native-submit'}, 'Go')]);

        await userEvent.click(document.getElementById('native-submit') as HTMLElement);

        expect(submits.value).toBe(1);
    });
});

/** What a pointer at the element's own centre would actually target. */
const hitAtCentre = (element: Element): Element | null => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
};

describe('Pressable — a real pointer on a disabled `as` fallback', () => {
    it('activates NEITHER the control nor its ancestor — inert, not transparent', async () => {
        const {ancestorClicks, controlClicks} = await renderNestedFallback({disabled: true});

        // The measurement that found the defect. `pointer-events: none` used to take the control
        // out of hit-testing, so this returned the ANCESTOR and a real pointer never touched the
        // control at all — which also meant the component's own disabled guard could never run.
        expect(hitAtCentre(control())).toBe(control());

        // {force: true} skips Playwright's actionability wait (aria-disabled reads as "not
        // enabled") but still rides the real CDP input pipeline, so the browser does its own
        // hit-testing at the point — which is the thing under test.
        await userEvent.click(control(), {force: true});
        expect(controlClicks.value).toBe(0);
        // The harm: an ancestor's handler firing from a click on a control that is disabled.
        expect(ancestorClicks.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same fixture, enabled, reaches both handlers', async () => {
        const {ancestorClicks, controlClicks} = await renderNestedFallback();

        expect(hitAtCentre(control())).toBe(control());

        await userEvent.click(control());
        // Without this, the zeros above would be consistent with a fixture that wires nothing.
        expect(controlClicks.value).toBe(1);
        expect(ancestorClicks.value).toBe(1);
    });
});

/**
 * The shape the nested-key defect actually harms: a clickable row (the `as` fallback) with an
 * inline control inside it. Only a real browser can settle this one — happy-dom performs neither
 * the native Enter-to-click translation on the nested button nor the text insertion on the nested
 * input, so it can prove the event was left alone but not that the field still WORKS.
 */
const renderFallbackWithChildren = async () => {
    const rowClicks = ref(0);
    const childClicks = ref(0);
    await render(
        defineComponent(
            () => () =>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                h(
                    Pressable as any,
                    {
                        as: 'div',
                        label: 'Row',
                        onClick: () => {
                            rowClicks.value += 1;
                        },
                    },
                    {
                        default: () => [
                            h('input', {id: 'nested-filter'}),
                            h('button', {
                                id: 'nested-remove',
                                type: 'button',
                                onClick: () => {
                                    childClicks.value += 1;
                                },
                            }),
                        ],
                    },
                ),
        ),
    );
    return {rowClicks, childClicks};
};

describe('Pressable — a real keyboard inside an `as` fallback', () => {
    const filter = () => document.getElementById('nested-filter') as HTMLInputElement;
    const remove = () => document.getElementById('nested-remove') as HTMLButtonElement;

    it("a nested <input> keeps its SPACEBAR — the row must not translate a child's keys", async () => {
        // The headline harm, end to end through the real CDP input pipeline. Unguarded, every
        // Space keydown reaching the root was preventDefault()ed AND converted into an activation
        // of the row: the field could not hold a space, and the row fired on every attempt.
        const {rowClicks} = await renderFallbackWithChildren();

        // Focus, never click: a real pointer click on the child would bubble to the row's own
        // @click and confound the count with an activation that has nothing to do with keys.
        filter().focus();
        await userEvent.keyboard('a b');

        expect(filter().value).toBe('a b'); // the space actually landed in the field
        expect(rowClicks.value).toBe(0); // …and nothing activated the row
    });

    it('gives Enter on a nested <button> to the BUTTON — and the row then sees exactly what a MOUSE click gives it', async () => {
        // Two halves, and the scope is worth stating precisely. (a) The child's own activation is
        // restored: unguarded, the row preventDefault()ed the Enter, so the button's handler never
        // ran at ALL — measured 0 — and the row activated instead through the row's own synthetic
        // click. This is the half happy-dom structurally cannot show. (b) The row still counting an
        // activation is NOT the same defect and is not this component's to suppress: it is the
        // child's real click BUBBLING, exactly as a mouse click on that button does. A consumer who
        // does not want it writes `@click.stop` on the child. Asserted as an equivalence against
        // the mouse rather than as a bare number, so the two causes cannot be confused.
        const {rowClicks, childClicks} = await renderFallbackWithChildren();

        remove().focus();
        await userEvent.keyboard('{Enter}');
        expect(childClicks.value).toBe(1);
        expect(rowClicks.value).toBe(1); // the bubbled click, not a translated key

        await userEvent.click(remove());
        expect(childClicks.value).toBe(2);
        // One activation apiece, keyboard and pointer alike — the equivalence, stated as two
        // concrete numbers so it cannot hold vacuously at zero.
        expect(rowClicks.value).toBe(2);
    });

    it('POSITIVE CONTROL — the ROW itself still activates on Enter and Space', async () => {
        // Same fixture, same focusable children, focus on the root. Without this the two zeros
        // above are equally consistent with a fallback that has stopped answering the keyboard.
        const {rowClicks} = await renderFallbackWithChildren();

        control().focus();
        expect(document.activeElement).toBe(control());

        await userEvent.keyboard('{Enter}');
        expect(rowClicks.value).toBe(1);

        await userEvent.keyboard(' ');
        expect(rowClicks.value).toBe(2);
    });
});

/**
 * `.ui-pressable` sets `display: inline-flex`, which is right for a button and wrong for the one
 * `as` target the documentation puts first: a clickable `<tr>` stops being a table row and its
 * cells lose their table boxes. Only a real layout engine can settle this — happy-dom computes no
 * used `display` at all, so the happy-dom suite can prove the marker class is applied and nothing
 * about what it does.
 */
describe('Pressable — `as` must not repaint a structural display', () => {
    const renderRows = async () => {
        await render(
            defineComponent(
                () => () =>
                    h('table', [
                        h('tbody', [
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                            h(
                                Pressable as any,
                                {as: 'tr', label: 'Row', id: 'row'},
                                {default: () => [h('td', {id: 'cell'}, 'Cell')]},
                            ),
                        ]),
                    ]),
            ),
        );
        return {
            row: document.getElementById('row') as HTMLElement,
            cell: document.getElementById('cell') as HTMLElement,
        };
    };

    it('leaves as="tr" a table row, and its cells table cells', async () => {
        const {row, cell} = await renderRows();

        expect(row.tagName).toBe('TR');
        // The defect: `inline-flex` here takes the row out of the table's layout algorithm and the
        // cell's own `display: table-cell` is computed against a flex container instead.
        expect(getComputedStyle(row).display).toBe('table-row');
        expect(getComputedStyle(cell).display).toBe('table-cell');
        // …and the chassis is still ON it — this is a display carve-out, not an opt-out.
        expect(getComputedStyle(row).cursor).toBe('pointer');
    });

    it('POSITIVE CONTROL — the ordinary button and as="div" keep the chassis display', async () => {
        await renderPressable({});
        expect(getComputedStyle(control()).display).toBe('inline-flex');
    });

    it('POSITIVE CONTROL — as="div" keeps it too', async () => {
        await renderPressable({as: 'div'});
        expect(getComputedStyle(control()).display).toBe('inline-flex');
    });
});

/**
 * Disabled inertness against the PLATFORM's own behaviour, which is the half no happy-dom spec can
 * see: a real anchor's navigation, a real pointer's hit-testing, and real keys arriving after a
 * real mouse-focus. Each arm carries its enabled positive control in the same fixture — the
 * disabled arms are all zeros, and a zero proves nothing beside a fixture that wires nothing.
 *
 * `dispatchEvent` rather than `userEvent.click` on the arms that assert a stop: Chromium's real
 * input pipeline produces no click on a disabled NATIVE button at all, so a forced user click
 * leaves both arms at zero and asserts nothing.
 */
describe('Pressable — a disabled control against real platform behaviour', () => {
    const NAV = '#pressable-nav';

    afterEach(() => {
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    });

    const renderAnchor = async (disabled: boolean) => {
        const clicks = ref(0);
        await render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(Pressable as any, {
                        as: 'a',
                        href: NAV,
                        label: 'Go',
                        disabled,
                        onClick: () => {
                            clicks.value += 1;
                        },
                    }),
            ),
        );
        return clicks;
    };

    const dispatchClick = (element: Element): boolean =>
        element.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));

    it('does not FOLLOW an as="a" href while disabled — the fallback has no native disabled', async () => {
        const clicks = await renderAnchor(true);

        const notCancelled = dispatchClick(control());

        expect(notCancelled).toBe(false); // preventDefault() ran
        expect(location.hash).toBe(''); // …and the browser therefore did not navigate
        expect(clicks.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same anchor, enabled, DOES navigate and run the handler', async () => {
        const clicks = await renderAnchor(false);

        dispatchClick(control());

        // Without this the assertions above hold on an anchor that never navigates at all, and the
        // whole finding would read as fixed on code that never had it.
        expect(location.hash).toBe(NAV);
        expect(clicks.value).toBe(1);
    });

    it('lets a real Escape reach an ANCESTOR while disabled — inert is not deaf for everyone', async () => {
        // Only a real browser closes this chain: the disabled fallback keeps `tabindex="-1"` and
        // the stylesheet keeps it hit-testable, so a real pointer FOCUSES it (happy-dom cannot
        // prove that), and the key then originates on the control itself — no interactive
        // descendant involved. Stopping propagation to silence the consumer's own handler used to
        // kill this climb too, so a dialog listening for Escape above a disabled row never closed.
        const ancestor: KeyboardEvent[] = [];
        const record = (event: Event) => ancestor.push(event as KeyboardEvent);
        document.addEventListener('keydown', record);

        try {
            const {clicks} = await renderPressable({as: 'div', disabled: true});
            const element = control();

            await userEvent.click(element, {force: true});
            expect(document.activeElement).toBe(element); // mouse-focusable at tabindex="-1"

            await userEvent.keyboard('{Escape}');

            expect(ancestor.map((event) => event.key)).toContain('Escape');
            expect(clicks.value).toBe(0); // …and the control itself stayed inert
        } finally {
            document.removeEventListener('keydown', record);
        }
    });

    const renderWithInteractiveChild = async (disabled: boolean) => {
        const childClicks = ref(0);
        await render(
            defineComponent(
                () => () =>
                    h(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                        Pressable as any,
                        {as: 'div', label: 'Row', disabled},
                        {
                            default: () => [
                                h('a', {id: 'child-link', href: NAV}, 'Open'),
                                h('button', {
                                    id: 'child-button',
                                    type: 'button',
                                    onClick: () => {
                                        childClicks.value += 1;
                                    },
                                }),
                            ],
                        },
                    ),
            ),
        );
        return childClicks;
    };

    it('is inert for its whole SUBTREE — a real pointer on a nested link or button does nothing', async () => {
        // The leak a bubble-phase stop on the root cannot close: the child's own handler runs on the
        // way UP, before the root ever sees the event, and the anchor's navigation is a default
        // action no `stopImmediatePropagation()` withholds.
        const childClicks = await renderWithInteractiveChild(true);
        const link = document.getElementById('child-link') as HTMLElement;
        const button = document.getElementById('child-button') as HTMLElement;

        // The children are still hit-testable — the fix is a guard, not `pointer-events: none`.
        expect(hitAtCentre(link)).toBe(link);

        await userEvent.click(link, {force: true});
        await userEvent.click(button, {force: true});

        expect(location.hash).toBe('');
        expect(childClicks.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same children, enabled, navigate and fire', async () => {
        const childClicks = await renderWithInteractiveChild(false);
        const link = document.getElementById('child-link') as HTMLElement;
        const button = document.getElementById('child-button') as HTMLElement;

        await userEvent.click(button);
        expect(childClicks.value).toBe(1);

        await userEvent.click(link);
        expect(location.hash).toBe(NAV);
    });

    const renderWithKeyHandlers = async (disabled: boolean) => {
        const keydowns = ref(0);
        const keyups = ref(0);
        await render(
            defineComponent(
                () => () =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                    h(Pressable as any, {
                        as: 'div',
                        label: 'Row',
                        disabled,
                        onKeydown: () => {
                            keydowns.value += 1;
                        },
                        onKeyup: () => {
                            keyups.value += 1;
                        },
                    }),
            ),
        );
        return {keydowns, keyups};
    };

    it('is deaf to keys after a real MOUSE focus — tabindex="-1" is still mouse-focusable', async () => {
        // The reachability argument, measured rather than assumed: a disabled fallback is out of the
        // TAB order but a pointer press still focuses it, and the control deliberately stays in
        // hit-testing — so the consumer's fall-through key handlers are reachable on a control that
        // is supposed to be inert.
        const {keydowns, keyups} = await renderWithKeyHandlers(true);

        await userEvent.click(control(), {force: true});
        expect(document.activeElement).toBe(control()); // the reachability half

        await userEvent.keyboard('{Enter} a');

        expect(keydowns.value).toBe(0);
        expect(keyups.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same handlers run on the ENABLED control', async () => {
        const {keydowns, keyups} = await renderWithKeyHandlers(false);

        await userEvent.click(control());
        expect(document.activeElement).toBe(control());

        await userEvent.keyboard('{Enter}');

        expect(keydowns.value).toBeGreaterThan(0);
        expect(keyups.value).toBeGreaterThan(0);
    });
});

/**
 * The same disabled-key leak one path over: a key that reaches the control from a focusable
 * DESCENDANT. The origin check used to run first and bare-return, so the consumer's fall-through
 * `@keydown`/`@keyup` fired on an inert control exactly as it did for root-origin keys.
 *
 * Browser-only, and for two independent reasons. The reachability half is a platform fact —
 * `tabindex="-1"` is out of the tab order but still MOUSE-focusable, which is what puts focus
 * inside a disabled control in the first place — and happy-dom neither hit-tests nor focuses on a
 * pointer press. The "child keeps its own keys" half needs a layout engine to insert a character;
 * happy-dom can show the event was left alone but not that the field still WORKS.
 */
describe('Pressable — a disabled control and a focusable DESCENDANT', () => {
    const renderDisabledRowWithChildren = async (disabled: boolean) => {
        const keydowns = ref(0);
        const keyups = ref(0);
        await render(
            defineComponent(
                () => () =>
                    h(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic SFC in a render-fn host
                        Pressable as any,
                        {
                            as: 'div',
                            label: 'Row',
                            disabled,
                            onKeydown: () => {
                                keydowns.value += 1;
                            },
                            onKeyup: () => {
                                keyups.value += 1;
                            },
                        },
                        {default: () => [h('input', {id: 'inner-filter'})]},
                    ),
            ),
        );
        return {keydowns, keyups, filter: document.getElementById('inner-filter') as HTMLInputElement};
    };

    it("gives the consumer NOTHING while keeping the child's own keys — real pointer, real keyboard", async () => {
        const {keydowns, keyups, filter} = await renderDisabledRowWithChildren(true);

        // Reachability, measured rather than argued: a real pointer press puts focus INSIDE a
        // disabled control, because the control stays in hit-testing and the child is focusable.
        await userEvent.click(filter, {force: true});
        expect(document.activeElement).toBe(filter);

        await userEvent.keyboard('a b');

        // The guard withholds the consumer's handler and touches the event itself not at all, so
        // the field still works. This is the assertion that keeps the fix from being "disable the
        // subtree's keyboard".
        expect(filter.value).toBe('a b');
        // …and none of it reached the consumer's handlers on the inert row.
        expect(keydowns.value).toBe(0);
        expect(keyups.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same fixture, enabled, reaches the consumer AND types', async () => {
        const {keydowns, keyups, filter} = await renderDisabledRowWithChildren(false);

        await userEvent.click(filter);
        await userEvent.keyboard('a b');

        // Without this arm the two zeros above are equally consistent with a fixture whose
        // handlers were never wired, or with a row that stopped answering the keyboard entirely.
        expect(filter.value).toBe('a b');
        expect(keydowns.value).toBeGreaterThan(0);
        expect(keyups.value).toBeGreaterThan(0);
    });

    const dispatchKey = (element: Element, type: 'keydown' | 'keyup', value: string): void => {
        element.dispatchEvent(new KeyboardEvent(type, {key: value, bubbles: true, cancelable: true}));
    };

    it('withholds the consumer on a PROGRAMMATIC descendant key too — the leak is the handler, not the input pipeline', async () => {
        const {keydowns, keyups, filter} = await renderDisabledRowWithChildren(true);

        dispatchKey(filter, 'keydown', 'Enter');
        dispatchKey(filter, 'keyup', 'Enter');
        dispatchKey(filter, 'keydown', ' ');
        dispatchKey(filter, 'keyup', ' ');

        expect(keydowns.value).toBe(0);
        expect(keyups.value).toBe(0);
    });

    it('POSITIVE CONTROL — the same dispatches reach the consumer while enabled', async () => {
        const {keydowns, keyups, filter} = await renderDisabledRowWithChildren(false);

        dispatchKey(filter, 'keydown', 'Enter');
        dispatchKey(filter, 'keyup', 'Enter');

        expect(keydowns.value).toBe(1);
        expect(keyups.value).toBe(1);
    });
});
