import type {AllowedComponentProps, Component, DefineSetupFnComponent, SlotsType, VNode, VNodeProps} from 'vue';

import {defineComponent, h} from 'vue';

import type {FieldAria, FieldBinding} from '../types';
import type {Path, PathsFor, PathValue} from './path';
import type {FieldModel} from './types';

import FormField from '../components/FormField.vue';
import TextInput from '../components/TextInput.vue';

/** The keys `field(name)` supplies; a bound control takes them from the form, not the template. */
type Wiring = keyof FieldBinding | 'modelValue' | 'onUpdate:modelValue';

/** What every bound control takes itself: the field's name and its frame. */
export interface BoundShell<N> {
    /** the field, by its path in the form. */
    name: N;
    label?: string;
    required?: boolean;
    orientation?: 'vertical' | 'horizontal';
}

/** A bound control without addon texts refuses them: a template would otherwise take them as fallthrough attributes. */
export interface NoAddonProps {
    prepend?: never;
    append?: never;
}

// oxlint-disable-next-line typescript/no-explicit-any -- matches any component constructor
type PropsOf<C> = C extends abstract new (...args: any) => {$props: infer P} ? P : never;

/**
 * A bound non-generic control of the form `D`: its shell, plus the control's own props minus the wiring. Its
 * slots are the frame's (`label-after`, `aside`, `hint`) plus the control's own (`ControlSlots`, none for a
 * control without slots), so a misspelt slot name is a type error rather than content that silently vanishes.
 */
type BoundControl<N, C, Value, Extra = NoAddonProps, ControlSlots = {}> = DefineSetupFnComponent<
    BoundShell<N> & Extra & Omit<PropsOf<C>, Wiring | 'required' | 'label'> & BoundValueProps<Value>,
    {},
    SlotsType<FrameContentSlots & ControlSlots>
>;
/**
 * The value at the call site, typed by what the control reads and writes. On a form without a draft it is
 * the value; on a draft form it overrides the draft (a proxy that converts, such as hours shown for minutes
 * stored), and without it the draft is the value.
 */
export interface BoundValueProps<Value> {
    modelValue?: Value;
    'onUpdate:modelValue'?: (value: Value) => void;
}

/**
 * The form-bound controls of a form `D`: its names (free strings, or a union of them), or a draft named by
 * its paths.
 */
export interface BoundControls<D> {
    /**
     * `TextInput` in a `FormField`, bound by name:
     * `<TextField name="email" label="E-mail" placeholder="…" required />`. On a draft form the name is a
     * path holding `string` or `string | null`. Its `label-after`, `aside` and `hint` slots go to the field
     * (the control names the hint after the message), every other slot to `TextInput`. A `describedby` given
     * at the call site replaces the field's (the message and hint ids), as any prop given there does.
     */
    TextField: BoundControl<NamesFor<D, string | null, string>, typeof TextInput, string | null>;
    /**
     * The field frame by name, for a control the kit has no bound version of (your own, or one that edits
     * a derived value): the form's ids, label and message. Its slot hands out `field` and `aria`, the
     * wiring without the value, and on a draft form `model`, the value at that name and its write-back
     * into the draft, typed by the value at that path. A form without a draft has no value to hand out:
     * there is no `model`, the control takes its own `v-model`. Bind the control from the slot, never with
     * the form's `field()`: `<TextInput v-bind="{...field, ...model}" />`, or, for a proxy that converts,
     * `<TextInput v-bind="field" v-model="hours" />` (with `model` bound too, both would be written).
     * Its `label-after`, `aside` and `hint` slots go to the frame; with a hint, `field` names it after the message.
     */
    FormField: D extends string ? DefineSetupFnComponent<BoundShell<D>, {}, FieldFrameSlots> : BoundDraftFrame<D>;
}

/**
 * What the field frame's slot hands the control: `field` for a control of this package, `aria` for a native
 * element.
 */
export interface FrameScope {
    field: FieldBinding;
    aria: FieldAria;
}

/** What the field frame's slot hands the control on a draft form: the wiring plus `model`, the value at its name. */
export interface DraftFrameScope<V> extends FrameScope {
    model: FieldModel<V>;
}

/**
 * The frame's own slots, beside the control's: content after the label text (`label-after`), at the far end
 * of the label's row (`aside`), and under the control (`hint`, which the control names after the message).
 */
export interface FrameContentSlots {
    'label-after'?: () => VNode[];
    aside?: () => VNode[];
    hint?: () => VNode[];
}

