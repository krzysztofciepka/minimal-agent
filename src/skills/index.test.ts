import { describe, expect, it } from 'bun:test';
import { BUILTIN_SKILLS, getBuiltinSkill } from './index.js';

describe('BUILTIN_SKILLS', () => {
  it('includes both debugging skills with non-empty fields', () => {
    const names = BUILTIN_SKILLS.map(s => s.name).sort();
    expect(names).toEqual(['gke-service-debug', 'transaction-flow-debug']);
    for (const s of BUILTIN_SKILLS) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.content.length).toBeGreaterThan(0);
    }
  });

  it('has unique names', () => {
    const names = BUILTIN_SKILLS.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('getBuiltinSkill returns content by name and undefined otherwise', () => {
    expect(getBuiltinSkill('gke-service-debug')?.content).toContain('gke-service-debug');
    expect(getBuiltinSkill('nope')).toBeUndefined();
  });
});
