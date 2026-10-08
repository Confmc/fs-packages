export {default as FormField} from './components/FormField.vue';
export {default as FormLabel} from './components/FormLabel.vue';
export {default as FormError} from './components/FormError.vue';
export {default as TextInput} from './components/TextInput.vue';
export {default as NumberInput} from './components/NumberInput.vue';
export {default as DateInput} from './components/DateInput.vue';
export {default as Textarea} from './components/Textarea.vue';
export {default as Checkbox} from './components/Checkbox.vue';
export {default as CheckboxGroup} from './components/CheckboxGroup.vue';
export {default as Switch} from './components/Switch.vue';
export {default as RadioGroup} from './components/RadioGroup.vue';
export {default as SingleSelect} from './components/SingleSelect.vue';
export {default as Combobox} from './components/Combobox.vue';
export {default as MultiSelect} from './components/MultiSelect.vue';
export {default as MultiCombobox} from './components/MultiCombobox.vue';
export {default as GroupSelect} from './components/GroupSelect.vue';
export {default as GroupCombobox} from './components/GroupCombobox.vue';

// Interactive controls that are NOT form inputs: they carry no value and belong to no field.
// Both exist to make a keyboard-reachable control the path of least resistance — the class of
// defect a bare `<div @click>` ships (WCAG 2.1.1 / 4.1.2, Level A).
export {default as Pressable} from './components/Pressable.vue';
export {default as Disclosure} from './components/Disclosure.vue';

// A FormField bound to one error bag. useForm returns one as `Field`; createField is for a bag from
// another source and for component specs.
export {createField} from './form/field';

// Form state (formerly @script-development/fs-form): useForm returns a Field that closes over its errors.
export {useForm} from './form/form';
export {useFormSubmit} from './form/form-submit';
export {useValidationErrors} from './form/validation-errors';
export type {FormHttpService} from './form/http-contract';
export type {
    UseForm,
    UseFormOptions,
    UseFormSubmit,
    UseValidationErrors,
    UseValidationErrorsOptions,
    ValidationErrors,
} from './form/types';

export type {FieldBinding, SelectItem, LabelKey} from './types';
