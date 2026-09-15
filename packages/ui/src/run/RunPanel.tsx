import type { BrowserAdapter } from '@juxbly/browser'
import type { RunOutcome } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import type { BuildRepair } from '../build/BuildPanel'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createRunCommands } from '../commands/slash-commands'
import { t } from '../copy'
import { mountView } from '../views'
import { ConfigTab } from './config-tab'
import { EmptyState } from './empty-state'
import { ErrorState } from './error-state'
import { ExportActions } from './export-actions'
import { BrokenState } from './broken-state'
import { HealthBadge } from './health-badge'
import { InspectTab } from './inspect-tab'
import { PanelTabs, type RunTab } from './panel-tabs'
import { createRunPorts } from './ports'
import { PromiseLine } from './promise-line'
import { RecipeAction } from '../recipe/recipe-action'
import { repairFromHealth, repairFromUser, RepairEntry } from './repair-entry'
import { ResultHeader } from './result-header'
import { RetentionLine } from './retention-line'
import { createRunSession, type RunSessionState, type RunStepOptions } from './run-session'
import { ViewSwitcher } from './view-switcher'

/**
 * The run panel — `docs/ARCHITECTURE.md` §9.2, `docs/UI_SPEC.md` §7 / §7.3.
 *
 * The panel decides nothing: which tools match, when the model runs, and what the result
 * is all live in `run-session.ts`. This file is the wiring between that machine, the view
 * components (1-4) and the host (the content script, which owns the engine and the DOM).
 *
 * Three things here are easy to get wrong and are therefore called out in place:
 *
 * - **A view switch re-renders local data.** It never touches the session's run path —
 *   only the refresh button may spend tokens (§9.2).
 * - **Esc collapses, it does not clear** (§8). The caller hides the container; the session
 *   and the last result survive.
 * - **The panel carries a `transform` for dragging**, which makes it the containing block
 *   for any `position: fixed` descendant (§7.5). Nothing in this panel is `fixed`, and
 *   nothing may become so without moving out of this subtree.
 */

export interface RunPanelProps {
  adapter: BrowserAdapter
  url: string
  /** The host's engine call: which capabilities exist and where they render is not UI's business. */
  run(tool: ToolDefinition, options: RunStepOptions): Promise<RunOutcome>
  /** Reports the element the render capability mounts into, so the host can expose it as `mountPoint()`. */
  onMountPoint?(element: HTMLElement | null): void
  /**
   * Fired once the matching tools are known. The host uses it to decide what the shortcut
   * opens — the panel does not show itself, because visibility belongs to whoever owns the
   * shadow host.
   */
  onTools?(tools: readonly ToolDefinition[]): void
  onClose?(): void
  onNewTool?(): void
  /**
   * Opens the build flow over an existing tool (stage 1-12). The panel builds the request —
   * preset context message for a breakage, none for a rework — and the host decides how to
   * mount it; the panel itself never mounts a second surface.
   */
  onRepair?(repair: BuildRepair): void
  onDiscarded?(): void
}

