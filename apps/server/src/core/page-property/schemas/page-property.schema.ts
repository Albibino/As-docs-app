import { z } from 'zod';

export const PAGE_PROPERTY_TYPES = [
  'date',
  'number',
  'person',
] as const;
export type PagePropertyType = (typeof PAGE_PROPERTY_TYPES)[number];

export const pagePropertyTypeSchema = z.enum(PAGE_PROPERTY_TYPES);

const dateConfigSchema = z.object({}).strict();
const numberConfigSchema = z.object({}).strict();
const personConfigSchema = z
  .object({ allowMultiple: z.boolean().default(false) })
  .strict();

export const pagePropertyConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('date'), config: dateConfigSchema.default({}) }),
  z.object({
    type: z.literal('number'),
    config: numberConfigSchema.default({}),
  }),
  z.object({
    type: z.literal('person'),
    config: personConfigSchema.default({ allowMultiple: false }),
  }),
]);

const dateValueSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date string')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
    );
  }, 'Expected a valid calendar date');

export function parsePagePropertyConfig(
  type: PagePropertyType,
  config: unknown,
) {
  return pagePropertyConfigSchema.parse({ type, config: config ?? {} }).config;
}

export function parsePagePropertyValue(
  definition: { type: PagePropertyType; config: unknown },
  value: unknown,
): string | number | string[] | null {
  if (value === null) return null;

  switch (definition.type) {
    case 'date':
      return dateValueSchema.parse(value);
    case 'number':
      return z.number().finite().parse(value);
    case 'person': {
      const config = personConfigSchema.parse(definition.config ?? {});
      return config.allowMultiple
        ? z.array(z.string().uuid()).max(50).parse(value)
        : z.string().uuid().parse(value);
    }
  }
}
