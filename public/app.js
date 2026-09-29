// Plays one recorded Claude Code session, section by section and beat by beat.
// Every reply, tool call and result shown comes from the session's own output (data/session.js,
// built by capture-runner/build-data.py). Pacing, the spotlight and the walkthrough prose
// (data/walkthrough.js) are editorial; the real time each reply took is shown beneath the console.
(() => {
  const S = window.SESSION
  const NOTES = window.WALKTHROUGH || {}
  const $ = (id) => document.getElementById(id)
  const term = $('term'), log = $('log'), typed = $('typed'), spinner = $('spinner'), latest = $('latest')
  const speeds = [1, 2, 4]
  let speedIdx = 0, playing = true, run = 0, follow = true
  let cur = { scene: 0, beat: -1 } // beat -1 is the question step
  const pace = () => speeds[speedIdx]
  const words = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const md = (s) => window.marked.parse(s, { gfm: true, breaks: true })
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e }
  const nQ = S.scenes.filter((x) => x.prompt).length
  const qNum = (i) => S.scenes.slice(0, i + 1).filter((x) => x.prompt).length
  const beatsOf = (i) => S.scenes[i].beats || []
  const noteOf = (i, k) => { const n = NOTES[S.scenes[i].id]; return !n ? '' : Array.isArray(n) ? n[k] || '' : n[String(k + 1)] || '' }
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
  const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`)
  const SHORT = (n) => `… ${n} more tool calls (searches, file reads, code runs), shortened for time · pause to see every call`

  const PHASES = [['Reconstruct', 's1', 's4'], ['Audit', 's5', 's16'], ['Diagnose', 's17', 's17'], ['Rehearse', 's18', 's19'], ['Repair and retest', 's20', 's21'], ['Decide', 's22', 's23']]
  const idxOf = (id) => S.scenes.findIndex((x) => x.id === id)
  const rail = $('rail')
  PHASES.forEach(([name, a, b]) => {
    const n = idxOf(b) - idxOf(a) + 1
    const btn = el('button', 'phase', `<span class="pname">${name}</span>`)
    btn.type = 'button'; btn.title = `${name}: sections ${qNum(idxOf(a))}–${qNum(idxOf(b))}`
    btn.addEventListener('click', () => go(idxOf(a), -1))
    rail.append(btn)
  })
  function setRail(i) {
    const q = S.scenes[i].prompt ? qNum(i) : 0
    ;[...rail.children].forEach((btn, p) => {
      const a = qNum(idxOf(PHASES[p][1])), b = qNum(idxOf(PHASES[p][2]))
      btn.classList.toggle('on', q >= a && q <= b); btn.classList.toggle('done', q > b)
    })
  }
  let qn = 0
  S.scenes.forEach((s, i) => $('jump').append(new Option(`${s.prompt ? String(++qn).padStart(2, '0') + ' · ' : ''}${s.title}`, i)))

  // ---------- scrolling: follow the lit beat unless the reader has scrolled away
  let programmatic = false
  const setScroll = (y) => { programmatic = true; term.scrollTop = Math.max(0, y); requestAnimationFrame(() => { programmatic = false }) }
  const followEnd = (node) => { if (follow && node) setScroll(node.offsetTop + node.offsetHeight - term.clientHeight + 28) }
  const inspect = (on) => document.body.classList.toggle('inspect', on)
  // Scrolling keeps the focus: the current part stays lit and the rest stays dimmed. Pointing at a dimmed part brightens it (CSS); clicking one makes it the current part.
  term.addEventListener('scroll', () => {
    if (programmatic || !playing) return
    follow = term.scrollHeight - term.scrollTop - term.clientHeight < 40
    latest.hidden = follow
  })
  latest.addEventListener('click', () => { follow = true; latest.hidden = true; followEnd(log.querySelector('.beat.lit')) })

  // ---------- timing that respects pause, speed and navigation
  const sleep = (ms, my) => new Promise((res, rej) => {
    let left = ms
    const step = () => {
      if (my !== run) return rej(new Error('stale'))
      if (!playing) return setTimeout(step, 100)
      const d = Math.min(50, left); left -= d * pace()
      if (left <= 0) return res()
      setTimeout(step, d)
    }
    step()
  })

  // ---------- console pieces
  function toolLines(b) {
    const f = document.createDocumentFragment()
    f.append(el('div', 'tool' + (b.error ? ' err' : ''), `<span class="name">${esc(b.name)}</span>${b.arg ? `<span class="arg">(${esc(b.arg)})</span>` : ''}`))
    if (b.result) f.append(el('div', 'result', `<span class="elbow">⎿  </span><span class="rbody">${esc(b.result)}</span>`))
    return f
  }
  function beatShell(i, k) {
    const node = el('div', 'beat')
    node.dataset.k = String(k)
    node.addEventListener('click', () => { if (!playing) { inspect(false); cur.beat = k; spotlight(k); setPhase(i, k) } })
    return node
  }
  function fillBeat(node, beat, collapse) {
    const tools = beat.blocks.filter((b) => b.kind === 'tool').length
    let t = 0
    for (const b of beat.blocks) {
      if (b.kind === 'text') { node.append(el('div', 'amsg' + (b.cont ? ' cont' : ''), md(b.md))); continue }
      t++
      if (collapse && tools > 10 && t > 4 && t <= tools - 3) { if (t === 5) node.append(el('div', 'note', SHORT(tools - 7))); continue }
      node.append(toolLines(b))
    }
  }
  function spotlight(k) {
    log.querySelectorAll('.beat').forEach((n) => { const j = Number(n.dataset.k); n.classList.toggle('lit', j === k); n.classList.toggle('prev', j === k - 1); n.classList.toggle('past', j < k - 1 || j > k) })
    const u = log.querySelector('.umsg')
    if (u) { u.classList.toggle('past', k >= 0); u.classList.toggle('lit', k === -1) }
  }
  function dots(i, k) {
    const sc = S.scenes[i]
    if (!sc.prompt) return $('dots').replaceChildren()
    const n = beatsOf(i).length
    $('dots').replaceChildren(el('span', 'dot q' + (k === -1 ? ' on' : ' seen'), ''), ...Array.from({ length: n }, (_, j) => el('span', 'dot' + (noteOf(i, j) ? ' core' : '') + (j === k ? ' on' : j < k ? ' seen' : ''), '')))
    $('dots').setAttribute('aria-label', k === -1 ? 'Question' : `Part ${k + 1} of ${n}`)
  }

  // ---------- prose panel
  function setSection(i) {
    const sc = S.scenes[i]
    $('secno').textContent = sc.prompt ? `Section ${String(qNum(i)).padStart(2, '0')} of ${nQ}` : 'Before the review'
    $('title').textContent = sc.title
    $('jump').value = String(i)
    setRail(i)
    document.body.classList.toggle('prelude', !sc.prompt)
    $('provtag').textContent = sc.prompt ? 'Real Claude Code session' : 'Before the review'
    $('meta').textContent = sc.prompt ? `reply took ${fmt(sc.seconds || 0)}${pace() > 1 ? ` · playing ${pace()}×` : ''}` : ''
    $('meta').title = 'Real time the reply took in the recorded session; playback here is paced for reading'
  }
  // Before the answer, the section's framing. During it, a note where one exists; otherwise the title alone, with the terminal carrying the part.
  function setPhase(i, k) {
    const sc = S.scenes[i]
    const answering = !!sc.prompt && k >= 0
    const note = answering ? noteOf(i, k) : ''
    $('why').hidden = answering // during the answer: the note if there is one; otherwise only the section title stays
    $('why').classList.toggle('recede', answering && !note)
    if (!note) $('why').replaceChildren(...(answering ? sc.prose.slice(0, 1) : sc.prose).map((p) => el('p', '', esc(p))), ...(sc.fine && !answering ? [el('p', 'fine', esc(sc.fine))] : []))
    $('note').hidden = !note
    if (note) $('note').replaceChildren(...note.split('\n\n').map((t) => el('p', '', esc(t))))
    $('prose').classList.toggle('answering', answering)
    $('status').textContent = sc.prompt ? (k === -1 ? `Section ${qNum(i)}: question` : `Section ${qNum(i)}, part ${k + 1} of ${beatsOf(i).length}`) : sc.title
    dots(i, k)
    fitProse()
  }
  // The prose keeps one size per role across all screens; a text that does not fit shrinks in steps, and the column scrolls only as a last resort.
  const SCALES = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65] // one size per role; shrink only when a text does not fit
  function fitProse() {
    const pr = $('prose')
    const grow = !pr.classList.contains('answering')
    const fits = () => pr.scrollHeight <= pr.clientHeight + 1
    pr.classList.remove('scrolls')
    let k = 1
    for (const s of SCALES) { if (s > 1 && !grow) continue; k = s; pr.style.setProperty('--k', s); if (fits()) break }
    pr.classList.toggle('scrolls', !fits())
  }
  addEventListener('resize', () => fitProse())
  if (document.fonts) { document.fonts.ready.then(fitProse); document.fonts.addEventListener('loadingdone', fitProse) }
  if (window.ResizeObserver) { let w = 0; new ResizeObserver(([e]) => { if (Math.abs(e.contentRect.width - w) > 1) { w = e.contentRect.width; fitProse() } }).observe($('prose')) }

  // ---------- opening screens: page-authored introduction inside the console (not session output)
  const INTRO = {
    o0: `<div class="prel intro"><div class="pl line dim2" style="--d:200ms">walkthrough_01/</div><div class="pl gap" style="--d:430ms"></div><div class="pl line" style="--d:660ms">Auditing a field-experiment proposal</div><div class="pl line" style="--d:890ms">with an AI agent</div><div class="pl gap" style="--d:1120ms"></div><div class="pl line" style="--d:1350ms">one continuous Claude Code session</div><div class="pl line" style="--d:1580ms">my questions · verbatim replies and tool output</div><div class="pl line" style="--d:1810ms">fictional organization and proposal</div><div class="pl gap" style="--d:2040ms"></div><div class="pl line" style="--d:2270ms">the problem</div><div class="pl tree" style="--d:2500ms">  a funder must decide whether a model deserves more money</div><div class="pl tree" style="--d:2730ms">  the proposal attaches an evaluation that looks ready</div><div class="pl tree" style="--d:2960ms">  its result could favor the model for the wrong reason</div><div class="pl gap" style="--d:3190ms"></div><div class="pl line" style="--d:3420ms">we will</div><div class="pl tree" style="--d:3650ms">  reconstruct what the proposal commits to</div><div class="pl tree" style="--d:3880ms">  trace its claims to sources and research</div><div class="pl tree" style="--d:4110ms">  rehearse possible results before launch</div><div class="pl tree" style="--d:4340ms">  simulate known-truth worlds through its analysis</div><div class="pl tree" style="--d:4570ms">  repair the design and rerun the same tests</div><div class="pl gap" style="--d:4800ms"></div><div class="pl line" style="--d:5030ms">evidence boundary</div><div class="pl tree" style="--d:5260ms">  rehearsal tests the design</div><div class="pl tree" style="--d:5490ms">  the pilot measures the program</div><div class="pl cursor" style="--d:5920ms">▌</div></div>`,
    o1: `<div class="prel"><div class="pl big" style="--d:200ms">A proposal can be complete</div><div class="pl big" style="--d:700ms">and the experiment still unsettled.</div><div class="pl gap" style="--d:1300ms"></div><div class="pl line" style="--d:1600ms">What changes?</div><div class="pl line" style="--d:2000ms">For whom?</div><div class="pl line" style="--d:2400ms">Compared with what?</div><div class="pl line" style="--d:2800ms">Measured how?</div><div class="pl line" style="--d:3200ms">Enough to decide what?</div><div class="pl cursor" style="--d:3800ms">▌</div></div>`,
    o2: `<div class="prel"><div class="pl big" style="--d:200ms">Local Pathways Access Pilot</div><div class="pl gap" style="--d:700ms"></div><div class="pl line" style="--d:900ms">24 communities, 12 launch, 12 comparison</div><div class="pl line" style="--d:1300ms">outcome: verified enrollment</div><div class="pl gap" style="--d:1900ms"></div><div class="pl line" style="--d:2300ms">the campaign worked</div><div class="pl neq" style="--d:2800ms">≠</div><div class="pl line" style="--d:3300ms">the model should scale</div><div class="pl gap" style="--d:3900ms"></div><div class="pl line dim2" style="--d:4300ms">Evidence for what?</div><div class="pl cursor" style="--d:4900ms">▌</div></div>`,
    o3: `<div class="prel"><div class="pl line" style="--d:200ms">Suppose the result is positive.</div><div class="pl line dim2" style="--d:700ms">What would we actually know?</div><div class="pl gap" style="--d:1300ms"></div><div class="pl line" style="--d:1600ms">Suppose there is no detectable effect.</div><div class="pl line dim2" style="--d:2100ms">What would that mean?</div><div class="pl gap" style="--d:2600ms"></div><div class="pl tree" style="--d:2900ms">  no effect?</div><div class="pl tree" style="--d:3300ms">  weak implementation?</div><div class="pl tree" style="--d:3700ms">  wrong outcome?</div><div class="pl tree" style="--d:4100ms">  too short a window?</div><div class="pl tree" style="--d:4500ms">  too little precision?</div><div class="pl gap" style="--d:5100ms"></div><div class="pl line" style="--d:5500ms">If several explanations remain plausible,</div><div class="pl line" style="--d:6000ms">the design is not finished.</div><div class="pl cursor" style="--d:6600ms">▌</div></div>`,
  }
  const intro = (sc) => { if (INTRO[sc.id]) log.innerHTML = INTRO[sc.id] }

  // ---------- static render of any step (used for navigation while paused, and as the base for playback)
  // submitted: for k = -1, show the question already sent (in the log) rather than in the input line
  function renderStep(i, k, submitted = false, collapse = false) {
    const sc = S.scenes[i]
    cur = { scene: i, beat: k }
    setSection(i)
    log.replaceChildren(); typed.textContent = ''; spinner.hidden = true
    document.querySelector('.inputbox').classList.remove('typing')
    if (!sc.prompt) intro(sc)
    if (sc.prompt) {
      if (k === -1 && !submitted) typed.textContent = sc.prompt
      else {
        log.append(el('div', 'umsg', esc(sc.prompt)))
        beatsOf(i).forEach((b, j) => { if (j <= k) { const n = beatShell(i, j); fillBeat(n, b, collapse); log.append(n) } })
      }
    }
    spotlight(k)
    setPhase(i, k)
    follow = true; latest.hidden = true
    const lit = log.querySelector('.beat.lit')
    // the lit part sits a little below the top, so the end of the previous part stays in view, dimmed, as context
    setScroll(lit ? lit.offsetTop - (lit.previousElementSibling ? Math.round(term.clientHeight * 0.22) : 14) : 0)
  }

  // ---------- playback
  async function playFrom(i, k) {
    const my = ++run
    const sc = S.scenes[i]
    cur = { scene: i, beat: k }
    setSection(i)
    try {
      if (!sc.prompt) {
        log.replaceChildren(); typed.textContent = ''; intro(sc); setPhase(i, -1); setScroll(0)
        await sleep(Math.max(9, words(sc.prose.join(' ')) / 3.2 + 3) * 1000, my)
        return advance(my)
      }
      if (k === -1) {
        log.replaceChildren(); typed.textContent = ''; spinner.hidden = true; setScroll(0)
        spotlight(-1); setPhase(i, -1)
        // the question types almost at once, then stays in the input line while the framing is read
        await sleep(1200, my)
        const t0 = Date.now()
        document.querySelector('.inputbox').classList.add('typing')
        if (REDUCED) typed.textContent = sc.prompt
        else for (let c = 0; c < sc.prompt.length; c++) { typed.textContent += sc.prompt[c]; await sleep(sc.prompt[c] === '\n' ? 160 : 15, my) }
        const typedFor = (Date.now() - t0) * pace()
        await sleep(Math.max(1500, Math.min(16, words(sc.prose.join(' ')) / 4.5 + 2) * 1000 - typedFor), my)
        typed.textContent = ''
        document.querySelector('.inputbox').classList.remove('typing')
        log.append(el('div', 'umsg', esc(sc.prompt)))
        spotlight(-1)
        spinner.hidden = false
        await sleep(Math.max(2500, Math.min(6000, words(sc.prompt) * 60)), my)
        return advance(my)
      }
      const beat = beatsOf(i)[k]
      const node = beatShell(i, k); log.append(node)
      spotlight(k); setPhase(i, k)
      spinner.hidden = false
      await typeBeat(node, beat, my, !!noteOf(i, k))
      spinner.hidden = k >= beatsOf(i).length - 1
      await hold(i, k, my)
      return advance(my)
    } catch (e) { if (e.message !== 'stale') throw e }
  }
  async function typeBeat(node, beat, my, noted) {
    const tools = beat.blocks.filter((b) => b.kind === 'tool').length
    let t = 0
    for (const b of beat.blocks) {
      if (b.kind === 'text') {
        const box = el('div', 'amsg' + (b.cont ? ' cont' : '')); node.append(box)
        const src = b.md
        const step = Math.max(noted ? 4 : 14, Math.ceil(src.length / (noted ? 300 : 100))) // noted parts reveal in ≤12 s, others scan in ≤4 s at 1×
        for (let n = REDUCED ? src.length : 0; n < src.length; n += step) { box.innerHTML = md(src.slice(0, n)) + '<span class="tcur">▍</span>'; followEnd(node); await sleep(40, my) }
        box.innerHTML = md(src); followEnd(node)
        await sleep(300, my)
        continue
      }
      t++
      if (tools > 10 && t > 4 && t <= tools - 3) { if (t === 5) { node.append(el('div', 'note', SHORT(tools - 7))); await sleep(1100, my) } continue }
      node.append(toolLines(b)); followEnd(node)
      await sleep(650, my)
    }
  }
  async function hold(i, k, my) {
    const beat = beatsOf(i)[k]
    const text = beat.blocks.map((b) => b.md || '').join(' ')
    const note = noteOf(i, k)
    await sleep((note ? Math.max(7, words(note) / 3.0 + 3) : Math.min(6, 2.5 + words(text) / 120)) * 1000, my)
  }
  function advance(my) {
    if (my !== run) return
    const { scene: i, beat: k } = cur
    if (S.scenes[i].prompt && k < beatsOf(i).length - 1) return playFrom(i, k + 1)
    if (i < S.scenes.length - 1) return playFrom(i + 1, -1)
    setPlaying(false)
  }

  // ---------- navigation
  function go(i, k) {
    inspect(false)
    i = Math.max(0, Math.min(S.scenes.length - 1, i))
    if (!S.scenes[i].prompt) k = -1
    k = Math.min(k, beatsOf(i).length - 1)
    if (!playing) { run++; return renderStep(i, k, true) }
    if (k === -1) return playFrom(i, -1)
    run++
    renderStep(i, k - 1, true, true) // earlier beats already on screen, then type beat k
    playFrom(i, k)
  }
  let present = false
  const core = (i, k) => k === -1 || !!noteOf(i, k)
  function stepBy(d) {
    let { scene: i, beat: k } = cur
    const last = (j) => (S.scenes[j].prompt ? beatsOf(j).length - 1 : -1)
    const one = () => {
      if (d > 0) { if (k < last(i)) k++; else if (i < S.scenes.length - 1) { i++; k = -1 } else return false }
      else if (k > -1) k--
      else if (i > 0) { i--; k = last(i) } else return false
      return true
    }
    // in presenter mode, parts without commentary are passed over (they stay on screen as context)
    do { if (!one()) break } while (present && S.scenes[i].prompt && !core(i, k))
    go(i, k)
  }
  $('present').addEventListener('click', () => {
    present = !present
    $('present').setAttribute('aria-pressed', String(present))
    document.body.classList.toggle('present', present)
    renderStep(cur.scene, cur.beat, true); fitProse()
  })
  function setPlaying(p) {
    playing = p
    $('play').textContent = p ? 'Pause' : 'Play'
    $('play').setAttribute('aria-label', p ? 'Pause' : 'Play')
    document.body.classList.toggle('paused', !p)
    const { scene: i, beat: k } = cur
    run++
    document.querySelector('.inputbox').classList.remove('typing')
    inspect(false)
    if (!p) return renderStep(i, k, true) // paused: the section as it stands, every tool call shown, fully legible
    if (S.scenes[i].prompt && k >= 0) {
      renderStep(i, k, true, true)
      const my = ++run
      sleep(3500, my).then(() => advance(my), () => {})
    } else playFrom(i, k)
  }

  $('play').addEventListener('click', () => setPlaying(!playing))
  $('prev').addEventListener('click', () => stepBy(-1))
  $('next').addEventListener('click', () => stepBy(1))
  $('psec').addEventListener('click', () => go(cur.beat > -1 || !S.scenes[cur.scene].prompt ? cur.scene - (cur.beat > -1 ? 0 : 1) : cur.scene - 1, -1))
  $('nsec').addEventListener('click', () => go(cur.scene + 1, -1))
  $('jump').addEventListener('change', (e) => go(Number(e.target.value), -1))
  $('speed').addEventListener('click', () => { speedIdx = (speedIdx + 1) % speeds.length; $('speed').textContent = `${pace()}×`; setSection(cur.scene) })
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT') return
    if (e.key === ' ') { e.preventDefault(); setPlaying(!playing) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? $('nsec').click() : stepBy(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? $('psec').click() : stepBy(-1) }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTerm(-1) }
    else if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomTerm(1) }
  })

  // ---------- viewer-adjustable terminal text size (remembered in this browser only)
  const TZ = [0.7, 0.78, 0.87, 1, 1.12, 1.25, 1.4] // about 1–2 px per step
  let tz = 3
  try { const raw = localStorage.getItem('rehearsal.tz2'); const v = Number(raw); if (raw !== null && raw !== '' && Number.isInteger(v) && v >= 0 && v < TZ.length) tz = v } catch (e) {}
  function zoomTerm(d) {
    tz = Math.max(0, Math.min(TZ.length - 1, tz + d))
    document.querySelector('.screen').style.setProperty('--tz', TZ[tz])
    $('tzdown').disabled = tz === 0; $('tzup').disabled = tz === TZ.length - 1
    $('tzval').textContent = Math.round(parseFloat(getComputedStyle(term).fontSize)) + 'px'
    try { localStorage.setItem('rehearsal.tz2', String(tz)) } catch (e) {}
  }
  $('tzdown').addEventListener('click', () => zoomTerm(-1))
  $('tzup').addEventListener('click', () => zoomTerm(1))
  zoomTerm(0)

  if (S.cwd) $('cwd').textContent = S.cwd
  const q = new URLSearchParams(location.search)
  const start = Number(q.get('s') || 0), startBeat = q.has('b') ? Number(q.get('b')) : -1
  // ?embed=1: the screen fills its frame, for embedding in another page (no floating edge)
  if (q.get('embed') === '1') document.body.classList.add('embed')
  // ?t=12 sets the terminal type to an exact pixel size, for comparing against a real terminal
  if (Number(q.get('t')) > 0) document.querySelector('.screen').style.setProperty('--tsize', `calc(${Number(q.get('t'))}px * var(--tz, 1))`)
  zoomTerm(0)
  if (q.get('play') === '1' && !REDUCED) playFrom(start, -1)
  else { playing = false; document.body.classList.add('paused'); $('play').textContent = 'Play'; $('play').setAttribute('aria-label', 'Play'); renderStep(start, startBeat, true) }
  window.__player = { go, stepBy, setPlaying, get cur() { return cur } }
})()
