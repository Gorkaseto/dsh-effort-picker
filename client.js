/**
 * Effort picker — Client half of the dsh-effort-picker bundle.
 *
 * Adds a sticky effort slider to the bottom of the shipped composer model
 * menu (ui-model-selection's ModelSelect) and hides that menu's Effort row,
 * so effort is chosen only through the slider inside the model menu.
 *
 * The shipped menu offers no extension seat, so the plugin occupies an
 * invisible cell in `conversation.input.right` (the composer row the model
 * seat sits next to), watches its own composer's model trigger, and while
 * the menu card is open portals the slider into it. The card is a flex
 * column, so the footer is pinned last with `order` regardless of how the
 * shipped menu re-renders its own children.
 *
 * - Data and submission ride the same per-session ModelDirectory the shipped
 *   seat and the /model popup use (`ctx.modelDirectories`), so the trigger
 *   label and every other entry reflect a slider change immediately.
 * - The slider snaps to the model's declared levels (plus the provider
 *   default when the adapter names none). A custom-provider model (a route
 *   whose configurable entry is owned by the `llm-pi-ai` namespace) that
 *   declares none offers the generic levels off / low / medium / high;
 *   picking one first declares them with the same `settings.mutate` write the
 *   Models settings page performs (fenced by the describe revision, never
 *   overwriting a hand-tuned level dict), then submits the selection.
 *
 * Styles use only theme tokens under this plugin's `ep-` prefix.
 */
