import {shallowMount} from '@vue/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick} from 'vue';

// @vitest-environment happy-dom
import {createToastService} from '../src/index';

// happy-dom does not implement the Popover API. Stub the three relevant methods
// on HTMLElement.prototype so the container's calls execute without throwing.
// We attach spies per-test (see beforeEach) so call counts are isolated.
// Per orders: do NOT switch the test runtime to jsdom — stub here.
type PopoverHTMLElement = HTMLElement & {showPopover: () => void; hidePopover: () => void};

const installPopoverStubs = () => {
    const proto = HTMLElement.prototype as Partial<PopoverHTMLElement>;
    proto.showPopover ??= function () {};
    proto.hidePopover ??= function () {};
};

installPopoverStubs();

const TestToast = defineComponent({
    props: {message: String},
    emits: ['close'],
    render() {
        return h('div', {class: 'toast'}, this.message);
    },
});

describe('toast service', () => {
    describe('createToastService', () => {
        it('should return all expected methods and properties', () => {
            const toastService = createToastService(TestToast);

            expect(toastService).toHaveProperty('show');
            expect(toastService).toHaveProperty('hide');
            expect(toastService).toHaveProperty('ToastContainerComponent');
            expect(typeof toastService.show).toBe('function');
            expect(typeof toastService.hide).toBe('function');
        });

        it('should return a valid Vue component', () => {
            const toastService = createToastService(TestToast);

            expect(toastService.ToastContainerComponent).toHaveProperty('setup');
            expect(toastService.ToastContainerComponent.name).toBe('ToastContainer');
        });
    });

    describe('show', () => {
        it('should add toast to the container', async () => {
            const toastService = createToastService(TestToast);
            const wrapper = shallowMount(toastService.ToastContainerComponent);

            toastService.show({message: 'Test message'});
            await nextTick();

            expect(wrapper.text()).toContain('Test message');
        });

        it('should return toast id with toast- prefix', () => {
            const toastService = createToastService(TestToast);

            const id = toastService.show({message: 'Test'});

            expect(id).toMatch(/^toast-\d+$/);
        });

        it('should return incrementing toast ids', () => {
            const toastService = createToastService(TestToast);

            const id1 = toastService.show({message: 'First'});
            const id2 = toastService.show({message: 'Second'});

            expect(id1).not.toBe(id2);
            const num1 = Number(id1.replace('toast-', ''));
            const num2 = Number(id2.replace('toast-', ''));
            expect(num2).toBe(num1 + 1);
        });

        it('should add multiple toasts', async () => {
            const toastService = createToastService(TestToast);
            const wrapper = shallowMount(toastService.ToastContainerComponent);

            toastService.show({message: 'Toast 1'});
            toastService.show({message: 'Toast 2'});
            toastService.show({message: 'Toast 3'});
            await nextTick();

            expect(wrapper.findAll('.toast')).toHaveLength(3);
            expect(wrapper.text()).toContain('Toast 1');
            expect(wrapper.text()).toContain('Toast 2');
            expect(wrapper.text()).toContain('Toast 3');
        });

        it('should remove oldest toast when exceeding maximum', async () => {
            const toastService = createToastService(TestToast, 2);
            const wrapper = shallowMount(toastService.ToastContainerComponent);

            toastService.show({message: 'Toast 1'});
            toastService.show({message: 'Toast 2'});
            toastService.show({message: 'Toast 3'});
            toastService.show({message: 'Toast 4'});
            await nextTick();

            expect(wrapper.findAll('.toast')).toHaveLength(2);
            expect(wrapper.text()).not.toContain('Toast 1');
            expect(wrapper.text()).not.toContain('Toast 2');
            expect(wrapper.text()).toContain('Toast 3');
            expect(wrapper.text()).toContain('Toast 4');
        });

        it('should use default maxToasts of 4', async () => {
            const toastService = createToastService(TestToast);
            const wrapper = shallowMount(toastService.ToastContainerComponent);

            for (let i = 1; i <= 6; i++) {
                toastService.show({message: `Toast ${i}`});
            }
            await nextTick();

            expect(wrapper.findAll('.toast')).toHaveLength(4);
            expect(wrapper.text()).not.toContain('Toast 1');
            expect(wrapper.text()).toContain('Toast 6');
        });

        it('should clamp maxToasts to minimum of 1 when 0 is provided', async () => {
            const toastService = createToastService(TestToast, 0);
            const wrapper = shallowMount(toastService.ToastContainerComponent);

            toastService.show({message: 'Toast 1'});
            toastService.show({message: 'Toast 2'});
            await nextTick();

            expect(wrapper.findAll('.toast')).toHaveLength(1);
            expect(wrapper.text()).toContain('Toast 2');
        });

        it('should clamp maxToasts to minimum of 1 when negative is provided', async () => {
            const toastService = createToastService(TestToast, -5);
            const wrapper = shallowMount(toastService.ToastContainerComponent);

            toastService.show({message: 'Toast 1'});
            toastService.show({message: 'Toast 2'});
            await nextTick();

            expect(wrapper.findAll('.toast')).toHaveLength(1);
            expect(wrapper.text()).toContain('Toast 2');
        });

        it('should floor decimal maxToasts values', async () => {
            const toastService = createToastService(TestToast, 2.9);
            const wrapper = shallowMount(toastService.ToastContainerComponent);

            toastService.show({message: 'Toast 1'});
            toastService.show({message: 'Toast 2'});
            toastService.show({message: 'Toast 3'});
            await nextTick();

            expect(wrapper.findAll('.toast')).toHaveLength(2);
            expect(wrapper.text()).not.toContain('Toast 1');
            expect(wrapper.text()).toContain('Toast 3');
        });
    });

    describe('hide', () => {
        it('should remove toast by id', async () => {
            const toastService = createToastService(TestToast);
            const wrapper = shallowMount(toastService.ToastContainerComponent);
            const id = toastService.show({message: 'Toast to hide'});
            await nextTick();

            toastService.hide(id);
            await nextTick();

            expect(wrapper.findAll('.toast')).toHaveLength(0);
        });

        it('should only remove specified toast', async () => {
            const toastService = createToastService(TestToast);
            const wrapper = shallowMount(toastService.ToastContainerComponent);
            toastService.show({message: 'Toast 1'});
            const id2 = toastService.show({message: 'Toast 2'});
            toastService.show({message: 'Toast 3'});
            await nextTick();

            toastService.hide(id2);
            await nextTick();

            expect(wrapper.findAll('.toast')).toHaveLength(2);
            expect(wrapper.text()).toContain('Toast 1');
            expect(wrapper.text()).not.toContain('Toast 2');
            expect(wrapper.text()).toContain('Toast 3');
        });

        it('should do nothing when hiding non-existent toast', async () => {
            const toastService = createToastService(TestToast);
            const wrapper = shallowMount(toastService.ToastContainerComponent);
            toastService.show({message: 'Toast 1'});
            await nextTick();

            expect(() => toastService.hide('non-existent')).not.toThrow();
            expect(wrapper.findAll('.toast')).toHaveLength(1);
        });
    });

    describe('onClose prop', () => {
        it('should pass onClose handler to toast component', async () => {
            const ClosableToast = defineComponent({
                props: {message: String, onClose: Function},
                emits: ['close'],
                render() {
                    return h('div', {class: 'toast'}, [this.message, h('button', {onClick: this.onClose}, 'Close')]);
                },
            });
            const toastService = createToastService(ClosableToast);
            const wrapper = shallowMount(toastService.ToastContainerComponent);
            toastService.show({message: 'Closable toast'});
            await nextTick();

            await wrapper.find('button').trigger('click');
            await nextTick();

            expect(wrapper.findAll('.toast')).toHaveLength(0);
        });
    });

    describe('isolation', () => {
        it('should create independent toast services', async () => {
            const service1 = createToastService(TestToast);
            const service2 = createToastService(TestToast);
            const wrapper1 = shallowMount(service1.ToastContainerComponent);
            const wrapper2 = shallowMount(service2.ToastContainerComponent);

            service1.show({message: 'Service 1 toast'});
            await nextTick();

            expect(wrapper1.text()).toContain('Service 1 toast');
            expect(wrapper2.text()).not.toContain('Service 1 toast');
        });
    });

    describe('top-layer promotion', () => {
        // Per-test spies — the prototype stubs from installPopoverStubs() get
        // wrapped fresh each test so call counts don't leak across `it` blocks.
        let showSpy: ReturnType<typeof vi.spyOn>;
        let hideSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            showSpy = vi.spyOn(HTMLElement.prototype, 'showPopover');
            hideSpy = vi.spyOn(HTMLElement.prototype, 'hidePopover');
        });

        afterEach(() => {
            // Restore spies so each test sees a clean prototype — vi.spyOn on a
            // shared prototype accumulates wrappers across tests otherwise.
            vi.restoreAllMocks();
        });

        it('should render container with popover="manual" attribute', () => {
            const toastService = createToastService(TestToast);
            const wrapper = shallowMount(toastService.ToastContainerComponent);

            expect(wrapper.attributes('popover')).toBe('manual');
        });

        it('should preserve single-root output (fragment fix from 0.1.1)', () => {
            const toastService = createToastService(TestToast);
            const wrapper = shallowMount(toastService.ToastContainerComponent, {
                attrs: {class: 'toast-stack', 'data-test': 'fallthrough'},
            });

            // Single root with popover attr AND fallthrough attrs landing on it.
            expect(wrapper.element.tagName).toBe('DIV');
            expect(wrapper.attributes('popover')).toBe('manual');
            expect(wrapper.attributes('class')).toBe('toast-stack');
            expect(wrapper.attributes('data-test')).toBe('fallthrough');
        });

        it('should call showPopover when first toast is added', async () => {
            const toastService = createToastService(TestToast);
            shallowMount(toastService.ToastContainerComponent);

            expect(showSpy).not.toHaveBeenCalled();

            toastService.show({message: 'First'});
            await nextTick();

            expect(showSpy).toHaveBeenCalledTimes(1);
        });

        it('should call hidePopover when last toast is removed', async () => {
            const toastService = createToastService(TestToast);
            shallowMount(toastService.ToastContainerComponent);

            const id = toastService.show({message: 'Only'});
            await nextTick();
            expect(hideSpy).not.toHaveBeenCalled();

            toastService.hide(id);
            await nextTick();

            expect(hideSpy).toHaveBeenCalledTimes(1);
        });

        it('should not call showPopover repeatedly while popover is already open', async () => {
            const toastService = createToastService(TestToast);
            shallowMount(toastService.ToastContainerComponent);

            toastService.show({message: 'First'});
            await nextTick();
            toastService.show({message: 'Second'});
            await nextTick();
            toastService.show({message: 'Third'});
            await nextTick();

            expect(showSpy).toHaveBeenCalledTimes(1);
        });

        it('should not call hidePopover when intermediate toast is removed', async () => {
            const toastService = createToastService(TestToast);
            shallowMount(toastService.ToastContainerComponent);

            toastService.show({message: 'First'});
            const middleId = toastService.show({message: 'Middle'});
            toastService.show({message: 'Last'});
            await nextTick();

            toastService.hide(middleId);
            await nextTick();

            expect(hideSpy).not.toHaveBeenCalled();
        });

        it('should call showPopover again after a hide -> show cycle', async () => {
            const toastService = createToastService(TestToast);
            shallowMount(toastService.ToastContainerComponent);

            const firstId = toastService.show({message: 'First'});
            await nextTick();
            expect(showSpy).toHaveBeenCalledTimes(1);

            toastService.hide(firstId);
            await nextTick();
            expect(hideSpy).toHaveBeenCalledTimes(1);

            toastService.show({message: 'Second'});
            await nextTick();
            expect(showSpy).toHaveBeenCalledTimes(2);
        });

        it('should swallow InvalidStateError thrown by showPopover (already open)', async () => {
            showSpy.mockImplementation(() => {
                throw new DOMException('Already open', 'InvalidStateError');
            });
            const toastService = createToastService(TestToast);
            shallowMount(toastService.ToastContainerComponent);

            expect(() => {
                toastService.show({message: 'First'});
            }).not.toThrow();
            await nextTick();

            expect(showSpy).toHaveBeenCalledTimes(1);
        });

        it('should swallow InvalidStateError thrown by hidePopover (already closed)', async () => {
            hideSpy.mockImplementation(() => {
                throw new DOMException('Already hidden', 'InvalidStateError');
            });
            const toastService = createToastService(TestToast);
            shallowMount(toastService.ToastContainerComponent);

            const id = toastService.show({message: 'Only'});
            await nextTick();

            expect(() => {
                toastService.hide(id);
            }).not.toThrow();
            await nextTick();

            expect(hideSpy).toHaveBeenCalledTimes(1);
        });

        it('should retry showPopover on next transition when first attempt threw', async () => {
            // First show throws (e.g. transient state); the failure leaves isOpen false
            // so a subsequent 0 -> 1 transition retries.
            showSpy.mockImplementationOnce(() => {
                throw new DOMException('Transient', 'InvalidStateError');
            });
            const toastService = createToastService(TestToast);
            shallowMount(toastService.ToastContainerComponent);

            const firstId = toastService.show({message: 'First'});
            await nextTick();
            expect(showSpy).toHaveBeenCalledTimes(1);

            // Cycle back to empty so the next show triggers another transition.
            // Because the prior showPopover threw, isOpen is false — hideContainer
            // must early-return and NOT call hidePopover (the popover never opened).
            toastService.hide(firstId);
            await nextTick();
            expect(hideSpy).not.toHaveBeenCalled();

            toastService.show({message: 'Second'});
            await nextTick();
            expect(showSpy).toHaveBeenCalledTimes(2);
        });

        it('should call showPopover on mount when toasts already exist', async () => {
            // Cover the onMounted branch: if a service already has toasts when the
            // container mounts (e.g. show() called before mount), the container
            // promotes itself on mount.
            const toastService = createToastService(TestToast);
            toastService.show({message: 'Pre-mount'});

            shallowMount(toastService.ToastContainerComponent);
            await nextTick();

            expect(showSpy).toHaveBeenCalledTimes(1);
        });
    });
});
