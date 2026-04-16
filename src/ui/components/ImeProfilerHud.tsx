import type { ImeProfilerHudSnapshot } from '../hooks/useImeProfiler'

type ImeProfilerHudProps = {
  snapshot: ImeProfilerHudSnapshot | null
}

function formatProfilerMs(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)} ms`
}

export function ImeProfilerHud({ snapshot }: ImeProfilerHudProps) {
  if (!snapshot) return null

  return (
    <section className='ime-profiler-hud' aria-live='polite' aria-label='IME Profiler HUD'>
      <div className='ime-profiler-hud-title'>IME Profiler</div>
      <div className='ime-profiler-hud-row'>
        <span>Samples</span>
        <strong>{snapshot.paint.count}</strong>
      </div>
      <div className='ime-profiler-hud-row'>
        <span>Update p95</span>
        <strong>{formatProfilerMs(snapshot.update.p95)}</strong>
      </div>
      <div className='ime-profiler-hud-row'>
        <span>Paint p95</span>
        <strong>{formatProfilerMs(snapshot.paint.p95)}</strong>
      </div>
      <div className='ime-profiler-hud-row'>
        <span>Last update</span>
        <strong>{formatProfilerMs(snapshot.lastUpdateMs)}</strong>
      </div>
      <div className='ime-profiler-hud-row'>
        <span>Last paint</span>
        <strong>{formatProfilerMs(snapshot.lastPaintMs)}</strong>
      </div>
      <div className='ime-profiler-hud-row'>
        <span>Long tasks</span>
        <strong>{snapshot.longTaskCount}</strong>
      </div>
    </section>
  )
}