window.__ModuleLoader__.load({
  id: 'dsh-effort-picker',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useRef, useState, useSyncExternalStore } = React
    const { createPortal } = require('react-dom')

    const SLOT = 'conversation.input.right'
    const MODEL_SLOT = 'conversation.input.model'
    const NS = 'dsh-effort-picker'
    const SETTINGS_NS = 'llm-pi-ai'
    /** Marks a shipped menu card this plugin has extended (drives the Effort-row hide rule). */
    const MENU_ATTR = 'data-ep-menu'
    /** Generic levels offered to a custom model that declares none — the set and wire values the Models settings page writes. */
    const GENERIC_LEVELS = ['off', 'low', 'medium', 'high']
    const GENERIC_EFFORTS = { off: null, low: 'low', medium: 'medium', high: 'high' }

    const en = {
      'effort.title': 'Effort',
      'effort.aria': 'Reasoning effort',
      'effort.providerDefault': 'Default',
      'effort.unset': '—',
      'level.off': 'Off',
      'level.minimal': 'Minimal',
      'level.low': 'Low',
      'level.medium': 'Medium',
      'level.high': 'High',
      'level.xhigh': 'Extra high',
      'level.max': 'Max',
      'hint.declare': 'No levels declared yet — picking one declares off, low, medium and high in Settings → Models.',
      'error.inUse': 'This session is held by another writer (another running DSH surface) — try again shortly.',
      'error.conflict': 'The provider’s settings changed while picking — try again.',
      'error.notConfigured': 'This model is not declared in its provider’s settings. Add it under Settings → Models to make its effort levels selectable.',
      'error.action': 'Couldn’t set the effort: {message}',
    }

    const zh = {
      'effort.title': '推理等级',
      'effort.aria': '推理等级',
      'effort.providerDefault': '默认',
      'effort.unset': '—',
      'level.off': '关闭',
      'level.minimal': '极低',
      'level.low': '低',
      'level.medium': '中',
      'level.high': '高',
      'level.xhigh': '超高',
      'level.max': '最高',
      'hint.declare': '尚未声明档位——选择一个档位，会在“设置 → 模型”中声明 off、low、medium、high。',
      'error.inUse': '当前会话已被其他写入方占用（可能是其他正在运行的 DSH）——请稍后重试。',
      'error.conflict': '选择时服务商设置发生了变化——请重试。',
      'error.notConfigured': '该模型未在其服务商设置中声明。请先在“设置 → 模型”中添加它，才能选择思考档位。',
      'error.action': '设置思考力度失败：{message}',
    }

    function errorText(error) {
      return error instanceof Error ? error.message : String(error)
    }

    function remoteError(result) {
      return `${result.error.code}: ${result.error.message}`
    }

    function failureText(outcome, t) {
      if (outcome.code === 'in-use') return t('error.inUse')
      if (outcome.code === 'conflict') return t('error.conflict')
      if (outcome.code === 'not-declared') return t('error.notConfigured')
      return t('error.action', { message: outcome.message ?? outcome.code ?? 'unknown failure' })
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max)
    }

    /** Component-local styles, rendered as a React element so unmounting removes them. */
    const CSS = `
[${MENU_ATTR}] > button[role="menuitem"]:nth-of-type(2) { display: none !important; }
.ep-footer {
  order: 999; flex: none; margin-top: 4px; padding: 10px 12px 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
}
.ep-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.ep-title { font-size: 14px; line-height: 20px; }
.ep-value { color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 20px; }
.ep-hint { margin-top: 8px; color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 16px; }
.ep-error {
  margin-top: 8px; padding: 6px 8px; border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  font-size: 11px; line-height: 16px;
}
.ep-slider {
  position: relative; height: 22px; margin: 0 9px; outline: none;
  cursor: pointer; touch-action: none; user-select: none;
}
.ep-slider[aria-disabled="true"] { cursor: default; opacity: 0.55; }
.ep-track, .ep-fill { position: absolute; top: 50%; height: 4px; margin-top: -2px; border-radius: 2px; }
.ep-track { left: 0; right: 0; background: var(--dsw-alias-border-l2, var(--dsw-alias-border-l1)); }
.ep-fill { left: 0; background: var(--dsw-alias-label-primary); transition: width 140ms cubic-bezier(.2,.9,.3,1.2); }
.ep-tick {
  position: absolute; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%;
  background: var(--dsw-alias-label-dimmed);
}
.ep-tickOn { background: var(--dsw-alias-label-primary); }
.ep-thumb {
  position: absolute; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%;
  background: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 3px var(--dsw-specific-menu, var(--dsw-alias-bg-overlay));
  transition: left 140ms cubic-bezier(.2,.9,.3,1.2), transform 120ms;
}
.ep-dragging .ep-thumb { transform: scale(1.12); }
.ep-slider:focus-visible .ep-thumb { box-shadow: 0 0 0 3px var(--dsw-specific-menu, var(--dsw-alias-bg-overlay)), 0 0 0 5px var(--dsw-alias-border-l3); }
.ep-labels { position: relative; height: 18px; margin: 6px 9px 0; }
.ep-label {
  position: absolute; top: 0; transform: translateX(-50%);
  padding: 0 2px; border: none; background: transparent; cursor: pointer;
  color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 11px; line-height: 18px; white-space: nowrap;
}
.ep-label:first-child:not(:only-child) { transform: translateX(-9px); }
.ep-label:last-child:not(:only-child) { transform: translateX(calc(-100% + 9px)); }
.ep-label:disabled { cursor: default; }
.ep-labelOn { color: var(--dsw-alias-label-primary); font-weight: 600; }
`

    /** Horizontal position (percent) of stop `index` among `count` evenly spaced stops. */
    function stopPercent(index, count) {
      return count <= 1 ? 50 : (index / (count - 1)) * 100
    }

    /**
     * Sticky (snapping) effort slider: the thumb always rests on a stop; drags
     * snap to the nearest one and commit on release; keys commit at once.
     */
    function EffortSlider({ stops, value, disabled, onCommit, onEscape, ariaLabel }) {
      const sliderRef = useRef(null)
      const [drag, setDragState] = useState(null)
      // pointerup and lostpointercapture both end a drag; the ref makes the commit happen once.
      const dragRef = useRef(null)
      const setDrag = (next) => { dragRef.current = next; setDragState(next) }
      const count = stops.length
      const shown = drag ?? value
      const indexAt = (clientX) => {
        const rect = sliderRef.current?.getBoundingClientRect()
        if (rect === undefined || rect.width === 0 || count <= 1) return 0
        return Math.round(clamp((clientX - rect.left) / rect.width, 0, 1) * (count - 1))
      }
      const onPointerDown = (event) => {
        if (disabled || event.button !== 0) return
        event.preventDefault()
        sliderRef.current?.focus()
        sliderRef.current?.setPointerCapture?.(event.pointerId)
        setDrag(indexAt(event.clientX))
      }
      const onPointerMove = (event) => {
        if (dragRef.current === null) return
        const next = indexAt(event.clientX)
        if (next !== dragRef.current) setDrag(next)
      }
      const endDrag = (commit) => {
        if (dragRef.current === null) return
        const picked = dragRef.current
        setDrag(null)
        if (commit && picked !== value) onCommit(picked)
      }
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onEscape()
          return
        }
        if (disabled) return
        const from = value < 0 ? 0 : value
        let next
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = value < 0 ? 0 : from - 1
        else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = value < 0 ? 0 : from + 1
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = count - 1
        else return
        event.preventDefault()
        event.stopPropagation()
        next = clamp(next, 0, count - 1)
        if (next !== value) onCommit(next)
      }
      const percent = shown < 0 ? 0 : stopPercent(shown, count)
      return h('div', null,
        h('div', {
          ref: sliderRef,
          className: `ep-slider${drag !== null ? ' ep-dragging' : ''}`,
          role: 'slider', tabIndex: disabled ? -1 : 0,
          'aria-label': ariaLabel,
          'aria-valuemin': 0, 'aria-valuemax': count - 1,
          'aria-valuenow': shown < 0 ? undefined : shown,
          'aria-valuetext': shown < 0 ? undefined : stops[shown].label,
          'aria-disabled': disabled,
          onPointerDown, onPointerMove,
          onPointerUp: () => { endDrag(true) },
          onPointerCancel: () => { endDrag(false) },
          onLostPointerCapture: () => { endDrag(true) },
          onKeyDown,
        },
          h('div', { className: 'ep-track' }),
          shown < 0 ? null : h('div', { className: 'ep-fill', style: { width: `${percent}%` } }),
          stops.map((stop, index) => h('div', {
            key: stop.key,
            className: `ep-tick${shown >= 0 && index <= shown ? ' ep-tickOn' : ''}`,
            style: { left: `${stopPercent(index, count)}%` },
          })),
          shown < 0 ? null : h('div', { className: 'ep-thumb', style: { left: `${percent}%` } })),
        h('div', { className: 'ep-labels' },
          stops.map((stop, index) => h('button', {
            key: stop.key, type: 'button', tabIndex: -1,
            className: `ep-label${index === shown ? ' ep-labelOn' : ''}`,
            style: { left: `${stopPercent(index, count)}%` },
            disabled,
            // Keep focus where it is: a focus move to null would make the shipped menu's blur handler close it.
            onMouseDown: (event) => { event.preventDefault() },
            onClick: () => { if (index !== value) onCommit(index) },
          }, stop.label))))
    }

    /**
     * Track this composer's shipped model trigger and, while its menu is open,
     * a footer host element appended to that menu card.
     * @param anchorRef - an element inside this composer's tool row.
     * @returns `{ host, trigger }` — the footer host (null while closed) and the trigger button.
     */
    function useShippedMenu(anchorRef) {
      const [found, setFound] = useState({ host: null, trigger: null })
      useEffect(() => {
        const anchor = anchorRef.current
        if (anchor === null) return
        // The model seat is a sibling cell of this slot in the composer's trailing row.
        let modelSlot = null
        for (let node = anchor.parentElement; node !== null && modelSlot === null; node = node.parentElement) {
          modelSlot = node.querySelector(`[data-slot="${MODEL_SLOT}"]`)
        }
        if (modelSlot === null) return
        let host = null
        let menu = null
        const sync = () => {
          const trigger = modelSlot.querySelector('button[aria-haspopup="menu"]')
          const menuId = trigger?.getAttribute('aria-expanded') === 'true' ? trigger.getAttribute('aria-controls') : null
          const nextMenu = menuId === null ? null : document.getElementById(menuId)
          if (nextMenu !== menu) {
            menu?.removeAttribute(MENU_ATTR)
            host?.remove()
            menu = nextMenu
            host = null
            if (menu !== null) {
              host = document.createElement('div')
              host.className = 'ep-footer'
              menu.setAttribute(MENU_ATTR, '')
              menu.appendChild(host)
            }
          } else if (menu !== null && host !== null && !menu.contains(host)) {
            menu.appendChild(host)
          }
          setFound((prev) => prev.host === host && prev.trigger === trigger ? prev : { host, trigger })
        }
        const observer = new MutationObserver(sync)
        observer.observe(modelSlot, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-expanded', 'aria-controls'] })
        sync()
        return () => {
          observer.disconnect()
          menu?.removeAttribute(MENU_ATTR)
          host?.remove()
        }
      }, [anchorRef])
      return found
    }

    /**
     * The invisible composer cell: renders the slider into the shipped model
     * menu while it is open.
     * @param props - injected face: `available`, `t`, `directory`, `select`,
     * `listCustomProviders`, `declareLevels`.
     * @returns an anchor, the styles, and (menu open) the portaled footer.
     */
    function EffortFooter(props) {
      const { available, directory, t } = props
      const anchorRef = useRef(null)
      const { host, trigger } = useShippedMenu(anchorRef)
      const state = useSyncExternalStore((fn) => directory.subscribe(fn), () => directory.getSnapshot())
      const [custom, setCustom] = useState(null)
      const [pending, setPending] = useState(null)
      const [failure, setFailure] = useState(null)
      // Verb identities may change with the seat; handlers read the latest.
      const verbsRef = useRef(props)
      verbsRef.current = props
      const open = host !== null

      const current = state.current
      const currentModel = useMemo(() => {
        if (current === null) return undefined
        const group = state.groups.find((candidate) => candidate.id === current.provider)
        return group?.models.find((candidate) => candidate.id === current.model)
      }, [state.groups, current])
      const reasoning = currentModel?.reasoning
      const hasLevels = reasoning !== undefined && reasoning !== null
        && Array.isArray(reasoning.efforts) && reasoning.efforts.length > 0
      const needsDeclare = !hasLevels && current !== null && custom !== null && custom.has(current.provider)
      const effective = current?.reasoningEffort ?? (hasLevels ? reasoning.defaultEffort : undefined)

      const levelLabel = (levelId) => {
        const key = `level.${levelId}`
        let text
        try { text = t(key) } catch { text = undefined }
        return typeof text === 'string' && text.length > 0 && text !== key ? text : levelId
      }

      const stops = useMemo(() => {
        if (hasLevels) {
          return [
            ...(reasoning.defaultEffort === undefined
              ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }] : []),
            ...reasoning.efforts.map((level) => ({ key: `effort:${level.id}`, effort: level.id, label: level.name })),
          ]
        }
        if (needsDeclare) return GENERIC_LEVELS.map((level) => ({ key: `generic:${level}`, effort: level, label: levelLabel(level) }))
        return []
      }, [hasLevels, needsDeclare, reasoning, t])

      // Custom-provider membership decides whether a level-less model gets the generic slider.
      useEffect(() => {
        if (!open || !available) return
        let cancelled = false
        setFailure(null)
        verbsRef.current.listCustomProviders().then(
          (providers) => { if (!cancelled) setCustom(providers) },
          () => { if (!cancelled) setCustom(new Set()) },
        )
        return () => { cancelled = true }
      }, [open, available])

      // The shipped card places itself from its measured height only on its
      // own state changes; nudge it to re-place when the footer resizes it.
      useEffect(() => {
        if (host === null || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(() => { window.dispatchEvent(new Event('resize')) })
        observer.observe(host)
        return () => { observer.disconnect() }
      }, [host])

      const busy = state.status === 'selecting' || pending !== null
      const visible = available && host !== null && current !== null && stops.length > 0

      // Empty footer collapses so a model without levels shows the shipped card unchanged.
      useEffect(() => {
        if (host !== null) host.style.display = visible ? '' : 'none'
      }, [host, visible])

      const commitEffort = (index) => {
        const stop = stops[index]
        if (stop === undefined || current === null || busy) return
        if (!needsDeclare && stop.effort === effective) return
        const { provider, model } = current
        setFailure(null)
        setPending(index)
        void (async () => {
          try {
            if (needsDeclare) {
              const declared = await verbsRef.current.declareLevels(provider, model)
              if (declared.ok !== true) { setFailure(failureText(declared, t)); return }
            }
            const outcome = await verbsRef.current.select({
              provider,
              model,
              ...(stop.effort === undefined ? {} : { reasoningEffort: stop.effort }),
            })
            if (outcome.ok !== true) setFailure(failureText(outcome, t))
          } catch (error) {
            setFailure(t('error.action', { message: errorText(error) }))
          } finally {
            setPending(null)
          }
        })()
      }

      // The shipped menu toggles on its trigger; clicking it closes the card.
      const closeMenu = () => {
        if (trigger === null) return
        trigger.click()
        trigger.focus()
      }

      let footer = null
      if (visible) {
        const effectiveIndex = stops.findIndex((stop) => stop.effort === effective)
        const shownIndex = pending ?? effectiveIndex
        const shownLabel = shownIndex >= 0 ? stops[shownIndex].label
          : effective !== undefined ? levelLabel(effective) : t('effort.unset')
        footer = createPortal(h(React.Fragment, null,
          h('div', { className: 'ep-head' },
            h('span', { className: 'ep-title' }, t('effort.title')),
            h('span', { className: 'ep-value', 'aria-live': 'polite' }, shownLabel)),
          h(EffortSlider, {
            stops,
            value: shownIndex,
            disabled: busy,
            ariaLabel: t('effort.aria'),
            onCommit: commitEffort,
            onEscape: closeMenu,
          }),
          needsDeclare ? h('div', { className: 'ep-hint' }, t('hint.declare')) : null,
          failure !== null ? h('div', { className: 'ep-error', role: 'alert' }, failure) : null), host)
      }

      return h(React.Fragment, null,
        h('span', { ref: anchorRef, hidden: true }),
        available ? h('style', null, CSS) : null,
        footer)
    }

    return {
      inject: ['locale', 'remote', 'remote.llm', 'remote.settings', 'sessions', 'slots'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-effort-picker: locale dictionaries')
        const t = ctx.locale.bind(NS)
        const remote = ctx.remote

        /** Locate the model's row in the namespace's stored user section. */
        const readModelState = (view, provider, model) => {
          const user = view.user !== null && typeof view.user === 'object' ? view.user : null
          const providersSection = user !== null && typeof user.providers === 'object' && user.providers !== null
            ? user.providers : null
          const profile = providersSection !== null ? providersSection[provider] : undefined
          const models = profile !== null && typeof profile === 'object' && Array.isArray(profile.models)
            ? profile.models : undefined
          if (models === undefined) return undefined
          const index = models.findIndex((row) => row !== null && typeof row === 'object' && row.id === model)
          return index < 0 ? undefined : { models, index }
        }

        /** One describe → mutate attempt that declares the generic levels for the model. */
        const writeEfforts = async (provider, model) => {
          const described = await remote.settings.describe()
          if (described.ok !== true) return { kind: 'refused', message: remoteError(described) }
          const view = described.value.namespaces.find((candidate) => candidate.ns === SETTINGS_NS)
          if (view === undefined) return { kind: 'not-declared' }
          const state = readModelState(view, provider, model)
          if (state === undefined) return { kind: 'not-declared' }
          const { models, index } = state
          // A declared dict is kept: hand-tuned wire spellings survive.
          const existing = models[index].reasoningEfforts
          if (existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
            return { kind: 'written' }
          }
          const value = models.map((row, at) => at === index ? { ...row, reasoningEfforts: GENERIC_EFFORTS } : row)
          const written = await remote.settings.mutate(SETTINGS_NS, [
            { op: 'set', path: ['providers', provider, 'models'], value },
          ], view.revision)
          if (written.ok === true) return { kind: 'written' }
          if (written.error.code === 'settings/conflict') return { kind: 'conflict' }
          return { kind: 'refused', message: remoteError(written) }
        }

        /** Provider ids whose configurable entry the custom-provider namespace owns. */
        const listCustomProviders = async () => {
          const directory = await remote.llm.listConfigurableProviders()
          if (directory.ok !== true) throw new Error(remoteError(directory))
          return new Set(directory.value
            .filter((entry) => entry.settingsNs === SETTINGS_NS)
            .map((entry) => entry.provider))
        }

        /** Declare the generic levels for a model that offers none (one conflict retry). */
        const declareLevels = async (provider, model) => {
          try {
            let outcome = await writeEfforts(provider, model)
            if (outcome.kind === 'conflict') outcome = await writeEfforts(provider, model)
            if (outcome.kind === 'written') return { ok: true }
            if (outcome.kind === 'not-declared') return { ok: false, code: 'not-declared' }
            if (outcome.kind === 'conflict') return { ok: false, code: 'conflict' }
            return { ok: false, message: outcome.message }
          } catch (error) {
            return { ok: false, message: errorText(error) }
          }
        }

        // The shared per-session directory lives on the shipped model-selection
        // plugin's service; the cell follows that service's lifetime.
        ctx.inject(['slots', 'modelDirectories'], (scope) => {
          const models = scope.modelDirectories
          const sessions = scope.sessions
          scope.slots.inject(SLOT, () => scope.slots.register({
            name: SLOT,
            id: 'dsh-effort-picker',
            order: 10,
            inject: (sessionId) => {
              const directory = models.directoryFor(sessionId)
              const available = sessions.subagentAddress(sessionId) === undefined
              return {
                available,
                t,
                directory: directory.store,
                /** Submit a complete selection through the shared directory. */
                select: async (selection) => {
                  if (!available) return { ok: false, message: 'model selection is unavailable for addressed subagent sessions' }
                  try {
                    await directory.select(selection)
                    return { ok: true }
                  } catch (error) {
                    const message = errorText(error)
                    if (message.includes('session/writer-held')) return { ok: false, code: 'in-use' }
                    return { ok: false, message }
                  }
                },
                listCustomProviders,
                declareLevels,
              }
            },
          }, EffortFooter))
        })
      },
    }
  },
})
