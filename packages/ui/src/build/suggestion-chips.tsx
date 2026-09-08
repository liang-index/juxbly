import { useRef, useState } from 'react'
import { t } from '../copy'

/**
 * Suggestion chips — `docs/UI_SPEC.md` §8 (`↑` `↓` move focus, `Enter` confirms).
 *
 * Chips exist because the first message is the hardest one to write: a user who has never
 * described a need to a browser needs somewhere to start. They are keyboard-navigable with
 * a roving tabindex, so the panel never traps a keyboard user in a mouse affordance, and
 * they disappear once the conversation has started — a suggestion that repeats what the
 * user just said is noise.
 */
export interface SuggestionChip {
  id: string
  label: string
}

export interface SuggestionChipsProps {
  chips: readonly SuggestionChip[]
  onSelect: (label: string) => void
  disabled?: boolean
}

export function SuggestionChips({ chips, onSelect, disabled = false }: SuggestionChipsProps) {
  const [active, setActive] = useState(0)
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

  const move = (delta: number): void => {
    if (chips.length === 0) return
    setActive((current) => {
      const next = Math.min(Math.max(current + delta, 0), chips.length - 1)
      buttons.current[next]?.focus()
      return next
    })
  }

  return (
    <div
      className="jx-chips"
      role="group"
      aria-label={t('build.suggestions.aria')}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          move(1)
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          move(-1)
        }
      }}
    >
      {chips.map((chip, index) => (
        <button
          type="button"
          key={chip.id}
          ref={(node) => {
            buttons.current[index] = node
          }}
          className="jx-chip"
          tabIndex={index === active ? 0 : -1}
          disabled={disabled}
          onClick={() => onSelect(chip.label)}
          onFocus={() => setActive(index)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
