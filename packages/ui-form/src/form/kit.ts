import type {Component, DefineSetupFnComponent, SlotsType, VNode} from 'vue';

import {defineComponent, h} from 'vue';

import type {FieldAria, FieldBinding, LabelKey, SelectItem} from '../types';
import type {Path, PathsOf} from './path';

import Checkbox from '../components/Checkbox.vue';
import CheckboxGroup from '../components/CheckboxGroup.vue';
import Combobox from '../components/Combobox.vue';
import DateInput from '../components/DateInput.vue';
import FormField from '../components/FormField.vue';
import GroupCombobox from '../components/GroupCombobox.vue';
import GroupSelect from '../components/GroupSelect.vue';
import InputGroup from '../components/InputGroup.vue';
import MultiCombobox from '../components/MultiCombobox.vue';
import MultiSelect from '../components/MultiSelect.vue';
import NumberInput from '../components/NumberInput.vue';
import PasswordInput from '../components/PasswordInput.vue';
import RadioGroup from '../components/RadioGroup.vue';
import SearchInput from '../components/SearchInput.vue';
import SingleSelect from '../components/SingleSelect.vue';
import Switch from '../components/Switch.vue';
import Textarea from '../components/Textarea.vue';
import TextInput from '../components/TextInput.vue';
import TimeInput from '../components/TimeInput.vue';

/** The texts a consumer sets once for its language; a control left without one keeps the package's. */
export interface UiTexts {
    /** the select family's trigger text while nothing is chosen. */
    placeholder?: string;
    /** the select family's text for a list without options. */
    emptyText?: string;
    /** the accessible name of the select family's listbox popup. */
    optionsLabel?: string;
    /** the multi-selects' remove-chip button name. */
    removeLabel?: string;
    /** CheckboxGroup's required marker for assistive tech. */
    requiredLabel?: string;
    /** the accessible name of an in-input clear button (TimeInput, SearchInput). */
    clearButtonLabel?: string;
    /** PasswordInput's toggle name while the password is hidden. */
    showPasswordLabel?: string;
    /** PasswordInput's toggle name while the password is shown. */
    hidePasswordLabel?: string;
    /** PasswordInput's warning while Caps Lock is on. */
    capsLockText?: string;
}

/** Which texts each control declares; nothing else reaches it, so no text leaks as an attribute. */
const SELECT_TEXTS = ['placeholder', 'emptyText', 'optionsLabel'] as const;
const MULTI_TEXTS = [...SELECT_TEXTS, 'removeLabel'] as const;
const GROUP_TEXTS = ['requiredLabel'] as const;
const CLEAR_TEXTS = ['clearButtonLabel'] as const;
const PASSWORD_TEXTS = ['showPasswordLabel', 'hidePasswordLabel', 'capsLockText'] as const;

const textsFor = (texts: UiTexts, keys: readonly (keyof UiTexts)[]): UiTexts =>
    Object.fromEntries(keys.filter((key) => texts[key] !== undefined).map((key) => [key, texts[key]]));

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

/** A text-like bound control can carry addon texts joined to it (`InputGroup`). */
interface Addons {
    /** text joined to the start of the control (`€`); read with the field, via aria-describedby. */
    prepend?: string;
    /** text joined to the end of the control (`dagen`). */
    append?: string;
}
/** Any other bound control refuses them: a template would otherwise take them as fallthrough attributes. */
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

// The select family is generic over its option type, so its bound controls are typed as generic
// call signatures: `T` comes from `:options`, and the name must be a path holding that option's id.
// `T` is inferred from the props that carry it (`options` or `groups`, and `optionLabel`), declared
// here directly: inference does not reach through the `Omit` that passes the rest of the props on.
type SelectParams<C extends (...args: never[]) => unknown> = Parameters<C>[0];
interface Carries<T> {
    options: T[];
    optionLabel: LabelKey<T>;
}
interface CarriesGroups<T> {
    groups: {options: T[]; text: string; header?: boolean}[];
    optionLabel: LabelKey<T>;
}
type BoundSelect<N, Props, Value, Carrier> = Shell<N> &
    Carrier &
    NoAddons &
    Omit<Props, Wiring | 'required' | keyof Carrier> &
    ValueProps<N, Value>;

