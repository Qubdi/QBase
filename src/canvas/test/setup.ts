import '@testing-library/jest-dom/vitest';
// Stubs for what xyflow needs and happy-dom lacks. The canvas tests import this through
// `render.tsx` and `fixtures.ts`, so it never touches other tests.
// xyflow measures with these; happy-dom has neither
// it reports every watched element once, as soon as it is watched, so that
// xyflow measures nodes and handles and draws the lines
class FakeResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
        queueMicrotask(() =>
            this.callback(
                [
                    { target, contentRect: target.getBoundingClientRect() },
                ] as never,
                this as never
            )
        );
    }
    unobserve() {}
    disconnect() {}
}
globalThis.ResizeObserver = FakeResizeObserver as never;

class FakeMatrix {
    m22 = 1;
    constructor(init?: string) {
        const scale = /scale\(([\d.]+)\)/.exec(init ?? '');
        if (scale) this.m22 = Number(scale[1]);
    }
}
globalThis.DOMMatrixReadOnly ??= FakeMatrix as never;

// a canvas that is 1000 by 800 pixels, so nodes count as being on screen
Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { configurable: true, get: () => 1000 },
    offsetHeight: { configurable: true, get: () => 800 },
});

export {};
