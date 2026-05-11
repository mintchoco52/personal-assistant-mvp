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
  일요일: 0,
  월: 1,
  월요일: 1,
  화: 2,
  화요일: 2,
  수: 3,
  수요일: 3,
  목: 4,
  목요일: 4,
  금: 5,
  금요일: 5,
  토: 6,
  토요일: 6,
}

function nextWeekday(targetDay) {
  const date = new Date()
  const diff = (targetDay + 7 - date.getDay()) % 7 || 7
  date.setDate(date.getDate() + diff)
  return date
}

function parseNaturalTask(text) {
  const original = text.trim()
  let normalized = original.replace(/\s+/g, ' ')
  const due = new Date()
  due.setSeconds(0, 0)

  let repeat = 'none'
  let priority = 'medium'
  let remindBefore = 10

  if (/매일|매일마다|매일\s*반복/.test(normalized)) repeat = 'daily'
  if (/매주|매주마다|매주\s*반복/.test(normalized)) repeat = 'weekly'
  if (/매월|매달|매월마다|매달마다/.test(normalized)) repeat = 'monthly'
  if (/중요|꼭|필수|긴급/.test(normalized)) priority = 'high'
  if (/나중에|언젠가|천천히/.test(normalized)) priority = 'low'

  const remindMatch = normalized.match(/(\d+)\s*(분|시간|일)\s*전/)
  if (remindMatch) {
    const amount = Number(remindMatch[1])
    const unit = remindMatch[2]
    remindBefore = unit === '분' ? amount : unit === '시간' ? amount * 60 : amount * 1440
  }

  if (/모레/.test(normalized)) {
    due.setDate(due.getDate() + 2)
  } else if (/내일/.test(normalized)) {
    due.setDate(due.getDate() + 1)
  } else if (/오늘/.test(normalized)) {
    due.setDate(due.getDate())
  }

  const monthDayMatch = normalized.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (monthDayMatch) {
    due.setMonth(Number(monthDayMatch[1]) - 1, Number(monthDayMatch[2]))
    if (due < new Date()) due.setFullYear(due.getFullYear() + 1)
  }

  const weekdayMatch = normalized.match(/(?:이번|다음|매주)?\s*(일요일|월요일|화요일|수요일|목요일|금요일|토요일|[일월화수목금토])(?:요일)?/)
  if (weekdayMatch && !monthDayMatch) {
    const target = WEEKDAYS[weekdayMatch[1]]
    const next = nextWeekday(target)
    due.setFullYear(next.getFullYear(), next.getMonth(), next.getDate())
  }

  let hour = 18
  let minute = 0
  const timeMatch = normalized.match(/(오전|오후|아침|저녁|밤|새벽)?\s*(\d{1,2})\s*(?:시|:)\s*(\d{1,2})?\s*분?/)
  if (timeMatch) {
    const meridiem = timeMatch[1]
    hour = Number(timeMatch[2])
    minute = Number(timeMatch[3] || 0)
    if ((meridiem === '오후' || meridiem === '저녁' || meridiem === '밤') && hour < 12) hour += 12
    if ((meridiem === '오전' || meridiem === '아침' || meridiem === '새벽') && hour === 12) hour = 0
  } else if (/아침/.test(normalized)) {
    hour = 8
  } else if (/점심/.test(normalized)) {
    hour = 12
  } else if (/저녁/.test(normalized)) {
    hour = 19
  } else if (/밤/.test(normalized)) {
    hour = 21
  }

  due.setHours(hour, minute)
  if (!/내일|모레|오늘|월|요일|[일월화수목금토]/.test(normalized) && due < new Date()) {
    due.setDate(due.getDate() + 1)
  }

  normalized = normalized
    .replace(/(\d+)\s*(분|시간|일)\s*전/g, '')
    .replace(/매일마다|매주마다|매월마다|매달마다|매일|매주|매월|매달|반복/g, '')
    .replace(/오늘|내일|모레|이번|다음/g, '')
    .replace(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g, '')
    .replace(/(일요일|월요일|화요일|수요일|목요일|금요일|토요일|[일월화수목금토])(?:요일)?/g, '')
    .replace(/(오전|오후|아침|저녁|밤|새벽|점심)?\s*\d{1,2}\s*(?:시|:)\s*\d{0,2}\s*분?/g, '')
    .replace(/중요|꼭|필수|긴급|나중에|언젠가|천천히/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    title: normalized || original,
    dueAt: toInputDateTime(due),
    remindBefore: String(remindBefore),
    repeat,
    priority,
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

  function applyNaturalText(event) {
    event.preventDefault()
    if (!naturalText.trim()) return

    const parsed = parseNaturalTask(naturalText)
    setDraft((current) => ({
      ...current,
      title: parsed.title,
      dueAt: parsed.dueAt,
      remindBefore: parsed.remindBefore,
      repeat: parsed.repeat,
      priority: parsed.priority,
    }))
  }

  function addTask(event) {
    event.preventDefault()
    if (!draft.title.trim()) return

    setTasks((current) => [
      {
        id: createId(),
        title: draft.title.trim(),
        notes: draft.notes.trim(),
        dueAt: draft.dueAt,
        remindBefore: Number(draft.remindBefore),
        repeat: draft.repeat,
        priority: draft.priority,
        done: false,
        notifiedAt: null,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ])

    setDraft((current) => ({
      ...current,
      title: '',
      notes: '',
      dueAt: nextDateTime(18, 0),
    }))
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
                onChange={(event) => setNaturalText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyNaturalText(event)
                }}
                placeholder="예: 내일 오후 3시에 병원 예약 30분 전"
              />
            </label>
            <button className="ghost-button" type="button" onClick={applyNaturalText}>
              해석하기
            </button>
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