/** The form-bound controls for a form named by `N` (free strings) or by the paths of a draft `D`. */
export interface BoundControls<D> {
    TextField: BoundControl<Names<D, string | null>, typeof TextInput, string | null, Addons>;
    TextareaField: BoundControl<Names<D, string | null>, typeof Textarea, string | null>;
    NumberField: BoundControl<Names<D, number | null>, typeof NumberInput, number | null, Addons>;
    DateField: BoundControl<Names<D, string | null>, typeof DateInput, string | null, Addons>;
    TimeField: BoundControl<Names<D, string | null>, typeof TimeInput, string | null, Addons>;
    PasswordField: BoundControl<Names<D, string | null>, typeof PasswordInput, string | null>;
    /** `label` is the box's own label. */
    CheckboxField: DefineSetupFnComponent<
        Shell<Names<D, boolean>> &
            NoAddons &
            Omit<PropsOf<typeof Checkbox>, Wiring | 'required'> &
            ValueProps<Names<D, boolean>, boolean>
    >;
    /** `label` is the switch's own label. */
    SwitchField: DefineSetupFnComponent<
        Shell<Names<D, boolean>> &
            NoAddons &
            Omit<PropsOf<typeof Switch>, Wiring | 'required'> &
            ValueProps<Names<D, boolean>, boolean>
    >;
    /** `label` is the group's legend, required: a group without one has no accessible name. */
    RadioGroupField: <T extends SelectItem>(
        props: BoundSelect<Names<D, T['id'] | null>, SelectParams<typeof RadioGroup<T>>, T['id'] | null, Carries<T>> & {
            label: string;
        },
    ) => VNode;
    /** `label` is the group's legend, required: a group without one has no accessible name. */
    CheckboxGroupField: <T extends SelectItem>(
        props: BoundSelect<Names<D, T['id'][]>, SelectParams<typeof CheckboxGroup<T>>, T['id'][], Carries<T>> & {
            label: string;
        },
    ) => VNode;
    SingleSelectField: <T extends SelectItem>(
        props: BoundSelect<Names<D, T['id'] | null>, SelectParams<typeof SingleSelect<T>>, T['id'] | null, Carries<T>>,
    ) => VNode;
    ComboboxField: <T extends SelectItem>(
        props: BoundSelect<Names<D, T['id'] | null>, SelectParams<typeof Combobox<T>>, T['id'] | null, Carries<T>>,
    ) => VNode;
    MultiSelectField: <T extends SelectItem>(
        props: BoundSelect<Names<D, T['id'][]>, SelectParams<typeof MultiSelect<T>>, T['id'][], Carries<T>>,
    ) => VNode;
    MultiComboboxField: <T extends SelectItem>(
        props: BoundSelect<Names<D, T['id'][]>, SelectParams<typeof MultiCombobox<T>>, T['id'][], Carries<T>>,
    ) => VNode;
    GroupSelectField: <T extends SelectItem>(
        props: BoundSelect<
            Names<D, T['id'] | null>,
            SelectParams<typeof GroupSelect<T>>,
            T['id'] | null,
            CarriesGroups<T>
        >,
    ) => VNode;
    GroupComboboxField: <T extends SelectItem>(
        props: BoundSelect<
            Names<D, T['id'] | null>,
            SelectParams<typeof GroupCombobox<T>>,
            T['id'] | null,
            CarriesGroups<T>
        >,
    ) => VNode;
    /**
     * The field frame by name, for a control the kit has no bound version of (your own, or one that edits
     * a derived value): the form's ids, label, hint and message, and in its slot the field's wiring without
     * the value, so the control keeps its own `v-model`.
     */
    FormField: DefineSetupFnComponent<Shell<D extends string ? D : Path<D>>, {}, FrameSlots>;
}

/** The slots of the field frame: the control gets the wiring; the label, its row and the hint get content. */
type FrameSlots = SlotsType<{
    default: (scope: {field: FieldBinding; aria: FieldAria}) => VNode[];
    'label-after'?: () => VNode[];
    aside?: (scope: {field: FieldBinding}) => VNode[];
    hint?: () => VNode[];
}>;

/** A form without a draft (`D` a string of names) takes any of its names; a draft form only the paths holding `V`. */
type Names<D, V> = D extends string ? D : PathsOf<D, V>;

type Field = (name: string) => FieldBinding & {modelValue?: unknown; 'onUpdate:modelValue'?: (value: unknown) => void};

/**
 * One form-bound control: `FormField` around the control, wired by `field(name)`. The control's own
 * props and attributes pass through (`class`/`style` land on the field), and they win over the wiring,
 * so `:invalid="false"` or a `v-model` at the call site overrides the form's.
 */
const bind = (field: Field, control: Component, name: string, labelOnControl: boolean, texts: UiTexts) =>
    defineComponent(
        (props: Shell<string> & Addons, {attrs, slots}) =>
            () => {
                const {class: className, style, ...rest} = attrs;
                // the frame's slots go to the field, every other slot to the control
                const {'label-after': labelAfter, aside, hint, ...controlSlots} = slots;
                const wiring = field(props.name);
                const addons = [props.prepend && `${wiring.id}-prepend`, props.append && `${wiring.id}-append`];
                // the frame names the message and the hint; the addons follow them
                const inner = (frame: FieldBinding) =>
                    h(
                        control,
                        {
                            ...texts,
                            ...wiring,
                            describedby: [frame.describedby, ...addons].filter(Boolean).join(' ') || undefined,
                            required: props.required,
                            ...(labelOnControl ? {label: props.label} : {}),
                            ...rest,
                        },
                        controlSlots,
                    );
                return h(
                    FormField,
                    {
                        id: wiring.id,
                        error: wiring.error,
                        label: labelOnControl ? undefined : props.label,
                        required: props.required,
                        orientation: props.orientation,
                        class: className,
                        style,
                    },
                    {
                        default: ({field: frame}: {field: FieldBinding}) =>
                            props.prepend || props.append
                                ? h(InputGroup, {id: wiring.id, prepend: props.prepend, append: props.append}, () =>
                                      inner(frame),
                                  )
                                : inner(frame),
                        'label-after': labelAfter,
                        aside,
                        hint,
                    },
                );
            },
        {name, inheritAttrs: false, props: ['name', 'label', 'required', 'orientation', 'prepend', 'append']},
    );

