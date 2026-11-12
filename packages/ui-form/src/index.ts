export {default as FormError} from './components/FormError.vue';
export {default as FormLabel} from './components/FormLabel.vue';
export {default as SearchInput} from './components/SearchInput.vue';
export {default as TextInput} from './components/TextInput.vue';
export {default as Checkbox} from './components/Checkbox.vue';
export {default as Switch} from './components/Switch.vue';

// Form state (ported from @script-development/fs-form): the validation bag and the submit it binds.
export {useFormSubmit} from './form/form-submit';
export {useValidationErrors} from './form/validation-errors';
export type {
    SubmitOutcome,
    UseFormSubmit,
    UseValidationErrors,
    UseValidationErrorsOptions,
    ValidationErrors,
} from './form/types';
export {default as NumberInput} from './components/NumberInput.vue';
export {default as DateInput} from './components/DateInput.vue';
export {default as Textarea} from './components/Textarea.vue';
export {default as InputGroup} from './components/InputGroup.vue';
export {default as TimeInput} from './components/TimeInput.vue';
