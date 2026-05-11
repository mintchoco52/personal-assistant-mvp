import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'assistant-mvp-tasks'
const REPEAT_OPTIONS = {
  none: '반복 없음',
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const WEEKDAYS = {
  일: 0,
  일욜: 0,
  일요일: 0,
  월: 1,
  월욜: 1,
  월요일: 1,
  화: 2,
  화욜: 2,
  화요일: 2,
  수: 3,
  수욜: 3,
  수요일: 3,
  목: 4,
  목욜: 4,
  목요일: 4,
  금: 5,
  금욜: 5,
  금요일: 5,
  토: 6,
  토욜: 6,
  토요일: 6,
}

const KOREAN_NUMBERS = {
  한: 1,
  두: 2,
  세: 3,
  네: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
}

function nextWeekday(targetDay) {
  const date = new Date()
  const diff = (targetDay + 7 - date.getDay()) % 7 || 7
  date.setDate(date.getDate() + diff)
  return date
}

function parseAmount(value) {
  return KOREAN_NUMBERS[value] || Number(value)
}

function parseNaturalTask(text) {
  const original = text.trim()
  let normalized = original.replace(/\s+/g, ' ')
  const due = new Date()
  due.setSeconds(0, 0)

  let repeat = 'none'
  let priority = 'medium'
  let remindBefore = 10
  let hasDate = false
  let hasTime = false

  if (/매일|매일마다|매일\s*반복|매일\s*아침|매일\s*저녁/.test(normalized)) repeat = 'daily'
  if (/매주|매주마다|매주\s*반복|매주\s*[일월화수목금토]/.test(normalized)) repeat = 'weekly'
  if (/매월|매달|매월마다|매달마다|매달\s*\d/.test(normalized)) repeat = 'monthly'
  if (/중요|꼭|필수|긴급/.test(normalized)) priority = 'high'
  if (/나중에|언젠가|천천히/.test(normalized)) priority = 'low'

  const remindMatch = normalized.match(/(\d+|한|두|세)\s*(분|시간|일)\s*전(?:에)?/)
  if (remindMatch) {
    const amount = parseAmount(remindMatch[1])
    const unit = remindMatch[2]
    remindBefore = unit === '분' ? amount : unit === '시간' ? amount * 60 : amount * 1440
  }

  const relativeDayMatch = normalized.match(/(\d+|한|두|세)\s*일\s*(뒤|후)/)
  if (relativeDayMatch) {
    due.setDate(due.getDate() + parseAmount(relativeDayMatch[1]))
    hasDate = true
  } else if (/모레/.test(normalized)) {
    due.setDate(due.getDate() + 2)
    hasDate = true
  } else if (/내일|낼/.test(normalized)) {
    due.setDate(due.getDate() + 1)
    hasDate = true
  } else if (/오늘/.test(normalized)) {
    due.setDate(due.getDate())
    hasDate = true
  }

  const monthDayMatch = normalized.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (monthDayMatch) {
    due.setMonth(Number(monthDayMatch[1]) - 1, Number(monthDayMatch[2]))
    if (due < new Date()) due.setFullYear(due.getFullYear() + 1)
    hasDate = true
  }

  const dayOnlyMatch = normalized.match(/(이번달|이번 달|다음달|다음 달)?\s*(\d{1,2})\s*일/)
  if (!monthDayMatch && dayOnlyMatch) {
    const monthHint = dayOnlyMatch[1] || ''
    const day = Number(dayOnlyMatch[2])
    if (/다음/.test(monthHint)) {
      due.setMonth(due.getMonth() + 1, day)
    } else {
      due.setDate(day)
      if (!monthHint && due < new Date()) due.setMonth(due.getMonth() + 1)
    }
    hasDate = true
  }

  const weekdayMatch = normalized.match(/(이번주|다음주|담주|매주)?\s*(일요일|월요일|화요일|수요일|목요일|금요일|토요일|일욜|월욜|화욜|수욜|목욜|금욜|토욜|[일월화수목금토])(?:요일)?/)
  if (weekdayMatch && !monthDayMatch) {
    const target = WEEKDAYS[weekdayMatch[2]]
    const next = nextWeekday(target)
    if (/다음주|담주/.test(weekdayMatch[1] || '')) next.setDate(next.getDate() + 7)
    due.setFullYear(next.getFullYear(), next.getMonth(), next.getDate())
    hasDate = true
  }

  let hour = 18
  let minute = 0
  const relativeHourMatch = normalized.match(/(\d+|한|두|세)\s*시간\s*(뒤|후)/)
  const relativeMinuteMatch = normalized.match(/(\d+|한|두|세)\s*분\s*(뒤|후)/)
  const timeMatch = normalized.match(/(오전|오후|아침|점심|저녁|밤|새벽)?\s*(\d{1,2})\s*(?:시|:)\s*(반|(\d{1,2})\s*분?)?/)
  if (timeMatch) {
    const meridiem = timeMatch[1]
    hour = Number(timeMatch[2])
    minute = timeMatch[3] === '반' ? 30 : Number(timeMatch[4] || 0)
    if ((meridiem === '오후' || meridiem === '점심' || meridiem === '저녁' || meridiem === '밤') && hour < 12) hour += 12
    if ((meridiem === '오전' || meridiem === '아침' || meridiem === '새벽') && hour === 12) hour = 0
    hasTime = true
  } else if (relativeHourMatch) {
    const next = new Date(Date.now() + parseAmount(relativeHourMatch[1]) * 60 * 60000)
    due.setFullYear(next.getFullYear(), next.getMonth(), next.getDate())
    hour = next.getHours()
    minute = next.getMinutes()
    hasDate = true
    hasTime = true
  } else if (relativeMinuteMatch) {
    const next = new Date(Date.now() + parseAmount(relativeMinuteMatch[1]) * 60000)
    due.setFullYear(next.getFullYear(), next.getMonth(), next.getDate())
    hour = next.getHours()
    minute = next.getMinutes()
    hasDate = true
    hasTime = true
  } else if (/아침/.test(normalized)) {
    hour = 8
    hasTime = true
  } else if (/점심/.test(normalized)) {
    hour = 12
    hasTime = true
  } else if (/저녁/.test(normalized)) {
    hour = 19
    hasTime = true
  } else if (/밤/.test(normalized)) {
    hour = 21
    hasTime = true
  }

  due.setHours(hour, minute)
  if (!hasDate && due < new Date()) {
    due.setDate(due.getDate() + 1)
  }

  normalized = normalized
    .replace(/(\d+|한|두|세)\s*(분|시간|일)\s*전(?:에)?/g, '')
    .replace(/(\d+|한|두|세)\s*(분|시간|일)\s*(뒤|후)/g, '')
    .replace(/매일마다|매주마다|매월마다|매달마다|매일|매주|매월|매달|반복/g, '')
    .replace(/오늘|내일|낼|모레|이번주|다음주|담주|이번|다음/g, '')
    .replace(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, '')
    .replace(/(이번달|이번 달|다음달|다음 달)?\s*(\d{1,2})\s*일/g, '')
    .replace(/(일요일|월요일|화요일|수요일|목요일|금요일|토요일|일욜|월욜|화욜|수욜|목욜|금욜|토욜|[일월화수목금토])(?:요일)?/g, '')
    .replace(/(오전|오후|아침|저녁|밤|새벽|점심)?\s*\d{1,2}\s*(?:시|:)\s*(반|\d{0,2}\s*분?)?/g, '')
    .replace(/중요|꼭|필수|긴급|나중에|언젠가|천천히/g, '')
    .replace(/\s*(에|까지|부터)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    title: normalized || original,
    dueAt: toInputDateTime(due),
    remindBefore: String(remindBefore),
    repeat,
    priority,
    summary: `${formatDue(toInputDateTime(due))} · ${REPEAT_OPTIONS[repeat]} · ${remindBefore}분 전`,
    confidence: hasTime ? 'good' : 'time-defaulted',
  }
}

const seedTasks = [
  {
    id: createId(),
    title: '약 먹기',
    notes: '확인할 때까지 오늘 목록에 남겨두기',
    dueAt: nextDateTime(20, 0),
    remindBefore: 10,
    repeat: 'daily',
    priority: 'high',
    done: false,
    notifiedAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: createId(),
    title: '전기요금 확인',
    notes: '납부 여부 체크',
    dueAt: nextDateTime(9, 30, 1),
    remindBefore: 60,
    repeat: 'monthly',
    priority: 'medium',
    done: false,
    notifiedAt: null,
    createdAt: new Date().toISOString(),
  },
]

function nextDateTime(hour, minute, addDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + addDays)
  date.setHours(hour, minute, 0, 0)
  if (date < new Date()) {
    date.setDate(date.getDate() + 1)
  }
  return toInputDateTime(date)
}

