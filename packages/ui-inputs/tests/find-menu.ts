import type {VueWrapper} from '@vue/test-utils';

import OptionList from '../src/components/OptionList.vue';

/**
 * The listbox is teleported out of the control (KD-1136), so `wrapper.find('.ui-*__menu')`
 * misses it. OptionList is still in the vnode tree; this is the VTU handle onto its `<ul>`.
 */
export const menu = (wrapper: VueWrapper) => wrapper.findComponent(OptionList);
