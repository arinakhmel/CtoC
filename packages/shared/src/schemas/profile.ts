import { z } from 'zod';
import { LIMITS } from '../limits';

/** US-10/S2: an empty skill is rejected. */
export const skillSchema = z
  .string({ required_error: 'SKILL_EMPTY', invalid_type_error: 'VALIDATION_FAILED' })
  .trim()
  .min(LIMITS.skillLength.min, 'SKILL_EMPTY')
  .max(LIMITS.skillLength.max, 'VALIDATION_FAILED');

/** US-10/S3: at most 20 skills, unique ignoring case. */
export const putSkillsSchema = z.object({
  skills: z
    .array(skillSchema)
    .max(LIMITS.skillsMax, 'SKILLS_LIMIT')
    .refine((skills) => new Set(skills.map((s) => s.toLowerCase())).size === skills.length, {
      message: 'VALIDATION_FAILED',
    }),
});

/**
 * Characters are counted as Unicode code points, the same way as the database CHECK `length(bio) <= 500`
 * (SQLite counts characters). `string.length` would count an emoji such as «💻» as 2 and disagree with the
 * database. Used by the schema and by the live counter in the web form.
 */
export const countCharacters = (text: string): number => Array.from(text).length;

/** US-11/S2: bio up to 500 characters (code points). */
export const updateProfileSchema = z.object({
  bio: z
    .string({ required_error: 'VALIDATION_FAILED', invalid_type_error: 'VALIDATION_FAILED' })
    .refine((bio) => countCharacters(bio) <= LIMITS.bioMax, { message: 'BIO_TOO_LONG' }),
});
