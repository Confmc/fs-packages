export {default as FormError} from './components/FormError.vue';
export {default as FormField} from './components/FormField.vue';
export {default as FormLabel} from './components/FormLabel.vue';
export {default as TextInput} from './components/TextInput.vue';

// Form state (ported from @script-development/fs-form): the validation bag, the submit it binds, and
// useForm, which wires the two in one call.
export {useForm} from './form/form';
export type {UseFormCall} from './form/form';
export {useFormSubmit} from './form/form-submit';
export {useValidationErrors} from './form/validation-errors';
export type {
    FieldModel,
    SubmitOutcome,
    UseDraftForm,
    UseDraftFormOptions,
    UseForm,
    UseFormClient,
    UseFormOptions,
    UseFormSubmit,
    UseValidationErrors,
    UseValidationErrorsOptions,
    ValidationErrors,
} from './form/types';
export type {Path, PathsFor, PathsOf, PathValue} from './form/path';
export type {BoundControls} from './form/kit';
export type {FormDraft} from './form/draft';
export type {BoundFormLabelProps, FormErrorComponent, FormLabelComponent} from './form/field';
export type {FieldAria, FieldBinding} from './types';
