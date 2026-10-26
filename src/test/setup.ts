import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no font engine; font loading failures are exercised in print-font tests.
class TestFontFace { load = vi.fn().mockResolvedValue(this); }
vi.stubGlobal('FontFace', TestFontFace);
if (typeof document !== 'undefined') Object.defineProperty(document, 'fonts', { configurable: true, value: { add: vi.fn(), load: vi.fn().mockResolvedValue([]), ready: Promise.resolve() } });

afterEach(cleanup);
