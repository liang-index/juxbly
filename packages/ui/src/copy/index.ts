import { en } from './en'

/**
 * The copy bundle UI code consumes. V1 ships `en` only; adding a locale means adding
 * it here and in stage 4-5's switcher, never in a component.
 */
export type Copy = typeof en

export const copy: Copy = en

export { en }
