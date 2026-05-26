/**
 * @license
 * Copyright 2026 Tiny Agent Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

describe('HelloWorld', () => {
  it('should return a greeting', () => {
    const greeting = 'Hello, World!';
    expect(greeting).toBe('Hello, World!');
  });

  it('should greet with a custom name', () => {
    const name = 'Tiny Agent';
    const greeting = `Hello, ${name}!`;
    expect(greeting).toBe('Hello, Tiny Agent!');
  });

  it('should add two numbers', () => {
    const sum = (a: number, b: number) => a + b;
    expect(sum(1, 2)).toBe(3);
    expect(sum(-1, 1)).toBe(0);
    expect(sum(0, 0)).toBe(0);
  });
});
