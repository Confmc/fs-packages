import type {Ref} from 'vue';

import {useForm} from '@script-development/ui-form';

// An app configures useForm once and re-exports it, or wraps it per form: each type, the bound controls
// included, must be nameable in the app's own declarations. The import is the package itself, so this reads
// the built `dist/` types consumers get (build first; CI does): a type the source exports but the barrel does
// not would pass against src and fail in an app.
export const {useForm: useAppForm} = {useForm};
export const useContactForm = () => useForm<'email' | 'name'>({idPrefix: 'contact'});
export const useContractForm = (draft: Ref<{name: string | null; code: string}>) => useForm({draft});
