import '@testing-library/jest-dom/vitest';

if (!Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [] });
}

if (!Range.prototype.getBoundingClientRect) {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    value: () => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 })
  });
}
