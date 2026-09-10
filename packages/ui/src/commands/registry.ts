/**
 * The command registry — `docs/UI_SPEC.md` §10, `task/stage-1-16.md` Interfaces.
 *
 * A command is a **name for something that already has a button**. That is the whole
 * design, and `via` is what keeps it honest: a command with no clickable equivalent is
 * the one thing this stage forbids ("no behaviour that can only be reached by typing"),
 * so the equivalent is a required field rather than a comment. A reviewer adding a
 * command has to name the control that does the same thing, and the test asserts the
 * panel actually renders it.
 *
 * `match` exists because the name on a chip and the name a person types are the same
 * string: one parse, one place where "/edit" becomes an action.
 */
export interface SlashCommand {
  /** The literal token, leading slash included — shown on the chip and matched as typed. */
  name: string
  run(): void
  /**
   * The `data-entry` id of the control that does the same thing without typing.
   *
   * Required, and never empty: this is the invariant, not documentation.
   */
  via: string
}

export interface CommandRegistry {
  register(command: SlashCommand): void
  /** Case-insensitive, whitespace-tolerant; `null` when the input is not a command. */
  match(input: string): SlashCommand | null
  /** Every registered command, in registration order — what the chip row draws. */
  all(): readonly SlashCommand[]
}

export function createCommandRegistry(): CommandRegistry {
  const commands: SlashCommand[] = []

  return {
    register(command: SlashCommand): void {
      const existing = commands.findIndex((candidate) => candidate.name === command.name)
      // Re-registering replaces: the panel rebuilds its commands on every render, and a
      // second `/edit` would otherwise be a second chip doing the same thing.
      if (existing >= 0) commands.splice(existing, 1, command)
      else commands.push(command)
    },

    match(input: string): SlashCommand | null {
      const token = input.trim().toLowerCase()
      if (token === '') return null
      return commands.find((command) => command.name.toLowerCase() === token) ?? null
    },

    all(): readonly SlashCommand[] {
      return [...commands]
    },
  }
}