/** The field frame by name: `FormField` with the form's id and message for that name; its slot gets the wiring. */
const bindFrame = (field: Field) =>
    defineComponent(
        (props: Shell<string>, {slots}) =>
            () => {
                const {id, error} = field(props.name);
                return h(
                    FormField,
                    {id, error, label: props.label, required: props.required, orientation: props.orientation},
                    slots,
                );
            },
        {name: 'FormField', props: ['name', 'label', 'required', 'orientation']},
    );

/** The bound controls of one form. The casts: a setup-function component cannot carry these types. */
export const createBoundControls = <D>(field: Field, texts: UiTexts): BoundControls<D> => {
    const select = textsFor(texts, SELECT_TEXTS);
    const multi = textsFor(texts, MULTI_TEXTS);
    const group = textsFor(texts, GROUP_TEXTS);
    const clear = textsFor(texts, CLEAR_TEXTS);

    return {
        TextField: bind(field, TextInput, 'TextField', false, {}),
        TextareaField: bind(field, Textarea, 'TextareaField', false, {}),
        NumberField: bind(field, NumberInput, 'NumberField', false, {}),
        DateField: bind(field, DateInput, 'DateField', false, {}),
        TimeField: bind(field, TimeInput, 'TimeField', false, clear),
        PasswordField: bind(field, PasswordInput, 'PasswordField', false, textsFor(texts, PASSWORD_TEXTS)),
        CheckboxField: bind(field, Checkbox, 'CheckboxField', true, {}),
        SwitchField: bind(field, Switch, 'SwitchField', true, {}),
        RadioGroupField: bind(field, RadioGroup, 'RadioGroupField', true, {}),
        CheckboxGroupField: bind(field, CheckboxGroup, 'CheckboxGroupField', true, group),
        SingleSelectField: bind(field, SingleSelect, 'SingleSelectField', false, select),
        ComboboxField: bind(field, Combobox, 'ComboboxField', false, select),
        MultiSelectField: bind(field, MultiSelect, 'MultiSelectField', false, multi),
        MultiComboboxField: bind(field, MultiCombobox, 'MultiComboboxField', false, multi),
        GroupSelectField: bind(field, GroupSelect, 'GroupSelectField', false, select),
        GroupComboboxField: bind(field, GroupCombobox, 'GroupComboboxField', false, select),
        FormField: bindFrame(field),
    } as unknown as BoundControls<D>;
};

/** A bare control with the configured texts as its defaults; the call site's props still win. */
const withTexts = <C extends Component>(control: C, name: string, texts: UiTexts): C =>
    (Object.keys(texts).length
        ? defineComponent(
              (_, {attrs, slots}) =>
                  () =>
                      h(control, {...texts, ...attrs}, slots),
              {name, inheritAttrs: false},
          )
        : control) as C;

/** The bare controls that take texts, each with the configured ones as defaults. */
export const createTextedControls = (texts: UiTexts) => {
    const select = textsFor(texts, SELECT_TEXTS);
    const multi = textsFor(texts, MULTI_TEXTS);
    return {
        SingleSelect: withTexts(SingleSelect, 'SingleSelect', select),
        Combobox: withTexts(Combobox, 'Combobox', select),
        MultiSelect: withTexts(MultiSelect, 'MultiSelect', multi),
        MultiCombobox: withTexts(MultiCombobox, 'MultiCombobox', multi),
        GroupSelect: withTexts(GroupSelect, 'GroupSelect', select),
        GroupCombobox: withTexts(GroupCombobox, 'GroupCombobox', select),
        CheckboxGroup: withTexts(CheckboxGroup, 'CheckboxGroup', textsFor(texts, GROUP_TEXTS)),
        TimeInput: withTexts(TimeInput, 'TimeInput', textsFor(texts, CLEAR_TEXTS)),
        SearchInput: withTexts(SearchInput, 'SearchInput', textsFor(texts, CLEAR_TEXTS)),
        PasswordInput: withTexts(PasswordInput, 'PasswordInput', textsFor(texts, PASSWORD_TEXTS)),
    };
};
