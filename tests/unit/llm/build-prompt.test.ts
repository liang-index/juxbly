import type { LlmStep } from '@juxbly/dsl'
import {
  buildPrompt,
  buildStepMessages,
  DATA_CLOSE_TAG,
  DATA_NOTICE,
  DATA_OPEN_TAG,
  DEFAULT_SYSTEM_PROMPT,
  instructionForStep,
  stringifyData,
} from '@juxbly/llm'
import { describe, expect, it } from 'vitest'
import { INJECTION_SAMPLES, PLAIN_PAGE_TEXT } from '../../fixtures/llm/injection-samples'

/**
 * `docs/ARCHITECTURE.md` §12.3 and `docs/PRODUCT.md` §4.3 / §13: page content is data,
 * never instructions.
 *
 * The assertion that matters is the one on the **system** message: whatever the page
 * said, the standing instruction is byte-identical. A model that can be talked out of
 * its instruction by page text has turned every website into a prompt.
 */

const INSTRUCTION = 'Summarise the data below.'

function messagesFor(data: string): readonly { role: string; content: string }[] {
  return buildPrompt({ system: DEFAULT_SYSTEM_PROMPT, instruction: INSTRUCTION, data })
}

describe('buildPrompt', () => {
  it('delivers system, data and instruction as three separate messages', () => {
    const messages = messagesFor(PLAIN_PAGE_TEXT)

    // Order is part of the contract: the model reads Juxbly's instruction last.
    expect(messages.map((message) => message.role)).toEqual(['system', 'user', 'user'])
    expect(messages[0]?.content).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(messages[2]?.content).toBe(INSTRUCTION)
  })

  it('wraps the data section and says the content inside it is untrusted', () => {
    const data = messagesFor(PLAIN_PAGE_TEXT)[1]?.content ?? ''

    expect(data).toContain(DATA_OPEN_TAG)
    expect(data).toContain(DATA_CLOSE_TAG)
    expect(data).toContain(DATA_NOTICE)
    expect(data).toContain(PLAIN_PAGE_TEXT)
  })

  it('keeps page content out of the system and instruction messages', () => {
    const messages = messagesFor(PLAIN_PAGE_TEXT)

    expect(messages[0]?.content).not.toContain(PLAIN_PAGE_TEXT)
    expect(messages[2]?.content).not.toContain(PLAIN_PAGE_TEXT)
  })

  it.each(INJECTION_SAMPLES)(
    'an injection attempt ($id) stays inside the data section',
    (sample) => {
      const messages = messagesFor(sample.text)
      const rendered = messages.map((message) => message.content).join('\n')

      // The trap: one occurrence only, in the data message. A second appearance in the
      // instruction would mean the page wrote part of our prompt.
      expect(messages[1]?.content).toContain(sample.text)
      expect(messages[0]?.content).toBe(DEFAULT_SYSTEM_PROMPT)
      expect(messages[2]?.content).toBe(INSTRUCTION)
      expect(rendered.split(sample.text)).toHaveLength(2)
    },
  )

  it('does not let an injection attempt change the standing instruction', () => {
    const baseline = messagesFor('')[0]?.content

    for (const sample of INJECTION_SAMPLES) {
      expect(messagesFor(sample.text)[0]?.content).toBe(baseline)
    }
  })
})

describe('instructionForStep', () => {
  const step = (overrides: Partial<LlmStep>): LlmStep =>
    ({ type: 'llm', task: 'summarize', input_from: 'raw_items', output_to: 'summary', ...overrides })

  it('describes each V1 task', () => {
    expect(instructionForStep(step({ task: 'summarize' }))).toMatch(/summar/i)
    expect(instructionForStep(step({ task: 'classify' }))).toMatch(/classif/i)
    expect(instructionForStep(step({ task: 'sentiment' }))).toMatch(/sentiment/i)
    expect(instructionForStep(step({ task: 'translate', target_lang: 'German' }))).toContain('German')
    expect(instructionForStep(step({ task: 'custom', prompt: 'List the prices.' }))).toBe(
      'List the prices.',
    )
  })

  it('refuses a custom task with nothing to say', () => {
    // Sending it anyway would spend the user's tokens on a reply the panel cannot explain.
    expect(() => instructionForStep(step({ task: 'custom' }))).toThrow(/INVALID_REQUEST|nothing to send/)
    expect(() => instructionForStep(step({ task: 'custom', prompt: '   ' }))).toThrow()
  })

  it('refuses a translation with no target language', () => {
    expect(() => instructionForStep(step({ task: 'translate' }))).toThrow()
  })
})

describe('buildStepMessages', () => {
  it('puts the step input in the data section, not in the instruction', () => {
    const input = [{ title: 'Acme Standing Desk', price: '$429.00' }]
    const messages = buildStepMessages(
      { type: 'llm', task: 'summarize', input_from: 'raw_items', output_to: 'summary' },
      input,
    )

    expect(messages[1]?.content).toContain('Acme Standing Desk')
    expect(messages[0]?.content).not.toContain('Acme Standing Desk')
    expect(messages[2]?.content).not.toContain('Acme Standing Desk')
  })

  it('reads structured input back as text', () => {
    expect(stringifyData('already text')).toBe('already text')
    expect(stringifyData([{ a: 1 }])).toContain('"a": 1')
    expect(stringifyData(undefined)).toBe('')
  })
})
