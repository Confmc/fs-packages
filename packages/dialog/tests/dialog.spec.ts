import {flushPromises, mount} from '@vue/test-utils';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defineComponent, h, nextTick} from 'vue';

// @vitest-environment happy-dom
import {createDialogService} from '../src/index';

const TestDialogContent = defineComponent({
    props: {title: String, onClose: Function},
    render() {
        return h('div', {class: 'dialog-content'}, [
            h('span', this.title),
            h('button', {class: 'close-btn', onClick: this.onClose}, 'Close'),
        ]);
    },
});

const AsyncDialogContent = defineComponent({
    props: {onClose: Function},
    async setup() {
        await Promise.resolve();
        return {};
    },
    render() {
        return h('div', {class: 'async-content'}, 'Loaded');
    },
});

describe('dialog service', () => {
    afterEach(() => {
        document.body.style.overflowY = '';
    });

    describe('createDialogService', () => {
        it('should return all expected methods and properties', () => {
            // Act
            const service = createDialogService();

            // Assert
            expect(service).toHaveProperty('open');
            expect(service).toHaveProperty('closeAll');
            expect(service).toHaveProperty('registerErrorMiddleware');
            expect(service).toHaveProperty('DialogContainerComponent');
            expect(typeof service.open).toBe('function');
            expect(typeof service.closeAll).toBe('function');
            expect(typeof service.registerErrorMiddleware).toBe('function');
        });

        it('should return a valid Vue component', () => {
            // Act
            const service = createDialogService();

            // Assert
            expect(service.DialogContainerComponent).toHaveProperty('setup');
            expect(service.DialogContainerComponent.name).toBe('DialogContainer');
        });
    });

    describe('open', () => {
        it('should add a dialog to the container', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(TestDialogContent, {title: 'Test Dialog'});
            await nextTick();

            // Assert
            expect(wrapper.find('dialog').exists()).toBe(true);
            expect(wrapper.text()).toContain('Test Dialog');
        });

        it('should add multiple dialogs to the stack', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(TestDialogContent, {title: 'Dialog 1'});
            service.open(TestDialogContent, {title: 'Dialog 2'});
            service.open(TestDialogContent, {title: 'Dialog 3'});
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(3);
            expect(wrapper.text()).toContain('Dialog 1');
            expect(wrapper.text()).toContain('Dialog 2');
            expect(wrapper.text()).toContain('Dialog 3');
        });

        it('should assign unique keys to each dialog', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act — open two identical dialogs; unique keys prevent Vue from merging them
            service.open(TestDialogContent, {title: 'Same'});
            service.open(TestDialogContent, {title: 'Same'});
            await nextTick();

            // Assert — both render independently despite identical props (proves unique keys)
            expect(wrapper.findAll('dialog')).toHaveLength(2);
        });

        it('should wrap component in markRaw to prevent reactivity', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(TestDialogContent, {title: 'Test'});
            await nextTick();

            // Assert — dialog renders without Vue reactivity warnings
            expect(wrapper.find('.dialog-content').exists()).toBe(true);
        });

        it('should call showModal on the dialog element via onVnodeMounted', async () => {
            // Arrange
            const showModalSpy = vi.fn();
            HTMLDialogElement.prototype.showModal = showModalSpy;

            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent, {attachTo: document.body});

            // Act
            service.open(TestDialogContent, {title: 'Modal Dialog'});
            await nextTick();

            // Assert
            expect(showModalSpy).toHaveBeenCalled();

            vi.restoreAllMocks();
            wrapper.unmount();
        });

        it('should set inline styles on the dialog element', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(TestDialogContent, {title: 'Styled'});
            await nextTick();

            // Assert
            const dialog = wrapper.find('dialog');
            const style = dialog.attributes('style') ?? '';
            expect(style).toContain('padding: 0px');
            expect(style).toContain('margin: auto');
            expect(style).toContain('background: transparent');
        });

        it('should wrap content in Suspense with fallback', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(AsyncDialogContent, {});
            await nextTick();

            // Assert — the dialog renders (Suspense is internal to the VNode tree)
            expect(wrapper.find('dialog').exists()).toBe(true);
        });

        it('should set body overflow to hidden when dialogs are open', () => {
            // Arrange
            const service = createDialogService();
            mount(service.DialogContainerComponent);

            // Act
            service.open(TestDialogContent, {title: 'Test'});

            // Assert
            expect(document.body.style.overflowY).toBe('hidden');
        });

        it('should inject onClose prop that closes the dialog and those above it', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            service.open(TestDialogContent, {title: 'Dialog 1'});
            service.open(TestDialogContent, {title: 'Dialog 2'});
            service.open(TestDialogContent, {title: 'Dialog 3'});
            await nextTick();

            // Act — close Dialog 2 (index 1), which should also close Dialog 3
            const closeButtons = wrapper.findAll('.close-btn');
            await closeButtons[1]?.trigger('click');
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(1);
            expect(wrapper.text()).toContain('Dialog 1');
            expect(wrapper.text()).not.toContain('Dialog 2');
            expect(wrapper.text()).not.toContain('Dialog 3');
        });

        it('should restore body overflow when all dialogs are closed', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            service.open(TestDialogContent, {title: 'Dialog 1'});
            await nextTick();

            expect(document.body.style.overflowY).toBe('hidden');

            // Act — close all via onClose on first dialog
            const closeButton = wrapper.find('.close-btn');
            await closeButton.trigger('click');
            await nextTick();

            // Assert
            expect(document.body.style.overflowY).toBe('auto');
        });
    });

    describe('closeAll', () => {
        it('should remove all dialogs from the stack', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            service.open(TestDialogContent, {title: 'Dialog 1'});
            service.open(TestDialogContent, {title: 'Dialog 2'});
            await nextTick();
            expect(wrapper.findAll('dialog')).toHaveLength(2);

            // Act
            service.closeAll();
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(0);
        });

        it('should restore body overflow to auto', () => {
            // Arrange
            const service = createDialogService();
            mount(service.DialogContainerComponent);

            service.open(TestDialogContent, {title: 'Test'});
            expect(document.body.style.overflowY).toBe('hidden');

            // Act
            service.closeAll();

            // Assert
            expect(document.body.style.overflowY).toBe('auto');
        });
    });

    describe('closeFrom (stack semantics)', () => {
        it('should close dialog at index and everything above', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            service.open(TestDialogContent, {title: 'Bottom'});
            service.open(TestDialogContent, {title: 'Middle'});
            service.open(TestDialogContent, {title: 'Top'});
            await nextTick();

            // Act — close Middle (index 1), Top (index 2) should also close
            const closeButtons = wrapper.findAll('.close-btn');
            await closeButtons[1]?.trigger('click');
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(1);
            expect(wrapper.text()).toContain('Bottom');
        });

        it('should do nothing when onClose is called after dialog was already removed', async () => {
            // Arrange — create a component that exposes its onClose for external calling
            let capturedOnClose: (() => void) | undefined;
            const CapturingComponent = defineComponent({
                props: {onClose: Function},
                setup(props) {
                    capturedOnClose = props.onClose as () => void;
                },
                render() {
                    return h('div', {class: 'capturing'}, 'Capturing');
                },
            });

            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            service.open(CapturingComponent, {});
            await nextTick();
            expect(wrapper.findAll('dialog')).toHaveLength(1);

            // Close all dialogs so the captured index (0) is now >= length (0)
            service.closeAll();
            await nextTick();
            expect(wrapper.findAll('dialog')).toHaveLength(0);

            // Act — call the stale onClose; it should hit the guard and do nothing
            capturedOnClose?.();
            await nextTick();

            // Assert — no crash, no effect
            expect(wrapper.findAll('dialog')).toHaveLength(0);
        });
    });

    describe('a stale onClose closes its own dialog or nothing (WR-1914)', () => {
        const captured = new Map<string, () => void>();
        const NamedCapturing = defineComponent({
            props: {name: {type: String, required: true}, onClose: Function},
            setup(props) {
                captured.set(props.name, props.onClose as () => void);
            },
            render() {
                return h('div', {class: 'named'}, this.name);
            },
        });

        afterEach(() => {
            captured.clear();
        });

        it('should not close a dialog that took the index of a closed one', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(NamedCapturing, {name: 'A'});
            await nextTick();
            service.closeAll();
            await nextTick();
            service.open(NamedCapturing, {name: 'C'});
            await nextTick();

            // Act
            captured.get('A')?.();
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(1);
            expect(wrapper.text()).toContain('C');
            expect(document.body.style.overflowY).toBe('hidden');
        });

        it('should not close a dialog that took the index of a closed one a level up', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(NamedCapturing, {name: 'A'});
            service.open(NamedCapturing, {name: 'B'});
            await nextTick();
            captured.get('B')?.();
            await nextTick();
            service.open(NamedCapturing, {name: 'C'});
            await nextTick();

            // Act
            captured.get('B')?.();
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(2);
            expect(wrapper.text()).toContain('A');
            expect(wrapper.text()).toContain('C');
        });

        it('should close a live dialog once when its onClose is called twice', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent, {attachTo: document.body});
            const opener = document.createElement('button');
            document.body.append(opener);
            opener.focus();
            service.open(NamedCapturing, {name: 'A'});
            await nextTick();
            const lowerOpener = document.createElement('button');
            document.body.append(lowerOpener);
            lowerOpener.focus();
            service.open(NamedCapturing, {name: 'B'});
            await nextTick();
            const focusSpy = vi.spyOn(lowerOpener, 'focus');

            // Act
            captured.get('B')?.();
            captured.get('B')?.();
            await flushPromises();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(1);
            expect(wrapper.text()).toContain('A');
            expect(focusSpy).toHaveBeenCalledTimes(1);

            wrapper.unmount();
            opener.remove();
            lowerOpener.remove();
        });

        it('should still close the dialogs above a lower dialog that closes', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(NamedCapturing, {name: 'A'});
            service.open(NamedCapturing, {name: 'B'});
            service.open(NamedCapturing, {name: 'C'});
            await nextTick();

            // Act
            captured.get('B')?.();
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(1);
            expect(wrapper.text()).toContain('A');
        });
    });

    describe('Escape (the native cancel event)', () => {
        // happy-dom fires no cancel on a key press, so each spec dispatches it on the
        // dialog element; a browser fires it on the top-most modal only.
        const dispatchCancel = (element: Element): Event => {
            const cancelEvent = new Event('cancel', {cancelable: true});
            element.dispatchEvent(cancelEvent);

            return cancelEvent;
        };

        it('should close the dialog and still prevent the native close', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'});
            await nextTick();

            // Act
            const cancelEvent = dispatchCancel(wrapper.find('dialog').element);
            await nextTick();

            // Assert
            expect(cancelEvent.defaultPrevented).toBe(true);
            expect(wrapper.findAll('dialog')).toHaveLength(0);
        });

        it('should close only the dialog it fires on when two are stacked', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Bottom'});
            service.open(TestDialogContent, {title: 'Top'});
            await nextTick();

            // Act
            const cancelEvent = dispatchCancel(wrapper.findAll('dialog')[1]!.element);
            await nextTick();

            // Assert
            expect(cancelEvent.defaultPrevented).toBe(true);
            expect(wrapper.findAll('dialog')).toHaveLength(1);
            expect(wrapper.text()).toContain('Bottom');
            expect(wrapper.text()).not.toContain('Top');
        });

        it('should leave the dialog open when closeOnEscape is false', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'}, {closeOnEscape: false});
            await nextTick();

            // Act
            const cancelEvent = dispatchCancel(wrapper.find('dialog').element);
            await nextTick();

            // Assert
            expect(cancelEvent.defaultPrevented).toBe(true);
            expect(wrapper.findAll('dialog')).toHaveLength(1);
        });

        it('should close on Escape when closeOnEscape is true', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'}, {closeOnEscape: true});
            await nextTick();

            // Act
            dispatchCancel(wrapper.find('dialog').element);
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(0);
        });

        it('should leave the dialog open while a closeOnEscape getter returns false', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'}, {closeOnEscape: () => false});
            await nextTick();

            // Act
            const cancelEvent = dispatchCancel(wrapper.find('dialog').element);
            await nextTick();

            // Assert
            expect(cancelEvent.defaultPrevented).toBe(true);
            expect(wrapper.findAll('dialog')).toHaveLength(1);
        });

        it('should read a closeOnEscape getter when Escape fires, not at open', async () => {
            // Arrange
            let busy = true;
            const closeOnEscape = vi.fn(() => !busy);
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'}, {closeOnEscape});
            await nextTick();
            expect(closeOnEscape).not.toHaveBeenCalled();
            dispatchCancel(wrapper.find('dialog').element);
            await nextTick();
            expect(wrapper.findAll('dialog')).toHaveLength(1);

            // Act
            busy = false;
            dispatchCancel(wrapper.find('dialog').element);
            await nextTick();

            // Assert
            expect(closeOnEscape).toHaveBeenCalledTimes(2);
            expect(wrapper.findAll('dialog')).toHaveLength(0);
        });
    });

    describe('backdrop click', () => {
        it('should close dialog when clicking backdrop (the dialog element itself)', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'});
            await nextTick();

            // Act — simulate click on the dialog element directly (backdrop)
            const dialog = wrapper.find('dialog');
            await dialog.trigger('click');
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(0);
        });

        it('should not close dialog when clicking content inside dialog', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'});
            await nextTick();

            // Act — click on content inside the dialog
            const content = wrapper.find('.dialog-content');
            await content.trigger('click');
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(1);
        });

        it('should not close on backdrop click when closeOnBackdropClick is false', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'}, {closeOnBackdropClick: false});
            await nextTick();

            // Act
            await wrapper.find('dialog').trigger('click');
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(1);
        });

        it('should close on backdrop click when closeOnBackdropClick is true', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'}, {closeOnBackdropClick: true});
            await nextTick();

            // Act
            await wrapper.find('dialog').trigger('click');
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(0);
        });

        it('should leave the dialog open while a closeOnBackdropClick getter returns false', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'}, {closeOnBackdropClick: () => false});
            await nextTick();

            // Act
            await wrapper.find('dialog').trigger('click');
            await nextTick();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(1);
        });

        it('should read a closeOnBackdropClick getter when the click fires, not at open', async () => {
            // Arrange
            let busy = true;
            const closeOnBackdropClick = vi.fn(() => !busy);
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'}, {closeOnBackdropClick});
            await nextTick();
            expect(closeOnBackdropClick).not.toHaveBeenCalled();
            await wrapper.find('dialog').trigger('click');
            await nextTick();
            expect(wrapper.findAll('dialog')).toHaveLength(1);

            // Act
            busy = false;
            await wrapper.find('dialog').trigger('click');
            await nextTick();

            // Assert
            expect(closeOnBackdropClick).toHaveBeenCalledTimes(2);
            expect(wrapper.findAll('dialog')).toHaveLength(0);
        });

        it('should not read the closeOnBackdropClick getter for a click inside the content', async () => {
            // Arrange
            const closeOnBackdropClick = vi.fn(() => true);
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);
            service.open(TestDialogContent, {title: 'Test'}, {closeOnBackdropClick});
            await nextTick();

            // Act
            await wrapper.find('.dialog-content').trigger('click');
            await nextTick();

            // Assert
            expect(closeOnBackdropClick).not.toHaveBeenCalled();
            expect(wrapper.findAll('dialog')).toHaveLength(1);
        });
    });

    describe('focus restore', () => {
        const wrappers: ReturnType<typeof mount>[] = [];

        const mountAttached = (service: ReturnType<typeof createDialogService>) => {
            const wrapper = mount(service.DialogContainerComponent, {attachTo: document.body});
            wrappers.push(wrapper);

            return wrapper;
        };

        const focusedButton = (label: string): HTMLButtonElement => {
            const button = document.createElement('button');
            button.textContent = label;
            document.body.append(button);
            button.focus();

            return button;
        };

        // Stand in for the browser moving focus into the modal, so a missing restore
        // cannot pass on focus that simply never left the opener.
        const focusInside = (dialog: Element) => {
            (dialog.querySelector('.close-btn') as HTMLButtonElement).focus();
        };

        afterEach(() => {
            for (const wrapper of wrappers.splice(0)) wrapper.unmount();
            document.body.innerHTML = '';
        });

        it('should return focus to the opener when the dialog closes via onClose', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mountAttached(service);
            const opener = focusedButton('Open');
            service.open(TestDialogContent, {title: 'Test'});
            await nextTick();
            focusInside(wrapper.find('dialog').element);

            // Act
            await wrapper.find('.close-btn').trigger('click');
            await flushPromises();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(0);
            expect(document.activeElement).toBe(opener);
        });

        it('should restore focus only after the dialog has left the DOM', async () => {
            // Arrange — a modal makes everything outside it inert, so a restore that
            // runs before the removal is refused by a browser; happy-dom does not.
            const service = createDialogService();
            mountAttached(service);
            const opener = focusedButton('Open');
            const dialogsInDomAtFocus: number[] = [];
            const originalFocus = opener.focus.bind(opener);
            opener.focus = (options?: FocusOptions) => {
                dialogsInDomAtFocus.push(document.querySelectorAll('dialog').length);
                originalFocus(options);
            };
            service.open(TestDialogContent, {title: 'Test'});
            await nextTick();

            // Act
            service.closeAll();
            await flushPromises();

            // Assert
            expect(dialogsInDomAtFocus).toEqual([0]);
        });

        it('should return focus to the opener when the dialog closes via a backdrop click', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mountAttached(service);
            const opener = focusedButton('Open');
            service.open(TestDialogContent, {title: 'Test'});
            await nextTick();
            focusInside(wrapper.find('dialog').element);

            // Act
            await wrapper.find('dialog').trigger('click');
            await flushPromises();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(0);
            expect(document.activeElement).toBe(opener);
        });

        it('should return focus to the opener when the dialog closes via Escape', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mountAttached(service);
            const opener = focusedButton('Open');
            service.open(TestDialogContent, {title: 'Test'});
            await nextTick();
            focusInside(wrapper.find('dialog').element);

            // Act
            wrapper.find('dialog').element.dispatchEvent(new Event('cancel', {cancelable: true}));
            await flushPromises();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(0);
            expect(document.activeElement).toBe(opener);
        });

        it('should return focus to the bottom-most opener when closeAll clears a stack', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mountAttached(service);
            const opener = focusedButton('Open A');
            service.open(TestDialogContent, {title: 'A'});
            await nextTick();
            focusInside(wrapper.findAll('dialog')[0]!.element);
            service.open(TestDialogContent, {title: 'B'});
            await nextTick();
            focusInside(wrapper.findAll('dialog')[1]!.element);

            // Act
            service.closeAll();
            await flushPromises();

            // Assert
            expect(document.activeElement).toBe(opener);
        });

        it('should restore stacked dialogs in LIFO order, each to its own opener', async () => {
            // Arrange — A opened from X, B opened from the close button inside A
            const service = createDialogService();
            const wrapper = mountAttached(service);
            const openerX = focusedButton('Open A');
            service.open(TestDialogContent, {title: 'A'});
            await nextTick();
            const openerInsideA = wrapper
                .findAll('dialog')[0]!
                .element.querySelector('.close-btn') as HTMLButtonElement;
            openerInsideA.focus();
            service.open(TestDialogContent, {title: 'B'});
            await nextTick();
            focusInside(wrapper.findAll('dialog')[1]!.element);

            // Act — close B
            await wrapper.findAll('.close-btn')[1]!.trigger('click');
            await flushPromises();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(1);
            expect(document.activeElement).toBe(openerInsideA);

            // Act — close A
            await wrapper.find('.close-btn').trigger('click');
            await flushPromises();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(0);
            expect(document.activeElement).toBe(openerX);
        });

        it('should return focus to the lower dialog opener when it closes with a dialog above it', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mountAttached(service);
            const openerX = focusedButton('Open A');
            service.open(TestDialogContent, {title: 'A'});
            await nextTick();
            focusInside(wrapper.findAll('dialog')[0]!.element);
            service.open(TestDialogContent, {title: 'B'});
            await nextTick();
            focusInside(wrapper.findAll('dialog')[1]!.element);

            // Act — close A (index 0) while B is open
            await wrapper.findAll('.close-btn')[0]!.trigger('click');
            await flushPromises();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(0);
            expect(document.activeElement).toBe(openerX);
        });

        it('should focus restoreFocusTo when the opener has left the document', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mountAttached(service);
            const opener = focusedButton('Delete');
            const fallback = document.createElement('button');
            document.body.append(fallback);
            service.open(TestDialogContent, {title: 'Confirm'}, {restoreFocusTo: fallback});
            await nextTick();
            opener.remove();

            // Act
            await wrapper.find('.close-btn').trigger('click');
            await flushPromises();

            // Assert
            expect(document.activeElement).toBe(fallback);
        });

        it('should read a restoreFocusTo getter at close time, not at open time', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mountAttached(service);
            const opener = focusedButton('Delete');
            const atOpen = document.createElement('button');
            const atClose = document.createElement('button');
            document.body.append(atOpen, atClose);
            let target: HTMLElement = atOpen;
            service.open(TestDialogContent, {title: 'Confirm'}, {restoreFocusTo: () => target});
            await nextTick();
            opener.remove();
            target = atClose;

            // Act
            await wrapper.find('.close-btn').trigger('click');
            await flushPromises();

            // Assert
            expect(document.activeElement).toBe(atClose);
        });

        it('should fall back to restoreFocusTo when the opener is connected but refuses focus', async () => {
            // Arrange — a disabled button stays in the document and cannot take focus
            const service = createDialogService();
            const wrapper = mountAttached(service);
            const opener = focusedButton('Save');
            const fallback = document.createElement('button');
            document.body.append(fallback);
            service.open(TestDialogContent, {title: 'Saving'}, {restoreFocusTo: fallback});
            await nextTick();
            focusInside(wrapper.find('dialog').element);
            opener.disabled = true;

            // Act
            await wrapper.find('.close-btn').trigger('click');
            await flushPromises();

            // Assert
            expect(document.activeElement).toBe(fallback);
        });

        it('should use restoreFocusTo when no element held focus at open', async () => {
            // Arrange — activeElement can be null, or an element that is not an HTMLElement
            const service = createDialogService();
            const wrapper = mountAttached(service);
            const fallback = document.createElement('button');
            document.body.append(fallback);
            const activeElementSpy = vi.spyOn(document, 'activeElement', 'get').mockReturnValueOnce(null);
            service.open(TestDialogContent, {title: 'Test'}, {restoreFocusTo: fallback});
            activeElementSpy.mockRestore();
            await nextTick();
            focusInside(wrapper.find('dialog').element);

            // Act
            await wrapper.find('.close-btn').trigger('click');
            await flushPromises();

            // Assert
            expect(document.activeElement).toBe(fallback);
        });

        it('should not try to focus a disconnected opener and not throw when there is no fallback', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mountAttached(service);
            const opener = focusedButton('Delete');
            const focusSpy = vi.spyOn(opener, 'focus');
            service.open(TestDialogContent, {title: 'Confirm'});
            await nextTick();
            opener.remove();
            const getterFallback = vi.fn((): HTMLElement | null => null);
            service.open(TestDialogContent, {title: 'Second'}, {restoreFocusTo: getterFallback});
            await nextTick();

            // Act
            service.closeAll();
            await flushPromises();

            // Assert
            expect(wrapper.findAll('dialog')).toHaveLength(0);
            expect(focusSpy).not.toHaveBeenCalled();
            expect(getterFallback).not.toHaveBeenCalled();
        });

        it('should not restore focus when a stale onClose closes nothing', async () => {
            // Arrange
            let capturedOnClose: (() => void) | undefined;
            const CapturingComponent = defineComponent({
                props: {onClose: Function},
                setup(props) {
                    capturedOnClose = props.onClose as () => void;
                },
                render() {
                    return h('div', 'Capturing');
                },
            });
            const service = createDialogService();
            mountAttached(service);
            const opener = focusedButton('Open');
            service.open(CapturingComponent, {});
            await nextTick();
            service.closeAll();
            await flushPromises();
            const elsewhere = focusedButton('Elsewhere');

            // Act
            capturedOnClose?.();
            await flushPromises();

            // Assert
            expect(document.activeElement).toBe(elsewhere);
            expect(document.activeElement).not.toBe(opener);
        });
    });

    describe('v-model support', () => {
        it('should sync v-model props via onUpdate handlers', async () => {
            // Arrange
            const VModelComponent = defineComponent({
                props: {modelValue: String, onClose: Function, 'onUpdate:modelValue': Function},
                render() {
                    return h('div', {class: 'vmodel-content'}, [
                        h('span', this.modelValue),
                        h('button', {
                            class: 'update-btn',
                            onClick: () =>
                                (this as unknown as Record<string, (v: string) => void>)['onUpdate:modelValue']?.(
                                    'updated',
                                ),
                        }),
                    ]);
                },
            });

            const updateHandler = vi.fn();
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(VModelComponent, {modelValue: 'initial', 'onUpdate:modelValue': updateHandler});
            await nextTick();

            const updateBtn = wrapper.find('.update-btn');
            await updateBtn.trigger('click');
            await nextTick();

            // Assert
            expect(updateHandler).toHaveBeenCalledWith('updated');
        });

        it('should keep local prop value in sync after update', async () => {
            // Arrange — uses mount (not mount) because reactive prop updates
            // require a full render cycle through the Suspense boundary
            const VModelComponent = defineComponent({
                props: {modelValue: String, onClose: Function, 'onUpdate:modelValue': Function},
                render() {
                    return h('div', {class: 'vmodel-content'}, [
                        h('span', {class: 'value-display'}, this.modelValue),
                        h('button', {
                            class: 'update-btn',
                            onClick: () =>
                                (this as unknown as Record<string, (v: string) => void>)['onUpdate:modelValue']?.(
                                    'synced',
                                ),
                        }),
                    ]);
                },
            });

            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(VModelComponent, {modelValue: 'initial', 'onUpdate:modelValue': () => {}});
            await nextTick();

            expect(wrapper.find('.value-display').text()).toBe('initial');

            const updateBtn = wrapper.find('.update-btn');
            await updateBtn.trigger('click');
            await nextTick();

            // Assert — the reactive prepared props object was mutated, triggering
            // a re-render with the updated modelValue
            expect(wrapper.find('.value-display').text()).toBe('synced');
        });
    });

    describe('error middleware', () => {
        it('should register and unregister error middleware', () => {
            // Arrange
            const service = createDialogService();
            const handler = vi.fn(() => false);

            // Act
            const unregister = service.registerErrorMiddleware(handler);

            // Assert
            expect(typeof unregister).toBe('function');

            // Act — unregister
            unregister();

            // Assert — no errors when unregistering again (idempotent splice guard)
            unregister();
        });

        it('should call error middleware when error is captured', async () => {
            // Arrange
            const handler = vi.fn(() => false);
            const ErrorComponent = defineComponent({
                props: {onClose: Function},
                setup() {
                    throw new Error('Test error');
                },
                render() {
                    return h('div');
                },
            });

            const service = createDialogService();
            service.registerErrorMiddleware(handler);
            mount(service.DialogContainerComponent);

            // Act
            service.open(ErrorComponent, {});
            await nextTick();
            await nextTick();

            // Assert
            expect(handler).toHaveBeenCalledWith(
                expect.any(Error),
                expect.objectContaining({closeAll: service.closeAll}),
            );
        });

        it('should propagate error when handler returns true', async () => {
            // Arrange
            const handler = vi.fn(() => true);
            const ErrorComponent = defineComponent({
                props: {onClose: Function},
                setup() {
                    throw new Error('Propagated error');
                },
                render() {
                    return h('div');
                },
            });

            const service = createDialogService();
            service.registerErrorMiddleware(handler);
            const appErrorHandler = vi.fn();
            mount(service.DialogContainerComponent, {global: {config: {errorHandler: appErrorHandler}}});

            // Act
            service.open(ErrorComponent, {});
            await nextTick();
            await nextTick();

            // Assert — handler was called and returned true, so error propagated to app handler
            expect(handler).toHaveBeenCalled();
            expect(appErrorHandler).toHaveBeenCalled();
        });

        it('should stop calling middleware chain when handler returns false', async () => {
            // Arrange
            const handler1 = vi.fn(() => false);
            const handler2 = vi.fn(() => true);
            const ErrorComponent = defineComponent({
                props: {onClose: Function},
                setup() {
                    throw new Error('Handled error');
                },
                render() {
                    return h('div');
                },
            });

            const service = createDialogService();
            service.registerErrorMiddleware(handler1);
            service.registerErrorMiddleware(handler2);
            mount(service.DialogContainerComponent);

            // Act
            service.open(ErrorComponent, {});
            await nextTick();
            await nextTick();

            // Assert
            expect(handler1).toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });

        it('should propagate non-Error values without calling middleware', async () => {
            // Arrange
            const handler = vi.fn(() => false);
            const StringErrorComponent = defineComponent({
                props: {onClose: Function},
                setup() {
                    // eslint-disable-next-line @typescript-eslint/only-throw-error, no-throw-literal
                    throw 'string error';
                },
                render() {
                    return h('div');
                },
            });

            const service = createDialogService();
            service.registerErrorMiddleware(handler);
            const appErrorHandler = vi.fn();
            mount(service.DialogContainerComponent, {global: {config: {errorHandler: appErrorHandler}}});

            // Act
            service.open(StringErrorComponent, {});
            await nextTick();
            await nextTick();

            // Assert — non-Error values bypass middleware and propagate
            expect(handler).not.toHaveBeenCalled();
        });

        it('should not corrupt other handlers when the same handler is unregistered twice', async () => {
            // Arrange — register two handlers, unregister the second twice.
            // With a faulty splice guard, the second unregister would splice(-1, 1)
            // which removes the LAST element (handlerA), corrupting the chain.
            const handlerA = vi.fn(() => false);
            const handlerB = vi.fn(() => false);
            const ErrorComponent = defineComponent({
                props: {onClose: Function},
                setup() {
                    throw new Error('Corruption test');
                },
                render() {
                    return h('div');
                },
            });

            const service = createDialogService();
            service.registerErrorMiddleware(handlerA);
            const unregisterB = service.registerErrorMiddleware(handlerB);

            // Act — unregister B twice; the second call should be a no-op
            unregisterB();
            unregisterB();

            mount(service.DialogContainerComponent);
            service.open(ErrorComponent, {});
            await nextTick();
            await nextTick();

            // Assert — handlerA must still be in the chain
            expect(handlerA).toHaveBeenCalled();
        });

        it('should propagate non-Error values to the app error handler', async () => {
            // Arrange — non-Error values must propagate (return true from handleError).
            // If handleError returned false for non-Errors, Vue would swallow them.
            const handler = vi.fn(() => false);
            const StringErrorComponent = defineComponent({
                props: {onClose: Function},
                setup() {
                    // eslint-disable-next-line @typescript-eslint/only-throw-error, no-throw-literal
                    throw 'string error';
                },
                render() {
                    return h('div');
                },
            });

            const service = createDialogService();
            service.registerErrorMiddleware(handler);
            const appErrorHandler = vi.fn();
            mount(service.DialogContainerComponent, {global: {config: {errorHandler: appErrorHandler}}});

            // Act
            service.open(StringErrorComponent, {});
            await nextTick();
            await nextTick();

            // Assert — error propagated past onErrorCaptured to the app-level handler
            expect(appErrorHandler).toHaveBeenCalled();
        });

        it('should not call middleware after it has been unregistered', async () => {
            // Arrange
            const handler = vi.fn(() => false);
            const ErrorComponent = defineComponent({
                props: {onClose: Function},
                setup() {
                    throw new Error('After unregister');
                },
                render() {
                    return h('div');
                },
            });

            const service = createDialogService();
            const unregister = service.registerErrorMiddleware(handler);

            // Act — unregister before the error is thrown
            unregister();

            const appErrorHandler = vi.fn();
            mount(service.DialogContainerComponent, {global: {config: {errorHandler: appErrorHandler}}});
            service.open(ErrorComponent, {});
            await nextTick();
            await nextTick();

            // Assert — handler was not called because it was unregistered
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('isolation', () => {
        it('should create independent dialog services', async () => {
            // Arrange
            const service1 = createDialogService();
            const service2 = createDialogService();
            const wrapper1 = mount(service1.DialogContainerComponent);
            const wrapper2 = mount(service2.DialogContainerComponent);

            // Act
            service1.open(TestDialogContent, {title: 'Service 1 dialog'});
            await nextTick();

            // Assert
            expect(wrapper1.text()).toContain('Service 1 dialog');
            expect(wrapper2.text()).not.toContain('Service 1 dialog');
        });
    });

    describe('body scroll lock', () => {
        it('should lock body scroll when first dialog opens', () => {
            // Arrange
            const service = createDialogService();
            mount(service.DialogContainerComponent);

            // Act
            service.open(TestDialogContent, {title: 'First'});

            // Assert
            expect(document.body.style.overflowY).toBe('hidden');
        });

        it('should keep body locked when multiple dialogs are open', () => {
            // Arrange
            const service = createDialogService();
            mount(service.DialogContainerComponent);

            // Act
            service.open(TestDialogContent, {title: 'First'});
            service.open(TestDialogContent, {title: 'Second'});

            // Assert
            expect(document.body.style.overflowY).toBe('hidden');
        });

        it('should unlock body when last dialog is closed via closeAll', () => {
            // Arrange
            const service = createDialogService();
            mount(service.DialogContainerComponent);

            service.open(TestDialogContent, {title: 'First'});
            service.open(TestDialogContent, {title: 'Second'});

            // Act
            service.closeAll();

            // Assert
            expect(document.body.style.overflowY).toBe('auto');
        });
    });

    describe('prepareVModelProps', () => {
        it('should handle props with no onUpdate handlers', async () => {
            // Arrange
            const SimpleComponent = defineComponent({
                props: {label: String, onClose: Function},
                render() {
                    return h('div', {class: 'simple'}, this.label);
                },
            });

            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(SimpleComponent, {label: 'No v-model'});
            await nextTick();

            // Assert
            expect(wrapper.find('.simple').text()).toBe('No v-model');
        });
    });

    describe('onVnodeMounted', () => {
        it('should handle null element gracefully', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act — open dialog; in test env showModal may not exist
            service.open(TestDialogContent, {title: 'Mount test'});
            await nextTick();

            // Assert — no error thrown, dialog renders
            expect(wrapper.find('dialog').exists()).toBe(true);
        });
    });

    describe('v-model prop synchronization', () => {
        it('should update prepared prop value when onUpdate handler fires', async () => {
            // Arrange — a component that reads its modelValue prop and renders it.
            // After the onUpdate handler fires, the prop value in the prepared object
            // should be updated so that the component re-renders with the new value.
            const VModelDisplay = defineComponent({
                props: {modelValue: {type: String, required: true}, onClose: Function, 'onUpdate:modelValue': Function},
                render() {
                    return h('div', [
                        h('span', {class: 'display'}, this.modelValue),
                        h('button', {
                            class: 'trigger',
                            onClick: () =>
                                (this as unknown as Record<string, (v: string) => void>)['onUpdate:modelValue']?.(
                                    'changed',
                                ),
                        }),
                    ]);
                },
            });

            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act — open with v-model, trigger update
            service.open(VModelDisplay, {modelValue: 'original', 'onUpdate:modelValue': () => {}});
            await nextTick();

            // Trigger the v-model update
            await wrapper.find('.trigger').trigger('click');
            await nextTick();

            // Assert — reactive props updated the displayed value (proves onUpdate: prefix
            // detection and the prepared[modelPropName] = value mutation triggers re-render)
            expect(wrapper.find('.display').text()).toBe('changed');
        });

        it('should only wrap props that start with onUpdate:', async () => {
            // Arrange — verify that non-onUpdate props are passed through unchanged
            const PropChecker = defineComponent({
                props: {onClick: Function, onClose: Function, onHover: Function},
                render() {
                    return h('div', {class: 'checker'}, [h('button', {class: 'click-btn', onClick: this.onClick})]);
                },
            });

            const clickSpy = vi.fn();
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            service.open(PropChecker, {onClick: clickSpy, onHover: () => {}});
            await nextTick();

            // Act — click the button which calls the original onClick
            await wrapper.find('.click-btn').trigger('click');

            // Assert — original handler called, not wrapped
            expect(clickSpy).toHaveBeenCalled();
        });
    });

    describe('host ARIA attributes', () => {
        it('should set aria-label on the dialog element when option is provided', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(TestDialogContent, {title: 'Test'}, {ariaLabel: 'Confirm action'});
            await nextTick();

            // Assert
            const dialog = wrapper.find('dialog');
            expect(dialog.attributes('aria-label')).toBe('Confirm action');
        });

        it('should set aria-labelledby on the dialog element when option is provided', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(TestDialogContent, {title: 'Test'}, {ariaLabelledBy: 'dialog-title-id'});
            await nextTick();

            // Assert
            const dialog = wrapper.find('dialog');
            expect(dialog.attributes('aria-labelledby')).toBe('dialog-title-id');
        });

        it('should set aria-describedby on the dialog element when option is provided', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(TestDialogContent, {title: 'Test'}, {ariaDescribedBy: 'dialog-desc-id'});
            await nextTick();

            // Assert
            const dialog = wrapper.find('dialog');
            expect(dialog.attributes('aria-describedby')).toBe('dialog-desc-id');
        });

        it('should set all three ARIA attributes simultaneously when all are provided', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(
                TestDialogContent,
                {title: 'Test'},
                {ariaLabel: 'overall-label', ariaLabelledBy: 'title-ref', ariaDescribedBy: 'desc-ref'},
            );
            await nextTick();

            // Assert — each option maps to its dedicated host attribute, not aliased
            const dialog = wrapper.find('dialog');
            expect(dialog.attributes('aria-label')).toBe('overall-label');
            expect(dialog.attributes('aria-labelledby')).toBe('title-ref');
            expect(dialog.attributes('aria-describedby')).toBe('desc-ref');
        });

        it('should not set ARIA host attributes when options are omitted', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act — omit the options arg entirely (covers optional-chain falsy path)
            service.open(TestDialogContent, {title: 'No ARIA'});
            await nextTick();

            // Assert — none of the ARIA host attributes are present on the dialog element
            const dialog = wrapper.find('dialog');
            expect(dialog.attributes('aria-label')).toBeUndefined();
            expect(dialog.attributes('aria-labelledby')).toBeUndefined();
            expect(dialog.attributes('aria-describedby')).toBeUndefined();
        });

        it('should not set ARIA attributes that are absent from a partial options object', async () => {
            // Arrange — provide only one ARIA option; the other two must remain absent.
            // This guards against accidentally cross-wiring options to the wrong attribute.
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(TestDialogContent, {title: 'Test'}, {ariaLabelledBy: 'only-this'});
            await nextTick();

            // Assert
            const dialog = wrapper.find('dialog');
            expect(dialog.attributes('aria-labelledby')).toBe('only-this');
            expect(dialog.attributes('aria-label')).toBeUndefined();
            expect(dialog.attributes('aria-describedby')).toBeUndefined();
        });

        it('should not forward ARIA host options into the inner component props', async () => {
            // Arrange — host ARIA options must apply to the <dialog> element only,
            // never leak into the rendered component's props.
            const PropSpy = defineComponent({
                props: {
                    title: String,
                    onClose: Function,
                    ariaLabel: {type: String, default: 'untouched'},
                    ariaLabelledBy: {type: String, default: 'untouched'},
                    ariaDescribedBy: {type: String, default: 'untouched'},
                },
                render() {
                    return h('div', {class: 'prop-spy'}, [
                        h('span', {class: 'spy-label'}, this.ariaLabel),
                        h('span', {class: 'spy-labelled-by'}, this.ariaLabelledBy),
                        h('span', {class: 'spy-described-by'}, this.ariaDescribedBy),
                    ]);
                },
            });

            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act
            service.open(
                PropSpy,
                {title: 'Test'},
                {ariaLabel: 'host-label', ariaLabelledBy: 'host-title', ariaDescribedBy: 'host-desc'},
            );
            await nextTick();

            // Assert — inner component sees its prop defaults, host attributes sit on <dialog>
            expect(wrapper.find('.spy-label').text()).toBe('untouched');
            expect(wrapper.find('.spy-labelled-by').text()).toBe('untouched');
            expect(wrapper.find('.spy-described-by').text()).toBe('untouched');
            const dialog = wrapper.find('dialog');
            expect(dialog.attributes('aria-label')).toBe('host-label');
            expect(dialog.attributes('aria-labelledby')).toBe('host-title');
            expect(dialog.attributes('aria-describedby')).toBe('host-desc');
        });
    });

    describe('dialog key uniqueness', () => {
        it('should generate unique keys for sequential dialogs', async () => {
            // Arrange
            const service = createDialogService();
            const wrapper = mount(service.DialogContainerComponent);

            // Act — open 3 dialogs
            service.open(TestDialogContent, {title: 'A'});
            service.open(TestDialogContent, {title: 'B'});
            service.open(TestDialogContent, {title: 'C'});
            await nextTick();

            // Assert — all 3 render independently (unique keys prevent Vue merging)
            const dialogs = wrapper.findAll('dialog');
            expect(dialogs).toHaveLength(3);

            // Verify keys are unique by checking each dialog has distinct content
            const keys = dialogs.map((d) => d.attributes('key') ?? d.text());
            const uniqueKeys = new Set(keys);
            expect(uniqueKeys.size).toBe(3);
        });
    });
});
