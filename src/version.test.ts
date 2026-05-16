import { expect, it } from 'bun:test';
import { VERSION } from './version.js';

it('defaults to dev for unversioned builds', () => {
  expect(VERSION).toBe('dev');
});
