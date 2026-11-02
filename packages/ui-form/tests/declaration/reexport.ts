import type {Ref} from 'vue';

import {useForm} from '../../src';

// An app configures useForm once and re-exports it, or wraps it per form: each type, the bound controls
// included, must be nameable in the app's own declarations.
export const {useForm: useAppForm} = {useForm};
export const useContactForm = () => useForm<'email' | 'name'>({idPrefix: 'contact'});
export const useContractForm = (draft: Ref<{name: string | null; code: string}>) => useForm({draft});
