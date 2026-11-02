import type {Component, DefineSetupFnComponent, SlotsType, VNode} from 'vue';

import {defineComponent, h} from 'vue';

import type {FieldAria, FieldBinding} from '../types';
import type {Path, PathsFor} from './path';

import FormField from '../components/FormField.vue';
import TextInput from '../components/TextInput.vue';

/** The keys `field(name)` supplies; a bound control takes them from the form, not the template. */
type Wiring = keyof FieldBinding | 'modelValue' | 'onUpdate:modelValue';

/** What every bound control takes itself: the field's name and its frame. */
interface Shell<N> {
    /** the field, by its path in the form. */
    name: N;
    label?: string;
    required?: boolean;
    orientation?: 'vertical' | 'horizontal';
}

/** A bound control without addon texts refuses them: a template would otherwise take them as fallthrough attributes. */
interface NoAddons {
    prepend?: never;
    append?: never;
}

// oxlint-disable-next-line typescript/no-explicit-any -- matches any component constructor
type PropsOf<C> = C extends abstract new (...args: any) => {$props: infer P} ? P : never;

/** A bound non-generic control: its shell, plus the control's own props minus the wiring. */
type BoundControl<N, C, Value, Extra = NoAddons> = DefineSetupFnComponent<
    Shell<N> & Extra & Omit<PropsOf<C>, Wiring | 'required' | 'label'> & ValueProps<N, Value>
>;
/** On a form without a draft the value comes from `v-model`; with one, from the draft. */
type ValueProps<N, Value> = string extends N
    ? {modelValue?: Value; 'onUpdate:modelValue'?: (value: Value) => void}
    : {};

/** The form-bound controls for a form named by `N` (free strings) or by the paths of a draft `D`. */
export interface BoundControls<D> {
    TextField: BoundControl<NamesFor<D, string | null, string>, typeof TextInput, string | null>;
    /**
     * The field frame by name, for a control the kit has no bound version of (your own, or one that edits
     * a derived value): the form's ids, label and message, and in its slot the field's wiring without
     * the value, so the control keeps its own `v-model`.
     */
    FormField: DefineSetupFnComponent<Shell<D extends string ? D : Path<D>>, {}, FrameSlots>;
}

/** The slots of the field frame: the control gets the wiring. */
type FrameSlots = SlotsType<{default: (scope: {field: FieldBinding; aria: FieldAria}) => VNode[]}>;

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
 * so `:invalid="false"` or a `v-model` at the call site overrides the form's.
 */
const bind = (field: Field, message: Message, control: Component, name: string) =>
    defineComponent(
        (props: Shell<string>, {attrs, slots}) =>
            () => {
                const {class: className, style, ...rest} = attrs;
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
                    {default: () => h(control, {...wiring, required: props.required, ...rest}, slots)},
                );
            },
        {name, inheritAttrs: false, props: ['name', 'label', 'required', 'orientation']},
    );

/**
 * The field frame by name: `FormField` with the form's id and message for that name; its slot gets the
 * wiring. Everything but the name (label, required, orientation, class) falls through to `FormField`.
 */
const bindFrame = (field: Field, message: Message) =>
    defineComponent(
        (props: {name: string}, {slots}) =>
            () =>
                h(FormField, {id: field(props.name).id, error: message(props.name)}, slots),
        {name: 'FormField', props: ['name']},
    );

/** The bound controls of one form. The casts: a setup-function component cannot carry these types. */
export const createBoundControls = <D>(field: Field, message: Message): BoundControls<D> =>
    ({
        TextField: bind(field, message, TextInput, 'TextField'),
        FormField: bindFrame(field, message),
    }) as unknown as BoundControls<D>;