export function RunPanel({
  adapter,
  url,
  run,
  onMountPoint,
  onTools,
  onClose,
  onNewTool,
  onRepair,
  onDiscarded,
}: RunPanelProps): ReactNode {
  const ports = useMemo(() => createRunPorts(adapter), [adapter])
  const session = useMemo(
    () =>
      createRunSession({
        ...ports,
        run,
        now: () => new Date().toISOString(),
      }),
    [ports, run],
  )

  const [state, setState] = useState<RunSessionState>(() => session.state())
  const [mountPoint, setMountPoint] = useState<HTMLElement | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  /**
   * Which of the three tabs is open, and whether the version list is expanded.
   *
   * Both live here, not in the tabs or the section, because a command has to be able to
   * set them: a command that kept its own copy of "what is open" would be a second
   * source of truth for the panel's state (edge case: command and panel disagreeing).
   */
  const [tab, setTab] = useState<RunTab>('result')
  const [versionsOpen, setVersionsOpen] = useState(false)
  const drag = useRef<{ x: number; y: number; fromX: number; fromY: number } | null>(null)
  const mountTick = useRef(0)

  const commands = useMemo(
    () =>
      createRunCommands({
        openConfig: () => setTab('config'),
        openInspect: () => setTab('inspect'),
        showVersions: () => {
          setTab('config')
          setVersionsOpen(true)
        },
      }),
    [],
  )

  useEffect(() => session.subscribe(setState), [session])
  useEffect(() => {
    void session.start(url)
  }, [session, url])
  // Leaving the page mid-run cancels it: a half-finished run must never be reported.
  useEffect(() => () => session.cancel(), [session])

  useEffect(() => {
    onMountPoint?.(mountPoint)
  }, [mountPoint, onMountPoint])

  useEffect(() => {
    if (state.tools.length === 0) return
    onTools?.(state.tools)
  }, [state.tools, onTools])

  /**
   * Local re-render of the same data — **no extract, no llm** (§7.1).
   *
   * `mountView` commits synchronously, and calling it from inside a React lifecycle makes
   * React warn; one microtask later is invisible to the user and keeps the console clean.
   * The tick guard drops superseded re-renders when the view is switched quickly.
   */
  useEffect(() => {
    const items = state.items
    if (mountPoint === null || items === null || items.length === 0) return

    const tick = mountTick.current + 1
    mountTick.current = tick

    queueMicrotask(() => {
      if (mountTick.current !== tick) return
      mountView(state.view, { items: [...items], status: 'ready' }, mountPoint)
    })
  }, [mountPoint, state.items, state.view])

  // Esc collapses to the ball; state is never cleared (§8).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const tool = state.tools.find((candidate) => candidate.tool_id === state.activeToolId) ?? null
  // Narrowed once: the broken state needs both the verdict and the tool it belongs to, and
  // `repairFromHealth` must never be handed a `null` tool with a cast to make it compile.
  const broken = state.health?.status === 'broken' ? state.health : null
  const degraded = state.health?.status === 'degraded' ? state.health : null
  const hasData = (state.items?.length ?? 0) > 0
  // The previous result stays on screen while a refresh runs and when a run fails after
  // having succeeded once (§7): blanking the panel would look like data loss.
  const showResult = hasData && (state.phase === 'ready' || state.phase === 'loading' || state.stale)

  const startDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return
    // Buttons in the header stay clickable — dragging is not worth stealing a click.
    if ((event.target as HTMLElement).closest('button') !== null) return
    drag.current = { x: event.clientX, y: event.clientY, fromX: offset.x, fromY: offset.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    const from = drag.current
    if (from === null) return
    setOffset({ x: from.fromX + event.clientX - from.x, y: from.fromY + event.clientY - from.y })
  }

  const endDrag = (): void => {
    drag.current = null
  }

  return (
    <section
      className="jx-panel jx-run-panel"
      data-phase={state.phase}
      aria-label={t('run.aria.panel')}
      // Not persisted on purpose: position memory is explicitly deferred (§14).
      style={
        offset.x === 0 && offset.y === 0
          ? undefined
          : { transform: `translate(${offset.x}px, ${offset.y}px)` }
      }
    >
      <header
        className="jx-panel-head"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="jx-panel-title">{t('extension.name')}</span>
        {onNewTool === undefined ? null : (
          <button type="button" className="jx-link" onClick={onNewTool}>
            {t('run.newTool')}
          </button>
        )}
        <button type="button" className="jx-close" aria-label={t('run.aria.close')} onClick={onClose}>
          ×
        </button>
      </header>

      {state.tools.length > 1 ? (
        <ToolSwitcher
          tools={state.tools}
          activeToolId={state.activeToolId}
          onSelect={(toolId) => void session.selectTool(toolId)}
        />
      ) : null}

      {tool === null ? null : (
        <ResultHeader
          tool={tool}
          at={state.runAt}
          itemCount={state.items?.length ?? 0}
          usage={state.usage}
          now={Date.now()}
        />
      )}

      <PanelTabs tab={tab} onChange={setTab} />

      {degraded !== null && tool !== null ? (
        <HealthBadge
          health={degraded}
          check={state.check}
          onCheck={() => void session.checkNow()}
          {...(onRepair === undefined
            ? {}
            : { onRepair: () => onRepair(repairFromHealth(tool, degraded)) })}
        />
      ) : null}

      {/*
        The result pane is hidden, never unmounted: the render capability draws into an
        element inside it, and unmounting it while a run is still going would take the
        mount point away mid-run (§7.6).
      */}
      <div className="jx-run-body">
        <div className="jx-run-pane" hidden={tab !== 'result'}>
          {broken !== null && tool !== null ? (
            <BrokenState
              health={broken}
              onRepair={
                onRepair === undefined ? undefined : () => onRepair(repairFromHealth(tool, broken))
              }
              onRefresh={() => void session.refresh()}
            />
          ) : null}
          {state.phase === 'loading' ? <p className="jx-run-loading">{t('run.loading')}</p> : null}
          {state.phase === 'empty' ? <EmptyState /> : null}
          {state.phase === 'error' ? (
            <ErrorState error={state.error} onRefresh={() => void session.refresh()} />
          ) : null}
          {state.stale ? <p className="jx-run-stale">{t('run.stale')}</p> : null}
          <div className="jx-run-result" ref={setMountPoint} hidden={!showResult} />
        </div>

        {tab === 'config' && tool !== null ? (
          <ConfigTab
            tool={tool}
            ports={ports}
            commands={commands}
            versionsOpen={versionsOpen}
            onToggleVersions={() => setVersionsOpen(!versionsOpen)}
            onSaved={(_version, definition) => {
              setVersionsOpen(true)
              void session.adoptVersion(tool.tool_id, definition)
            }}
            onRolledBack={() => void session.adoptVersion(tool.tool_id)}
          />
        ) : null}

        {tab === 'inspect' && tool !== null ? (
          <InspectTab tool={tool} trace={state.steps} outputs={state.outputs} />
        ) : null}
      </div>

      <div className="jx-run-actions" hidden={tab !== 'result'}>
        <ViewSwitcher view={state.view} onChange={(view) => session.setView(view)} />
        {tool !== null && hasData && state.phase !== 'loading' ? (
          <ExportActions adapter={adapter} tool={tool} items={state.items ?? []} />
        ) : null}
        {/*
          Recipe export (§10.9.6): shown before anything can leave the browser, because
          desensitisation is pattern-based and the last check is a person reading it.
        */}
        {tool !== null ? (
          <RecipeAction adapter={adapter} tool={tool} items={state.items ?? []} />
        ) : null}
        {/*
          The rework entry (§9.3): the same build flow, opened on purpose, with no preset
          context — the tool may be working fine, and nothing here claims otherwise.
        */}
        {tool !== null && onRepair !== undefined ? (
          <RepairEntry
            label={t('run.repair.rework')}
            disabled={state.phase === 'loading'}
            onStart={() => onRepair(repairFromUser(tool))}
          />
        ) : null}
        <button
          type="button"
          className="jx-chip"
          aria-label={t('run.aria.refresh')}
          disabled={state.phase === 'loading'}
          onClick={() => void session.refresh()}
        >
          {t('run.refresh')}
        </button>
      </div>

      <PromiseLine firstToolBuilt={state.firstToolBuilt} />
      <RetentionLine
        onDiscard={() => {
          void session.discard().then((removed) => {
            if (removed) onDiscarded?.()
          })
        }}
      />
    </section>
  )
}

/** §12 allows several tools on one page: switching swaps the definition that runs. */
function ToolSwitcher({
  tools,
  activeToolId,
  onSelect,
}: {
  tools: readonly ToolDefinition[]
  activeToolId: string | null
  onSelect(toolId: string): void
}): ReactNode {
  return (
    <div className="jx-run-tools" role="group" aria-label={t('run.aria.switchTool')}>
      {tools.map((candidate) => (
        <button
          key={candidate.tool_id}
          type="button"
          className={candidate.tool_id === activeToolId ? 'jx-tab is-active' : 'jx-tab'}
          aria-pressed={candidate.tool_id === activeToolId}
          onClick={() => onSelect(candidate.tool_id)}
        >
          {candidate.name}
        </button>
      ))}
    </div>
  )
}
