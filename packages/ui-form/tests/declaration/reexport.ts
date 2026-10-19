import {createUiForm} from '../../src';

// An app sets its texts once and re-exports the configured useForm: its type must be nameable.
export const {useForm, SingleSelect} = createUiForm({texts: {placeholder: 'Kies…'}});
