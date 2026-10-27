import { describe, expect, it } from 'vitest';
import { putSkillsSchema, updateProfileSchema } from '../src';
import { codesOf } from './helpers';

describe('US-10 skills', () => {
  const skills = (n: number) => Array.from({ length: n }, (_, i) => `skill-${i}`);

  it('US-10 sc.1: up to 20 skills are accepted', () => {
    expect(putSkillsSchema.parse({ skills: ['Java', ' HTML '] }).skills).toEqual(['Java', 'HTML']);
    expect(putSkillsSchema.safeParse({ skills: skills(20) }).success).toBe(true);
  });

  it('US-10 sc.2: an empty skill is rejected with SKILL_EMPTY', () => {
    expect(codesOf(putSkillsSchema, { skills: ['Java', '   '] })).toEqual(['SKILL_EMPTY']);
  });

  it('US-10 sc.3: the 21st skill is rejected with SKILLS_LIMIT', () => {
    expect(codesOf(putSkillsSchema, { skills: skills(21) })).toEqual(['SKILLS_LIMIT']);
  });

  it('US-10 checklist: skills are unique ignoring case', () => {
    expect(codesOf(putSkillsSchema, { skills: ['Java', 'java'] })).toEqual(['VALIDATION_FAILED']);
  });
});

describe('US-11 bio', () => {
  it('US-11 sc.1: a bio of 500 characters is accepted', () => {
    expect(updateProfileSchema.safeParse({ bio: 'a'.repeat(500) }).success).toBe(true);
  });

  it('US-11 sc.2: a bio over 500 characters is rejected with BIO_TOO_LONG', () => {
    expect(codesOf(updateProfileSchema, { bio: 'a'.repeat(501) })).toEqual(['BIO_TOO_LONG']);
  });

  it('US-11 sc.3: emoji and punctuation pass through unchanged', () => {
    const bio = 'Люблю код 💻, дизайн 🎨 і каву ☕!';
    expect(updateProfileSchema.parse({ bio }).bio).toBe(bio);
  });
});