function toInputDateTime(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function formatDue(dueAt) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dueAt))
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function endOfToday() {
  const date = startOfToday()
  date.setHours(23, 59, 59, 999)
  return date
}

function getNextRepeatDue(dueAt, repeat) {
  const date = new Date(dueAt)
  if (repeat === 'daily') date.setDate(date.getDate() + 1)
  if (repeat === 'weekly') date.setDate(date.getDate() + 7)
  if (repeat === 'monthly') date.setMonth(date.getMonth() + 1)
  return toInputDateTime(date)
}

function App() {
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : seedTasks
  })
  const [filter, setFilter] = useState('today')
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone,
  )
  const [naturalText, setNaturalText] = useState('')
  const [naturalPreview, setNaturalPreview] = useState(null)
  const [draft, setDraft] = useState({
    title: '',
    notes: '',
    dueAt: nextDateTime(18, 0),
    remindBefore: '10',
    repeat: 'none',
    priority: 'medium',
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault()
      setInstallPrompt(event)
    }

    function handleAppInstalled() {
      setInstallPrompt(null)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      setTasks((current) =>
        current.map((task) => {
          if (task.done || task.notifiedAt) return task

          const due = new Date(task.dueAt)
          const reminderTime = new Date(due.getTime() - Number(task.remindBefore) * 60000)
          if (now < reminderTime) return task

          if (Notification.permission === 'granted') {
            new Notification('잊지 말아야 할 일이 있어요', {
              body: `${task.title} - ${formatDue(task.dueAt)}`,
            })
          }

          return { ...task, notifiedAt: now.toISOString() }
        }),
      )
    }, 30000)

    return () => clearInterval(timer)
  }, [])

  const stats = useMemo(() => {
    const now = new Date()
    const todayEnd = endOfToday()
    return {
      today: tasks.filter((task) => !task.done && new Date(task.dueAt) <= todayEnd).length,
      missed: tasks.filter((task) => !task.done && new Date(task.dueAt) < now).length,
      done: tasks.filter((task) => task.done).length,
    }
  }, [tasks])

  const visibleTasks = useMemo(() => {
    const now = new Date()
    const todayEnd = endOfToday()
    const filtered = tasks.filter((task) => {
      const due = new Date(task.dueAt)
      if (filter === 'missed') return !task.done && due < now
      if (filter === 'upcoming') return !task.done && due > todayEnd
      if (filter === 'done') return task.done
      return !task.done && due <= todayEnd
    })

    return filtered.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
  }, [filter, tasks])

  function updateDraft(event) {
    const { name, value } = event.target
    setDraft((current) => ({ ...current, [name]: value }))
  }

  function fillDraftFromParsed(parsed) {
    setDraft((current) => ({
      ...current,
      title: parsed.title,
      dueAt: parsed.dueAt,
      remindBefore: parsed.remindBefore,
      repeat: parsed.repeat,
      priority: parsed.priority,
    }))
    setNaturalPreview(parsed)
  }

  function applyNaturalText(event) {
    event.preventDefault()
    if (!naturalText.trim()) return

    fillDraftFromParsed(parseNaturalTask(naturalText))
  }

  function buildTaskFromDraft(source) {
    return {
      id: createId(),
      title: source.title.trim(),
      notes: source.notes?.trim() || '',
      dueAt: source.dueAt,
      remindBefore: Number(source.remindBefore),
      repeat: source.repeat,
      priority: source.priority,
      done: false,
      notifiedAt: null,
      createdAt: new Date().toISOString(),
    }
  }

  function addParsedTask(event) {
    event.preventDefault()
    if (!naturalText.trim()) return

    const parsed = parseNaturalTask(naturalText)
    setTasks((current) => [
      buildTaskFromDraft({
        ...draft,
        ...parsed,
      }),
      ...current,
    ])
    setNaturalText('')
    setNaturalPreview(null)
  }

  function addTask(event) {
    event.preventDefault()
    if (!draft.title.trim()) return

    setTasks((current) => [buildTaskFromDraft(draft), ...current])

    setDraft((current) => ({
      ...current,
      title: '',
      notes: '',
      dueAt: nextDateTime(18, 0),
    }))
    setNaturalPreview(null)
  }

  function toggleDone(task) {
    setTasks((current) =>
      current.map((item) => {
        if (item.id !== task.id) return item
        if (!item.done && item.repeat !== 'none') {
          return {
            ...item,
            dueAt: getNextRepeatDue(item.dueAt, item.repeat),
            notifiedAt: null,
          }
        }
        return { ...item, done: !item.done, notifiedAt: null }
      }),
    )
  }

  function snoozeTask(id, minutes) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== id) return task
        const next = new Date(Date.now() + minutes * 60000)
        return { ...task, dueAt: toInputDateTime(next), notifiedAt: null, done: false }
      }),
    )
  }

  function deleteTask(id) {
    setTasks((current) => current.filter((task) => task.id !== id))
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return
    await Notification.requestPermission()
  }

  async function installApp() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null)
    }
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Personal Assistant MVP</p>
          <h1>오늘 잊지 않을 일</h1>
        </div>
        <div className="topbar-actions">
          {installPrompt && !isInstalled && (
            <button className="ghost-button" type="button" onClick={installApp}>
              앱 설치
            </button>
          )}
          <button className="ghost-button" type="button" onClick={requestNotifications}>
            알림 켜기
          </button>
        </div>
      </section>

      <section className="dashboard">
        <article>
          <span>{stats.today}</span>
          오늘 처리
        </article>
        <article>
          <span>{stats.missed}</span>
          놓친 일
        </article>
        <article>
          <span>{stats.done}</span>
          완료
        </article>
      </section>

      <div className="workspace">
        <form className="task-form" onSubmit={addTask}>
          <h2>빠른 추가</h2>
          <div className="natural-box">
            <label>
              자연어 입력
              <input
                value={naturalText}
                onChange={(event) => {
                  setNaturalText(event.target.value)
                  setNaturalPreview(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyNaturalText(event)
                }}
                placeholder="예: 낼 오후3시반 병원 예약 한시간 전"
              />
            </label>
            {naturalPreview && (
              <div className="natural-preview">
                <strong>{naturalPreview.title}</strong>
                <span>{naturalPreview.summary}</span>
                {naturalPreview.confidence === 'time-defaulted' && <em>시간이 없어서 오후 6시로 잡았어요.</em>}
              </div>
            )}
            <div className="natural-actions">
              <button className="ghost-button" type="button" onClick={applyNaturalText}>
                해석하기
              </button>
              <button className="primary-button" type="button" onClick={addParsedTask}>
                바로 추가
              </button>
            </div>
          </div>
          <label>
            할 일
            <input
              name="title"
              value={draft.title}
              onChange={updateDraft}
              placeholder="예: 오후 7시에 약 먹기"
            />
          </label>
          <label>
            메모
            <textarea
              name="notes"
              value={draft.notes}
              onChange={updateDraft}
              placeholder="준비물이나 장소를 적어두기"
            />
          </label>
          <div className="form-grid">
            <label>
              날짜와 시간
              <input name="dueAt" type="datetime-local" value={draft.dueAt} onChange={updateDraft} />
            </label>
            <label>
              미리 알림
              <select name="remindBefore" value={draft.remindBefore} onChange={updateDraft}>
                <option value="0">정각</option>
                <option value="10">10분 전</option>
                <option value="30">30분 전</option>
                <option value="60">1시간 전</option>
                <option value="1440">하루 전</option>
              </select>
            </label>
            <label>
              반복
              <select name="repeat" value={draft.repeat} onChange={updateDraft}>
                {Object.entries(REPEAT_OPTIONS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              중요도
              <select name="priority" value={draft.priority} onChange={updateDraft}>
                <option value="low">낮음</option>
                <option value="medium">보통</option>
                <option value="high">높음</option>
              </select>
            </label>
          </div>
          <button className="primary-button" type="submit">
            추가하기
          </button>
        </form>

        <section className="task-panel">
          <div className="tabs" aria-label="할 일 필터">
            {[
              ['today', '오늘'],
              ['missed', '놓친 일'],
              ['upcoming', '예정'],
              ['done', '완료'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="task-list">
            {visibleTasks.length === 0 ? (
              <div className="empty-state">
                <h2>비어 있어요</h2>
                <p>여기에 뜰 일이 없으면 지금은 한숨 돌려도 돼요.</p>
              </div>
            ) : (
              visibleTasks.map((task) => (
                <article className={`task-card ${task.priority}`} key={task.id}>
                  <div>
                    <p className="task-time">{formatDue(task.dueAt)}</p>
                    <h2>{task.title}</h2>
                    {task.notes && <p className="task-notes">{task.notes}</p>}
                    <p className="task-meta">
                      {REPEAT_OPTIONS[task.repeat]} · {task.remindBefore}분 전 알림
                    </p>
                  </div>
                  <div className="task-actions">
                    {!task.done && (
                      <button type="button" onClick={() => snoozeTask(task.id, 10)}>
                        10분 미루기
                      </button>
                    )}
                    <button type="button" onClick={() => toggleDone(task)}>
                      {task.done ? '되돌리기' : task.repeat === 'none' ? '완료' : '다음 반복'}
                    </button>
                    <button type="button" onClick={() => deleteTask(task.id)}>
                      삭제
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