/** The slots of the field frame on a form without a draft: the control gets the wiring, the frame its content. */
export type FieldFrameSlots = SlotsType<{default: (scope: FrameScope) => VNode[]} & FrameContentSlots>;

/**
 * The field frame of a draft form: generic over its name, so the slot's `model` is typed by the value at
 * that path. A functional component's call signature, the shape Vue's language tools read a generic
 * component by (`__ctx` carries its props and slots to the template). That shape is what vue-tsc emits for
 * `<script setup generic>`, not a published contract: `tests/types/KitTyping.vue` pins it, so a vue-tsc
 * major that changes it fails there first.
 */
export interface BoundDraftFrame<D> {
    <N extends Path<D>>(
        props: BoundShell<N> & AllowedComponentProps & VNodeProps,
        ctx?: unknown,
    ): VNode & {__ctx?: DraftFrameContext<D, N>};
    /** the component's name, `FormField`. */
    name: string;
}

/** What a draft form's field frame declares for the name `N`: its props and its slot. Internal: vue-tsc's `__ctx`. */
interface DraftFrameContext<D, N extends Path<D>> {
    props: BoundShell<N> & AllowedComponentProps & VNodeProps;
    slots: {default?: (scope: DraftFrameScope<PathValue<D, N>>) => VNode[]} & FrameContentSlots;
    attrs: Record<string, unknown>;
    emit: {};
}

/**
 * The names a bound control takes: on a form without a draft (`D` a string of names) any of its names; on a
 * draft form the paths a control that reads `Reads` and writes `Writes` can bind (a path never empty fits too).
 */
type NamesFor<D, Reads, Writes> = D extends string ? D : PathsFor<D, Reads, Writes>;

type Field = (name: string) => FieldBinding & {modelValue?: unknown; 'onUpdate:modelValue'?: (value: unknown) => void};
type Message = (name: string) => string | undefined;

/**
 * One form-bound control: `FormField` around the control, wired by `field(name)`. The control's own
 * props and attributes pass through (`class`/`style` land on the field), and they win over the wiring,
 * so `:invalid="false"` or a `v-model` at the call site overrides the form's. The frame's slots
 * (`label-after`, `aside`, `hint`) go to the field, every other slot to the control.
 */
const bind = (field: Field, message: Message, control: Component, name: string) =>
    defineComponent(
        (props: BoundShell<string>, {attrs, slots}) =>
            () => {
                const {class: className, style, ...rest} = attrs;
                const {'label-after': labelAfter, aside, hint, ...controlSlots} = slots;
                const wiring = field(props.name);
                return h(
                    FormField,
                    {
                        id: wiring.id,
                        error: message(props.name),
                        label: props.label,
                        required: props.required,
                        orientation: props.orientation,
                        class: className,
                        style,
                    },
                    {
                        // the frame names the message and the hint
                        default: ({field: frame}: FrameScope) =>
                            h(
                                control,
                                {...wiring, describedby: frame.describedby, required: props.required, ...rest},
                                controlSlots,
                            ),
                        'label-after': labelAfter,
                        aside,
                        hint,
                    },
                );
            },
        {name, inheritAttrs: false, props: ['name', 'label', 'required', 'orientation']},
    );

/**
 * The field frame by name: `FormField` with the form's id and message for that name; its slot gets the
 * wiring, and on a draft form the value at that name as `model`. Its `label-after`, `aside` and `hint` go to
 * `FormField`. Everything but the name (label, required, orientation, class) falls through to `FormField`.
 */
const bindFrame = (field: Field, message: Message) =>
    defineComponent(
        (props: {name: string}, {slots}) =>
            () => {
                const wiring = field(props.name);
                const frame = (scope: FrameScope) =>
                    slots.default?.(
                        'onUpdate:modelValue' in wiring
                            ? {
                                  ...scope,
                                  model: {
                                      modelValue: wiring.modelValue,
                                      'onUpdate:modelValue': wiring['onUpdate:modelValue'],
                                  },
                              }
                            : scope,
                    );
                return h(
                    FormField,
                    {id: wiring.id, error: message(props.name)},
                    {default: frame, 'label-after': slots['label-after'], aside: slots.aside, hint: slots.hint},
                );
            },
        {name: 'FormField', props: ['name']},
    );

/** The bound controls of one form. The casts: a setup-function component cannot carry these types. */
export const createBoundControls = <D>(field: Field, message: Message): BoundControls<D> =>
    ({
        TextField: bind(field, message, TextInput, 'TextField'),
        FormField: bindFrame(field, message),
    }) as unknown as BoundControls<D>;
