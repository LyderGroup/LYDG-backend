import { ValueTransformer } from 'typeorm';

export const numericTransformer: ValueTransformer = {
  from(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  },
  to(value: number | string | null | undefined): number | string | null {
    if (value === null || value === undefined) return null;
    return value;
  },
};
 
