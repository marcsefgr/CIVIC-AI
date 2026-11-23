import { createContext, useContext, useEffect, useRef, useState } from "react"
import { api, type ApiReport, type User } from "./api"
import { classifyReportPhoto, type ImageModelResult } from "./imageModel"

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "Submitted" | "In Review" | "In Progress" | "Resolved" | "Rejected"
const CATEGORIES = [
  "Infrastructure",
  "Public Safety",
  "Sanitation",
  "Environment",
  "Public Spaces",
  "Other",
] as const
type Category = typeof CATEGORIES[number]
type Priority = "Low" | "Medium" | "High" | "Urgent"

interface Report {
  id: string

  reportId: number

  description: string
  location: string
  category: Category
  priority: Priority
  status: Status
  submittedAt: string
  updatedAt: string
  photo?: string
  photoHint?: string | null
  aiSummary: string
  aiConfirmed: boolean

  reviewed?: boolean
  resident: string
  satisfactionRating?: number
  adminComments?: AdminComment[]

  aiStatus?: string

  aiConsistency?: string | null

  aiConfidence?: number | null

  aiReason?: string | null

  aiCategory?: string | null

  aiPriority?: string | null

  aiVisibleIssue?: string | null

  needsVerification?: boolean

  history?: {
    from_status: string | null
    to_status: string
    created_at: string
    actor: string
  }[]
}

interface AdminComment {
  id: string
  author: string
  text: string
  createdAt: string
}

const CivicContext = createContext<{ user: User | null; reports: Report[] }>({
  user: null,
  reports: [],
})
const isOpenStatus = (status: Status) =>
  status !== "Resolved" && status !== "Rejected"
const effectiveCategory = (report: Report): Category | null =>
  report.reviewed
    ? report.category
    : (report.aiCategory as Category | null ?? null)
const effectivePriority = (report: Report): Priority | null =>
  report.reviewed
    ? report.priority
    : (report.aiPriority as Priority | null ?? null)

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "U"
  )
}

function passwordRuleChecks(value: string) {
  return [
    value.length >= 10,
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /[0-9]/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ]
}

type Screen = "onboarding" | "resident-home" | "resident-new" | "resident-ai" | "resident-detail" | "resident-profile" | "admin-dashboard" | "admin-statistics" | "admin-review"

const routeScreens: Screen[] = [
  "resident-home",
  "resident-new",
  "resident-ai",
  "resident-detail",
  "resident-profile",
  "admin-dashboard",
  "admin-statistics",
  "admin-review",
]
function readRoute(): { screen: Screen | null; reportId: number | null } {
  const params = new URLSearchParams(window.location.search)
  const candidate = params.get("screen") as Screen | null
  const id = Number(params.get("report"))
  return {
    screen: candidate && routeScreens.includes(candidate) ? candidate : null,
    reportId: Number.isSafeInteger(id) && id > 0 ? id : null,
  }
}

function formatManilaDate(value: string, dateOnly = false): string {
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value
    : `${value.replace(" ", "T")}+08:00`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  const options: Intl.DateTimeFormatOptions = dateOnly
    ? { dateStyle: "medium", timeZone: "Asia/Manila" }
    : { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }
  return new Intl.DateTimeFormat("en-PH", options).format(date)
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Status, string> = {
  Submitted: "bg-slate-100 text-slate-600",
  "In Review": "bg-amber-50 text-amber-700",
  "In Progress": "bg-blue-50 text-blue-700",
  Resolved: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-red-50 text-red-600",
}

const STATUS_ACCENT: Record<Status, string> = {
  Submitted: "#94A3B8",
  "In Review": "#D97706",
  "In Progress": "#2357C3",
  Resolved: "#059669",
  Rejected: "#DC2626",
}

const PRIORITY_ACCENT: Record<Priority, string> = {
  Low: "#94A3B8",
  Medium: "#D97706",
  High: "#EA580C",
  Urgent: "#DC2626",
}

const PRIORITY_STYLES: Record<Priority, string> = {
  Low: "bg-slate-100 text-slate-600",
  Medium: "bg-amber-50 text-amber-700",
  High: "bg-orange-50 text-orange-700",
  Urgent: "bg-red-50 text-red-600",
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  )
}

function PriorityPill({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${PRIORITY_STYLES[priority]}`}
    >
      {priority}
    </span>
  )
}

function AIBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-200 whitespace-nowrap">
      ✦ AI Suggested
    </span>
  )
}

function CategoryIcon({
  category,
  size = 14,
}: {
  category: Category
  size?: number
}) {
  const s = size
  const icons: Record<Category, React.ReactNode> = {
    Infrastructure: (
      <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
        <path
          d="M2 12V6l5-4 5 4v6M5 12V8h4v4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    "Public Safety": (
      <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
        <path
          d="M7 1.5 11.5 3v3.5c0 2.8-1.8 4.7-4.5 6-2.7-1.3-4.5-3.2-4.5-6V3L7 1.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="m5 7 1.3 1.3L9.5 5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    Sanitation: (
      <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
        <path
          d="M3 4h8l-.8 7H3.8L3 4Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M1.5 4h11M5 4V2.5h4V4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    Environment: (
      <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
        <path
          d="M11.5 2.5C6 2.7 3 5.2 3 8.5c0 1.7 1.2 3 3 3 3.4 0 5.3-3.6 5.5-9Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M2 12c1.5-2.6 3.8-4.7 7-6.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    "Public Spaces": (
      <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
        <path
          d="M2 12h10M3.5 12V7h7v5M2.5 7 7 3l4.5 4M5.5 7v5M8.5 7v5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    Other: (
      <svg width={s} height={s} viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M7 4v3.5L9 9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  }
  return <span className="text-slate-500">{icons[category]}</span>
}

function PinIcon() {
  return (
    <svg
      width="10"
      height="12"
      viewBox="0 0 10 12"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M5 0C2.79 0 1 1.79 1 4c0 2.79 4 8 4 8s4-5.21 4-8c0-2.21-1.79-4-4-4Zm0 5.5A1.5 1.5 0 1 1 5 2.5a1.5 1.5 0 0 1 0 3Z"
        fill="#94A3B8"
      />
    </svg>
  )
}

function ReportPhoto({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View full size: ${alt}`}
        className="group block w-full cursor-zoom-in rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40"
      >
        <img
          src={src}
          alt={alt}
          className="h-52 w-full rounded-2xl object-cover transition-opacity group-hover:opacity-90"
        />
        <span className="sr-only">Open full-size photo</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 md:p-10"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close full-size photo"
            className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white text-2xl text-slate-900 shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400"
          >
            ×
          </button>
          <img
            src={src}
            alt={alt}
            className="max-h-[calc(100vh-5rem)] max-w-full object-contain"
          />
        </div>
      )}
    </>
  )
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10 11l3-3-3-3M13 8H6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CivicLogo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-xl flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: "#2357C3" }}
    >
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 18 18"
        fill="none"
      >
        <path
          d="M9 2L11.2 7H16L12.3 10.1L13.9 15L9 12L4.1 15L5.7 10.1L2 7H6.8L9 2Z"
          fill="white"
        />
      </svg>
    </div>
  )
}

// ─── Sidebars ─────────────────────────────────────────────────────────────────

function ResidentSidebar({
  screen,
  onNav,
}: {
  screen: Screen
  onNav: (s: Screen) => void
}) {
  const { user } = useContext(CivicContext)
  const navItems = [
    {
      id: "resident-home" as Screen,
      label: "My Reports",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 4h12M2 8h12M2 12h8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      id: "resident-new" as Screen,
      label: "New Report",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 3v10M3 8h10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      id: "resident-profile" as Screen,
      label: "My Profile",
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle
            cx="8"
            cy="5.5"
            r="2.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M2.5 13c0-2.485 2.462-4.5 5.5-4.5s5.5 2.015 5.5 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
  ]
  return (
    <aside
      className="hidden md:flex flex-col w-56 shrink-0"
      style={{
        background: "linear-gradient(180deg, #1a3a8f 0%, #2357C3 100%)",
      }}
    >
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <CivicLogo size={32} />
          <div>
            <p className="text-sm font-bold text-white">CivicAI</p>
            <p className="text-[11px] text-white/45">Resident Portal</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNav(item.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
            style={{
              background:
                screen === item.id ? "rgba(255,255,255,0.15)" : "transparent",
              color: screen === item.id ? "white" : "rgba(255,255,255,0.6)",
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
            {initials(user?.name)}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {user?.name ?? "Account"}
            </p>
            <p className="text-[11px] text-white/45">
              {user?.role ?? "Resident"}
            </p>
          </div>
        </div>
        <button
          onClick={() => onNav("onboarding")}
          className="flex items-center gap-2 text-xs font-medium transition-colors"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          <LogoutIcon /> Sign out
        </button>
      </div>
    </aside>
  )
}

function AdminSidebar({
  screen,
  onNav,
}: {
  screen: Screen
  onNav: (s: Screen) => void
}) {
  const { user, reports } = useContext(CivicContext)
  const reportsActive =
    screen === "admin-dashboard" || screen === "admin-review"
  const quickStats = [
    {
      label: "Open",
      value: reports.filter((report) => isOpenStatus(report.status)).length,
      color: "#60A5FA",
    },
    {
      label: "Urgent",
      value: reports.filter((report) => effectivePriority(report) === "Urgent")
        .length,
      color: "#F87171",
    },
    {
      label: "Resolved",
      value: reports.filter((report) => report.status === "Resolved").length,
      color: "#34D399",
    },
  ]
  return (
    <aside
      className="hidden md:flex flex-col w-60 shrink-0"
      style={{ background: "#0f1f4a" }}
    >
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <CivicLogo size={32} />
          <div>
            <p className="text-sm font-bold text-white">CivicAI</p>
            <p className="text-[11px] text-white/45">Admin Portal</p>
          </div>
        </div>
      </div>
      <div className="px-4 py-4 border-b border-white/10 space-y-2">
        {quickStats.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <span className="text-xs text-white/50">{s.label}</span>
            <span className="text-sm font-bold" style={{ color: s.color }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
      <nav className="flex-1 px-3 py-4">
        <button
          onClick={() => onNav("admin-dashboard")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
          style={{
            background: reportsActive ? "rgba(255,255,255,0.1)" : "transparent",
            color: reportsActive ? "white" : "rgba(255,255,255,0.55)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 4h12M2 8h12M2 12h8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Reports
        </button>
        <button
          onClick={() => onNav("admin-statistics")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left mt-1"
          style={{
            background:
              screen === "admin-statistics"
                ? "rgba(255,255,255,0.1)"
                : "transparent",
            color:
              screen === "admin-statistics"
                ? "white"
                : "rgba(255,255,255,0.55)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 13V8M8 13V3M13 13V6"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          Statistics
        </button>
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{ background: "#2357C3" }}
          >
            {initials(user?.name)}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {user?.name ?? "Account"}
            </p>
            <p className="text-[11px] text-white/45">{user?.role ?? "Admin"}</p>
          </div>
        </div>
        <button
          onClick={() => onNav("onboarding")}
          className="flex items-center gap-2 text-xs font-medium transition-colors"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          <LogoutIcon /> Sign out
        </button>
      </div>
    </aside>
  )
}

// ─── Mobile bottom nav ────────────────────────────────────────────────────────

function ResidentMobileNav({
  active,
  onNav,
}: {
  active: string
  onNav: (s: Screen) => void
}) {
  const tabs = [
    {
      id: "resident-home" as Screen,
      label: "Reports",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M3 5h14M3 10h14M3 15h9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      id: "resident-new" as Screen,
      label: "New",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M10 4v12M4 10h12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      id: "resident-profile" as Screen,
      label: "Profile",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle
            cx="10"
            cy="7"
            r="3"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
  ]
  return (
    <div
      className="md:hidden flex border-t border-slate-100 bg-white shrink-0"
      style={{ boxShadow: "0 -1px 12px rgba(0,0,0,0.08)" }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onNav(t.id)}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors relative min-h-[56px]"
          style={{ color: active === t.id ? "#2357C3" : "#94A3B8" }}
        >
          {active === t.id && (
            <span
              className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
              style={{ background: "#2357C3" }}
            />
          )}
          {t.icon}
          <span className="text-[11px] font-semibold leading-none">
            {t.label}
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

function Onboarding({ onSelect }: { onSelect: (user: User) => Promise<void> }) {
  const [signup, setSignup] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [privacyRead, setPrivacyRead] = useState(false)
  const [adultConfirmed, setAdultConfirmed] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [busy, setBusy] = useState(false)
  const passwordChecks = passwordRuleChecks(password)
  const passwordStrong = passwordChecks.every(Boolean)
  const submit = async () => {
    setError("")
    if (
      !email.trim() ||
      !password ||
      (signup &&
        (name.trim().length < 2 ||
          password !== confirm ||
          !passwordStrong ||
          !privacyRead ||
          !adultConfirmed))
    ) {
      setError(
        !email.trim() || !password
          ? "Enter your email and password."
          : !name.trim()
            ? "Enter a name with at least 2 characters."
            : password !== confirm
              ? "Passwords do not match."
              : !passwordStrong
                ? "Meet all password strength requirements."
              : !privacyRead
                ? "Read the project privacy notice before creating an account."
                : "This project account is restricted to adults 18 and older.",
      )
      return
    }
    setBusy(true)
    try {
      if (signup) {
        await api.register(name.trim(), email.trim(), password, adultConfirmed)
        setSignup(false)
        setPassword("")
        setConfirm("")
        setSuccess("Account created. Please log in with your new account.")
      } else {
        await onSelect(await api.login(email.trim(), password))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="h-full overflow-y-auto grid md:grid-cols-[1fr_440px] bg-[#0f1f4a] text-white">
      <div className="hidden md:flex flex-col justify-between p-12 bg-gradient-to-br from-[#183b89] to-[#0f1f4a]">
        <div className="flex items-center gap-3">
          <CivicLogo size={40} />
          <span className="text-xl font-bold">CivicAI</span>
        </div>
        <div>
          <h1 className="text-5xl font-bold leading-tight">
            A better
            <br />
            barangay, together.
          </h1>
          <p className="mt-4 max-w-md text-white/65">
            Report community issues and follow their progress. AI can assist the
            review; barangay staff make the decisions.
          </p>
        </div>
        <p className="text-xs text-white/40">CivicAI Community Reporting</p>
      </div>
      <div className="flex flex-col justify-center px-7 py-8 md:px-10 md:py-10">
        <div className="md:hidden flex items-center gap-2 mb-8">
          <CivicLogo />
          <b>CivicAI</b>
        </div>
        <h2 className="text-2xl font-bold">
          {signup ? "Create your account" : "Welcome back"}
        </h2>
        <p className="text-sm text-white/55 mt-1">
          {signup
            ? "Sign up as a resident to report local issues."
            : "Sign in to continue to CivicAI."}
        </p>
        {success && !signup && (
          <p role="status" className="mt-4 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
            {success}
          </p>
        )}
        <div className="space-y-4 mt-7">
          {signup && (
            <label className="block text-xs text-white/65">
              Full name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoComplete="name"
                className="mt-1 w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-sm text-white outline-none focus:ring-2 focus:ring-blue-300"
              />
            </label>
          )}
          <label className="block text-xs text-white/65">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1 w-full rounded-xl px-4 py-3 bg-white/10 border border-white/20 text-sm text-white outline-none focus:ring-2 focus:ring-blue-300"
            />
          </label>
          <label className="block text-xs text-white/65">
            Password
            <span className="relative mt-1 block">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={signup ? "new-password" : "current-password"}
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 pr-20 text-sm text-white outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-3 my-auto min-h-10 px-2 text-xs font-semibold text-white/80 underline underline-offset-2" aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          {signup && (
            <div className="-mt-2 rounded-xl bg-white/5 p-3" aria-live="polite">
              <div className="mb-2 flex gap-1" aria-label={`Password strength: ${passwordStrong ? "strong" : passwordChecks.filter(Boolean).length >= 3 ? "medium" : "weak"}`}>
                {passwordChecks.map((passed, index) => (
                  <span key={index} className={`h-1.5 flex-1 rounded-full ${passed ? "bg-emerald-400" : "bg-white/20"}`} />
                ))}
              </div>
              <p className="text-[11px] font-semibold text-white/80">{passwordStrong ? "Strong password" : "Use at least 10 characters with uppercase, lowercase, a number, and a symbol."}</p>
            </div>
          )}
          {signup && (
            <label className="block text-xs text-white/65">
              Confirm password
              <span className="relative mt-1 block">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 pr-20 text-sm text-white outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute inset-y-0 right-3 my-auto min-h-10 px-2 text-xs font-semibold text-white/80 underline underline-offset-2" aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}>
                  {showConfirm ? "Hide" : "Show"}
                </button>
              </span>
            </label>
          )}
          {signup && (
            <>
              <details className="max-h-40 overflow-y-auto rounded-xl border border-white/15 bg-white/5 p-3 text-xs leading-relaxed text-white/70">
                <summary className="cursor-pointer font-semibold">
                  Project privacy notice
                </summary>
                <p className="mt-2">
                  This project version is for adult reviewers (18+) and
                  fictional synthetic report data only. Your account name and
                  email are stored. Do not submit real resident information,
                  personal or sensitive details, confidential material, or
                  identifiable photos. If AI is enabled, report descriptions and
                  optional photos are sent to Google Gemini. Gemini API data
                  handling differs by service tier: unpaid use may be used to
                  improve Google products and may be reviewed by humans; paid
                  service requires active Cloud Billing and excludes prompts and
                  responses from product improvement, while limited safety
                  logging and cross-border processing may still occur.
                  Suggestions are advisory; staff decide final outcomes.
                </p>
                <p className="mt-2">
                  Data controller: [barangay/LGU legal name]. Privacy contact /
                  DPO: [official contact]. Retention period: [approved period].
                  Data rights and complaint contact: [approved instructions].
                  These fields are intentionally blank for the project version.
                </p>
              </details>
              <label className="flex items-start gap-2 text-xs text-white/65">
                <input
                  type="checkbox"
                  checked={privacyRead}
                  onChange={(e) => setPrivacyRead(e.target.checked)}
                  className="mt-0.5"
                />
                I have read the project privacy notice.
              </label>
              <label className="flex items-start gap-2 text-xs text-white/65">
                <input
                  type="checkbox"
                  checked={adultConfirmed}
                  onChange={(e) => setAdultConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                I confirm that I am 18 or older and am using this project as an
                adult reviewer.
              </label>
            </>
          )}{" "}
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            onClick={submit}
            className="min-h-12 w-full rounded-xl bg-[#2357C3] py-3.5 font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1f4a] disabled:opacity-50"
          >
            {busy ? "Please wait…" : signup ? "Create account" : "Log in"}
          </button>
          <p className="text-center text-sm text-white/55">
            {signup ? "Already have an account?" : "New to CivicAI?"}{" "}
            <button
              onClick={() => {
                setSignup(!signup)
                setError("")
                setSuccess("")
              }}
              className="text-white font-semibold"
            >
              {signup ? "Log in" : "Sign up"}
            </button>
          </p>
        </div>
        <p className="mt-8 text-center text-xs text-white/35">
          AI suggestions run automatically on report submission. Barangay staff
          make all final decisions.
        </p>
      </div>
    </div>
  )
}
function ResidentHome({
  reports,
  onSelect,
  onNav,
  screen,
}: {
  reports: Report[]
  onSelect: (r: Report) => void
  onNav: (s: Screen) => void
  screen: Screen
}) {
  const myReports = reports
  const [statusFilter, setStatusFilter] = useState("All")
  const visibleReports = myReports.filter(
    (report) => statusFilter === "All" || report.status === statusFilter,
  )

  return (
    <div className="flex h-full">
      <ResidentSidebar screen={screen} onNav={onNav} />
      <div className="flex-1 overflow-hidden flex flex-col bg-[#F0F4FF]">
        {/* Mobile header */}
        <div
          className="md:hidden shrink-0 px-5 pt-5 pb-4"
          style={{
            background: "linear-gradient(135deg, #2357C3 0%, #1a44a0 100%)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p
                className="text-xs font-medium uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                Resident dashboard
              </p>
              <h1 className="text-xl font-bold text-white">My Reports</h1>
            </div>
            <button
              onClick={() => onNav("onboarding")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: "rgba(255,255,255,0.18)" }}
            >
              <LogoutIcon /> Log out
            </button>
          </div>
          <div className="flex gap-3">
            {[
              { label: "Total", value: myReports.length, color: "#fff" },
              {
                label: "Active",
                value: myReports.filter((r) => isOpenStatus(r.status)).length,
                color: "#FCD34D",
              },
              {
                label: "Resolved",
                value: myReports.filter((r) => r.status === "Resolved").length,
                color: "#6EE7B7",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="flex-1 bg-white/15 rounded-xl p-2.5 text-center"
              >
                <p className="text-lg font-bold" style={{ color: s.color }}>
                  {s.value}
                </p>
                <p className="text-[10px] font-medium mt-0.5 text-white/60">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden md:block px-8 py-5 bg-white border-b border-slate-100 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-900">My Reports</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {myReports.length} reports ·{" "}
              {myReports.filter((r) => isOpenStatus(r.status)).length} active
            </p>
          </div>
        </div>

        {/* Desktop stat row */}
        <div className="hidden md:grid grid-cols-3 gap-4 px-8 py-5 bg-white border-b border-slate-100 shrink-0">
          {[
            {
              label: "Total Reports",
              value: myReports.length,
              color: "#2357C3",
              bg: "#EFF4FF",
            },
            {
              label: "Active",
              value: myReports.filter((r) => isOpenStatus(r.status)).length,
              color: "#D97706",
              bg: "#FFFBEB",
            },
            {
              label: "Resolved",
              value: myReports.filter((r) => r.status === "Resolved").length,
              color: "#059669",
              bg: "#ECFDF5",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl p-4 flex items-center gap-4"
              style={{ background: s.bg }}
            >
              <p className="text-3xl font-bold" style={{ color: s.color }}>
                {s.value}
              </p>
              <p className="text-sm font-semibold text-slate-600">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <label className="text-sm font-medium text-slate-700">
              Filter reports
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="ml-2 min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {["All", ...STATUS_STEPS].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <span className="text-xs text-slate-500">
              Showing {visibleReports.length} of {myReports.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleReports.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center md:col-span-2 xl:col-span-3">
                <p className="text-sm font-semibold text-slate-700">
                  {myReports.length === 0 ? "No reports yet" : "No reports match this filter"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {myReports.length === 0 ? "Use “File a Report” to submit fictional project data." : "Choose another status to see more reports."}
                </p>
              </div>
            )}
            {visibleReports.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  onSelect(r)
                  onNav("resident-detail")
                }}
                className="text-left bg-white border border-slate-100 rounded-2xl overflow-hidden hover:shadow-lg hover:border-[#2357C3]/20 transition-all"
                style={{ borderLeft: `4px solid ${STATUS_ACCENT[r.status]}` }}
              >
                <div
                  style={{ height: 3, background: STATUS_ACCENT[r.status] }}
                />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <CategoryIcon category={r.category} size={16} />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                          {r.reviewed ? r.category : "Awaiting review"}
                        </p>
                        <p className="text-[10px] text-slate-400">{r.id}</p>
                      </div>
                    </div>
                    <StatusPill status={r.status} />
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-2 leading-snug mb-3">
                    {r.description}
                  </p>
                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-50">
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <PinIcon />
                      {r.location}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {formatManilaDate(r.submittedAt, true)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-6 flex flex-col items-center justify-center text-center min-h-[160px]">
              <p className="text-sm font-semibold text-slate-600 mb-1">
                See something broken?
              </p>
              <p className="text-xs text-slate-400 mb-4">
                Submit a report and track it in real time.
              </p>
              <button
                onClick={() => onNav("resident-new")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white"
                style={{ background: "#2357C3" }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 1v10M1 6h10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                File a Report
              </button>
            </div>
          </div>
        </div>

        <ResidentMobileNav active="resident-home" onNav={onNav} />
      </div>
    </div>
  )
}

// ─── Resident: New Report ─────────────────────────────────────────────────────

function ResidentNew({
  onNav,
  onSubmit,
  screen,
  initialLocation,
}: {
  onNav: (s: Screen) => void
  onSubmit: (
    description: string,
    location: string,
    photo: File | null,
  ) => Promise<void>
  screen: Screen
  initialLocation?: string | null
}) {
  const [desc, setDesc] = useState("")
  const [loc, setLoc] = useState(initialLocation ?? "")
  const [photo, setPhoto] = useState<File | null>(null)

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null)
      return
    }
    const url = URL.createObjectURL(photo)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const canSubmit =
    desc.trim().length > 0 &&
    loc.trim().length > 0 &&
    !busy
  const submit = async () => {
    setError("")
    setBusy(true)
    try {
      await onSubmit(desc.trim(), loc.trim(), photo)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit report.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex h-full">
      <ResidentSidebar screen={screen} onNav={onNav} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
        <div className="max-w-2xl space-y-5">
          <h1 className="text-xl font-bold">New Report</h1>
          <p className="text-sm text-slate-500">
            Submit a community issue for barangay staff to review.
          </p>
          <div>
            <span className="block text-xs font-semibold uppercase text-slate-600">Photo (optional)</span>
            <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-blue-700 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 focus-within:ring-2 focus-within:ring-blue-500">
              {photo ? "Change photo" : "Choose photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="sr-only"
            />
            </label>
            <p className="mt-1 text-xs text-slate-500">One JPG, PNG, or WebP photo, up to the allowed upload size.</p>
          </div>
          {photo && (
            <div className="flex items-center gap-3">
              <img
                src={photoUrl ?? undefined}
                alt="Selected report"
                className="h-24 w-32 rounded-xl object-cover"
              />
              <button
                onClick={() => setPhoto(null)}
                className="text-sm text-red-600"
              >
                Remove photo
              </button>
            </div>
          )}
          <label className="block text-xs font-semibold text-slate-500 uppercase">
            Description *
            <textarea
              maxLength={2000}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={5}
              placeholder="Describe what happened, where, and any safety concerns."
              className="mt-2 max-h-64 min-h-32 w-full resize-y overflow-y-auto rounded-xl border border-slate-300 px-4 py-3 text-sm leading-6 normal-case outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
            />
            <span className="text-xs text-slate-400">{desc.length}/2000</span>
          </label>
          <label className="block text-xs font-semibold text-slate-500 uppercase">
            Location *
            <input
              maxLength={255}
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              placeholder="Purok, street, or nearby landmark"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm normal-case"
            />
          </label>
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-800">
            AI suggestions start automatically after submission when enabled.
            Barangay staff review every suggestion and make the final decision.
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="min-h-12 rounded-xl bg-[#2357C3] px-8 py-3.5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {busy ? "Submitting…" : "Submit Report"}
          </button>
        </div>
      </div>
      <ResidentMobileNav active="resident-new" onNav={onNav} />
      </div>
    </div>
  )
}
function ResidentPhotoRetry({
  report,
  onRetry,
}: {
  report: Report
  onRetry: (reportId: number, photo: File) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const canRetry =
    report.status !== "Resolved" &&
    report.status !== "Rejected" &&
    report.aiStatus !== "running" &&
    (Boolean(report.photoHint) ||
      (!report.photo && report.aiStatus === "failed"))
  if (!canRetry) return null
  const submit = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError("")
    try {
      await onRetry(report.reportId, file)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload this photo.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p>
        {report.photoHint ||
          "The report photo did not upload. You can retry the upload here."}
      </p>
      <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white">
        {busy
          ? "Uploading and retrying AI…"
          : report.photo
            ? "Replace photo"
            : "Add photo"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            void submit(e.target.files?.[0])
            e.currentTarget.value = ""
          }}
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
function ResidentAI({
  report,
  onNav,
  onRetryPhoto,
  screen,
}: {
  report: Report
  onNav: (s: Screen) => void
  onRetryPhoto: (reportId: number, photo: File) => Promise<void>
  screen: Screen
}) {
  return (
    <div className="flex h-full">
      <ResidentSidebar screen={screen} onNav={onNav} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-emerald-100 bg-emerald-50 p-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Report submitted
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Reference: <b>{report.id}</b>
          </p>
          <p className="mt-4 text-sm text-slate-700">
            Your report is saved. AI suggestions will be generated automatically
            for barangay staff to review. Staff make the final decision. You can
            track status updates from My Reports.
          </p>
          <ResidentPhotoRetry report={report} onRetry={onRetryPhoto} />
          <button
            onClick={() => onNav("resident-home")}
            className="mt-6 rounded-xl bg-[#2357C3] px-5 py-3 text-sm font-semibold text-white"
          >
            Back to My Reports
          </button>
        </div>
        </div>
        <ResidentMobileNav active="" onNav={onNav} />
      </div>
    </div>
  )
}
const STATUS_STEPS: Status[] = [
  "Submitted",
  "In Review",
  "In Progress",
  "Resolved",
  "Rejected",
]
function ResidentDetail({
  report,
  onBack,
  onNav,
  onRetryPhoto,
  screen,
}: {
  report: Report
  onBack: () => void
  onNav: (s: Screen) => void
  onRetryPhoto: (reportId: number, photo: File) => Promise<void>
  screen: Screen
}) {
  const currentStepIdx = STATUS_STEPS.indexOf(report.status)
  const history = report.history ?? []
  const staffComments = report.adminComments ?? []
  return (
    <div className="flex h-full">
      <ResidentSidebar screen={screen} onNav={onNav} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 md:px-8 py-5 border-b border-slate-100 flex items-center gap-3">
          <button onClick={onBack} className="rounded-full bg-slate-100 p-2">
            ←
          </button>
          <div className="flex-1">
            <p className="text-xs text-slate-500">
              {report.id} ·{" "}
              {report.reviewed ? report.category : "Awaiting review"}
            </p>
            <h1 className="text-lg font-bold">{report.location}</h1>
          </div>
          <StatusPill status={report.status} />
        </div>
        <div className="grid max-w-4xl grid-cols-1 gap-6 p-5 md:grid-cols-2 md:p-8">
          <div className="space-y-4">
            {report.photo && (
              <ReportPhoto src={report.photo} alt="Photo attached to report" />
            )}
            <div className="rounded-2xl border bg-slate-50 p-4">
              <b className="text-xs uppercase text-slate-400">Description</b>
              <p className="mt-2 text-sm text-slate-700">
                {report.description}
              </p>
              <p className="mt-3 text-xs text-slate-500">
                <PinIcon /> {report.location}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Submitted {formatManilaDate(report.submittedAt)}
              </p>
            </div>
            <ResidentPhotoRetry report={report} onRetry={onRetryPhoto} />
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border bg-slate-50 p-5">
              <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Status history
              </p>
              {history.length ? (
                history.map((item, i) => (
                  <div
                    key={`${item.created_at}-${i}`}
                    className="border-l-2 border-blue-200 pb-5 pl-4"
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {item.to_status}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatManilaDate(item.created_at)} · {item.actor}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No status changes yet.</p>
              )}
              {report.reviewed && (
                <p className="mt-2 border-t pt-4 text-sm text-slate-600">
                  Reviewed category: <b>{report.category}</b> · Priority:{" "}
                  <b>{report.priority}</b>
                </p>
              )}
            </div>
            <section
              aria-labelledby="staff-comments-title"
              className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5"
            >
              <h2
                id="staff-comments-title"
                className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Updates from staff
              </h2>
              {staffComments.length ? (
                <div className="space-y-3">
                  {staffComments.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-xl border border-blue-100 bg-white p-4"
                    >
                      <p className="text-xs font-semibold text-slate-600">
                        {item.author} · {formatManilaDate(item.createdAt)}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                        {item.text}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No staff comments yet.</p>
              )}
            </section>
          </div>
        </div>
        </div>
        <ResidentMobileNav active="" onNav={onNav} />
      </div>
    </div>
  )
}
function ResidentProfile({
  reports,
  onNav,
  screen,
  user,
  onSaveAddress,
}: {
  reports: Report[]
  onNav: (s: Screen) => void
  screen: Screen
  user: User
  onSaveAddress: (address: string) => Promise<void>
}) {
  const [address, setAddress] = useState(user.permanent_address ?? "")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const resolved = reports.filter(
    (report) => report.status === "Resolved",
  ).length
  return (
    <div className="flex h-full">
      <ResidentSidebar screen={screen} onNav={onNav} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F0F4FF]">
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-xl font-bold">My Profile</h1>
          <div className="rounded-2xl border bg-white p-5">
            <p className="text-lg font-semibold">{user.name}</p>
            <p className="mt-1 text-sm text-slate-600">{user.email}</p>
            <p className="mt-3 text-xs text-slate-500 capitalize">
              {user.role}
            </p>
          </div>
          <form
            className="rounded-2xl border bg-white p-5"
            onSubmit={async (event) => {
              event.preventDefault()
              setBusy(true)
              setMessage("")
              setError("")
              try {
                await onSaveAddress(address.trim())
                setMessage("Permanent address saved. You can change the location for each report.")
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not save address.")
              } finally {
                setBusy(false)
              }
            }}
          >
            <label htmlFor="permanent-address" className="text-sm font-semibold text-slate-800">Permanent address</label>
            <p className="mt-1 text-xs text-slate-500">Used to prefill the location when you file a report. You can edit that location for each report.</p>
            <input
              id="permanent-address"
              value={address}
              maxLength={255}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Purok, street, barangay"
              className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
            />
            {message && <p role="status" className="mt-2 text-sm text-emerald-700">{message}</p>}
            {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="mt-3 min-h-11 rounded-xl bg-[#2357C3] px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50">
              {busy ? "Saving…" : "Save address"}
            </button>
          </form>
          <div className="rounded-2xl border bg-white p-5">
            <h2 className="text-sm font-semibold">My activity</h2>
            <p className="mt-2 text-sm text-slate-600">
              {reports.length} reports submitted · {resolved} resolved
            </p>
          </div>
          <button
            onClick={() => onNav("onboarding")}
            className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700"
          >
            Sign out
          </button>
        </div>
        </div>
        <ResidentMobileNav active="resident-profile" onNav={onNav} />
      </div>
    </div>
  )
}
function AdminDashboard({
  reports,
  onSelect,
  onNav,
  screen,
}: {
  reports: Report[]
  onSelect: (r: Report) => void
  onNav: (s: Screen) => void
  screen: Screen
}) {
  const [statusFilter, setStatusFilter] = useState("All")
  const [categoryFilter, setCategoryFilter] = useState("All")
  const [priorityFilter, setPriorityFilter] = useState("All")
  const [search, setSearch] = useState("")
  const [urgentFirst, setUrgentFirst] = useState(false)

  const counts = {
    open: reports.filter((r) => isOpenStatus(r.status)).length,
    urgent: reports.filter((r) => effectivePriority(r) === "Urgent").length,
    resolved: reports.filter((r) => r.status === "Resolved").length,
    needsReview: reports.filter((r) => !r.reviewed).length,
  }
  const filtered = reports
    .filter((r) => {
      const matchStatus =
        statusFilter === "All" || r.status as string === statusFilter
      const matchCategory =
        categoryFilter === "All" || effectiveCategory(r) === categoryFilter
      const matchPriority =
        priorityFilter === "All" || effectivePriority(r) === priorityFilter
      const matchSearch =
        search === "" ||
        r.description.toLowerCase().includes(search.toLowerCase()) ||
        r.location.toLowerCase().includes(search.toLowerCase()) ||
        r.id.toLowerCase().includes(search.toLowerCase()) ||
        r.resident.toLowerCase().includes(search.toLowerCase())
      return matchStatus && matchCategory && matchPriority && matchSearch
    })
    .sort((a, b) => {
      if (urgentFirst) {
        const rank: Record<Priority, number> = {
          Urgent: 4,
          High: 3,
          Medium: 2,
          Low: 1,
        }
        const difference =
          (rank[effectivePriority(b) ?? "Low"] ?? 0) -
          (rank[effectivePriority(a) ?? "Low"] ?? 0)
        if (difference) return difference
      }
      return b.reportId - a.reportId
    })

  const hasActiveFilters =
    statusFilter !== "All" ||
    categoryFilter !== "All" ||
    priorityFilter !== "All" ||
    search !== "" ||
    urgentFirst

  const statusOptions = [
    "All",
    "Submitted",
    "In Review",
    "In Progress",
    "Resolved",
    "Rejected",
  ]
  const categoryOptions = ["All", ...CATEGORIES]
  const priorityOptions = ["All", "Low", "Medium", "High", "Urgent"]

  return (
    <div className="flex h-full">
      <AdminSidebar screen={screen} onNav={onNav} />
      <div className="flex-1 overflow-hidden flex flex-col bg-[#F0F4FF]">
        {/* Mobile header */}
        <div
          className="md:hidden shrink-0"
          style={{
            background: "linear-gradient(135deg, #1a3a8f 0%, #2357C3 100%)",
          }}
        >
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <p
                className="text-xs uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                Administration
              </p>
              <h1 className="text-xl font-bold text-white">Barangay reports</h1>
            </div>
            <button
              onClick={() => onNav("onboarding")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <LogoutIcon /> Log out
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 px-4 pb-4">
            {[
              { label: "Open", value: counts.open, c: "#60A5FA" },
              { label: "Urgent", value: counts.urgent, c: "#F87171" },
              { label: "Resolved", value: counts.resolved, c: "#34D399" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl px-3 py-2.5 text-center"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <p className="text-xl font-bold" style={{ color: s.c }}>
                  {s.value}
                </p>
                <p className="text-[10px] font-semibold text-white/55 uppercase tracking-wide mt-0.5">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={() => onNav("admin-statistics")}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 py-2.5 text-xs font-semibold text-white"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 13V8M8 13V3M13 13V6"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
              View Statistics
            </button>
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden md:block bg-white border-b border-slate-100 shrink-0">
          <div className="px-8 py-5 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Reports Dashboard
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Barangay reports · {filtered.length} shown
              </p>
            </div>
            {counts.needsReview > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-xs font-semibold text-amber-700">
                  {counts.needsReview} awaiting admin review
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-4 gap-4 px-8 pb-5">
            {[
              {
                label: "Open Reports",
                value: counts.open,
                color: "#2357C3",
                bg: "#EFF4FF",
                border: "#2357C3",
              },
              {
                label: "Urgent",
                value: counts.urgent,
                color: "#DC2626",
                bg: "#FEF2F2",
                border: "#DC2626",
              },
              {
                label: "Resolved",
                value: counts.resolved,
                color: "#059669",
                bg: "#ECFDF5",
                border: "#059669",
              },
              {
                label: "Awaiting Admin Review",
                value: counts.needsReview,
                color: "#6366F1",
                bg: "#EEF2FF",
                border: "#6366F1",
              },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-2xl p-4 flex items-center gap-4 shadow-sm"
                style={{
                  background: c.bg,
                  borderLeft: `4px solid ${c.border}`,
                }}
              >
                <p className="text-3xl font-bold" style={{ color: c.color }}>
                  {c.value}
                </p>
                <p className="text-sm font-semibold text-slate-600 leading-tight">
                  {c.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Search + filters */}
        <div className="px-4 md:px-8 py-3 bg-white border-b border-slate-100 shrink-0 space-y-2.5">
          {/* Search row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
              >
                <circle
                  cx="6"
                  cy="6"
                  r="4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M9.5 9.5L12 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reports, residents, locations..."
                className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 bg-white focus:outline-none focus:border-[#2357C3] focus:ring-2 focus:ring-[#2357C3]/10 transition-all"
              />
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setStatusFilter("All")
                  setCategoryFilter("All")
                  setPriorityFilter("All")
                  setSearch("")
                  setUrgentFirst(false)
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 whitespace-nowrap transition-all shrink-0"
              >
                Reset
              </button>
            )}
          </div>
          {/* Dropdown filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {[
              {
                label: "Status",
                allLabel: "All statuses",
                options: statusOptions,
                value: statusFilter,
                set: setStatusFilter,
                activeColor: "#2357C3",
              },
              {
                label: "Category",
                allLabel: "All categories",
                options: categoryOptions,
                value: categoryFilter,
                set: setCategoryFilter,
                activeColor: "#6366F1",
              },
              {
                label: "Priority",
                allLabel: "All priorities",
                options: priorityOptions,
                value: priorityFilter,
                set: setPriorityFilter,
                activeColor: "#D97706",
              },
            ].map(({ label, allLabel, options, value, set, activeColor }) => {
              const isActive = value !== "All"
              return (
                <div
                  key={label}
                  className="relative rounded-xl border transition-all"
                  style={{
                    borderColor: isActive ? activeColor : "#E2E8F0",
                    background: isActive ? `${activeColor}10` : "#F8FAFC",
                  }}
                >
                  <label
                    htmlFor={`admin-${label.toLowerCase()}-filter`}
                    className="absolute left-3 top-1.5 text-[9px] font-bold uppercase tracking-wide pointer-events-none"
                    style={{ color: isActive ? activeColor : "#94A3B8" }}
                  >
                    {label}
                  </label>
                  <select
                    id={`admin-${label.toLowerCase()}-filter`}
                    value={value}
                    onChange={(event) => set(event.target.value)}
                    className="w-full appearance-none bg-transparent pl-3 pr-9 pt-4 pb-1.5 text-xs font-bold focus:outline-none cursor-pointer"
                    style={{ color: isActive ? activeColor : "#475569" }}
                  >
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {option === "All" ? allLabel : option}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="m3 4.5 3 3 3-3"
                      stroke={isActive ? activeColor : "#94A3B8"}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )
            })}
          </div>
          <label className="flex min-h-11 items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={urgentFirst}
              onChange={(event) => setUrgentFirst(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#2357C3] focus:ring-[#2357C3]"
            />
            Sort by AI/admin priority (urgent first)
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 space-y-2.5">
          {/* Desktop column headers */}
          <div
            className="hidden md:grid gap-4 items-center px-4 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide"
            style={{ gridTemplateColumns: "160px 1fr 160px 80px 110px 130px" }}
          >
            <span>ID / Category</span>
            <span>Description</span>
            <span>Location</span>
            <span>Priority</span>
            <span>Status</span>
            <span>Resident</span>
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M3 6h14M3 10h14M3 14h9"
                    stroke="#94A3B8"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-600">
                {reports.length === 0
                  ? "No reports have been submitted yet"
                  : "No reports match this filter"}
              </p>
              {reports.length > 0 && (
                <button
                  onClick={() => {
                    setStatusFilter("All")
                    setCategoryFilter("All")
                    setPriorityFilter("All")
                    setSearch("")
                    setUrgentFirst(false)
                  }}
                  className="text-xs text-[#2357C3] mt-2 font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                onSelect(r)
                onNav("admin-review")
              }}
              className="w-full text-left bg-white border border-slate-100 rounded-2xl overflow-hidden hover:border-[#2357C3]/30 hover:shadow-md transition-all"
              style={{
                borderLeft: `4px solid ${
                  r.reviewed ? PRIORITY_ACCENT[r.priority] : "#CBD5E1"
                }`,
              }}
            >
              {/* Mobile */}
              <div className="md:hidden p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <CategoryIcon category={r.category} size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: r.reviewed
                              ? PRIORITY_ACCENT[r.priority]
                              : "#94A3B8",
                          }}
                        />
                        <p className="text-xs font-semibold text-slate-700">
                          {r.reviewed
                            ? r.category
                            : (r.aiCategory ?? "Awaiting review")}
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-400">{r.id}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {!r.reviewed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-700 bg-indigo-100 font-semibold">
                        Review
                      </span>
                    )}
                    {r.reviewed ? (
                      <PriorityPill priority={r.priority} />
                    ) : r.aiPriority ? (
                      <span className="text-[10px] font-semibold text-indigo-700">
                        AI · {r.aiPriority}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Not set</span>
                    )}
                    <StatusPill status={r.status} />
                    {r.needsVerification && (
                      <span className="text-[10px] font-semibold text-amber-800">
                        Verify
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-600 line-clamp-1 mb-2">
                  {r.description}
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <PinIcon />
                    {r.location}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {r.resident}
                  </span>
                </div>
              </div>
              {/* Desktop table row */}
              <div
                className="hidden md:grid gap-4 items-center px-4 py-3.5"
                style={{
                  gridTemplateColumns: "160px 1fr 160px 80px 110px 130px",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <CategoryIcon category={r.category} size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">
                      {r.reviewed
                        ? r.category
                        : (r.aiCategory ?? "Awaiting review")}
                    </p>
                    <p className="text-[10px] text-slate-400">{r.id}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-700 line-clamp-1">
                    {r.description}
                  </p>
                  {!r.reviewed && (
                    <span className="inline-flex items-center gap-0.5 mt-0.5 text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-700 bg-indigo-100 font-semibold">
                      ✦ Needs review
                      {r.aiPriority ? ` · AI ${r.aiPriority}` : ""}
                    </span>
                  )}
                  {r.needsVerification && (
                    <span className="ml-1 inline-flex mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold">
                      AI needs verification
                    </span>
                  )}
                </div>
                <span className="flex items-center gap-1 text-xs text-slate-500 truncate">
                  <PinIcon />
                  <span className="truncate">{r.location}</span>
                </span>
                {r.reviewed ? (
                  <PriorityPill priority={r.priority} />
                ) : r.aiPriority ? (
                  <span className="text-xs font-semibold text-indigo-700">
                    AI · {r.aiPriority}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">Not set</span>
                )}
                <StatusPill status={r.status} />
                <span className="text-xs text-slate-600 font-medium truncate">
                  {r.resident}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Admin: Statistics ────────────────────────────────────────────────────────

function AdminStatistics({
  reports,
  onNav,
  screen,
}: {
  reports: Report[]
  onNav: (s: Screen) => void
  screen: Screen
}) {
  const total = reports.length
  const resolved = reports.filter(
    (report) => report.status === "Resolved",
  ).length
  const active = reports.filter((report) => isOpenStatus(report.status)).length
  const urgent = reports.filter(
    (report) => effectivePriority(report) === "Urgent",
  ).length
  const aiReviewed = reports.filter(
    (report) => report.aiStatus === "done" && report.reviewed,
  )

  const overrides = aiReviewed.filter(
    (report) =>
      report.category !== report.aiCategory ||
      report.priority !== report.aiPriority,
  ).length

  const resolutionRate = total ? Math.round((resolved / total) * 100) : 0

  const reviewRate = aiReviewed.length
    ? Math.round((overrides / aiReviewed.length) * 100)
    : 0

  const statusData = ([
    "Submitted",
    "In Review",
    "In Progress",
    "Resolved",
    "Rejected",
  ] as Status[]).map((status) => ({
    label: status,
    value: reports.filter((report) => report.status === status).length,
    color: STATUS_ACCENT[status],
  }))
  const categoryData = CATEGORIES.map((category) => ({
    label: category,
    value: reports.filter((report) => effectiveCategory(report) === category)
      .length,
  }))
  const priorityData = (["Low", "Medium", "High", "Urgent"] as Priority[]).map(
    (priority) => ({
      label: priority,
      value: reports.filter((report) => effectivePriority(report) === priority)
        .length,
      color: PRIORITY_ACCENT[priority],
    }),
  )
  const maxCategory = Math.max(...categoryData.map((item) => item.value), 1)

  return (
    <div className="flex h-full">
      <AdminSidebar screen={screen} onNav={onNav} />
      <div className="flex-1 overflow-hidden flex flex-col bg-[#F0F4FF]">
        <div className="shrink-0 border-b border-slate-100 bg-white px-5 md:px-8 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#2357C3] mb-1">
                Administration
              </p>
              <h1 className="text-xl font-bold text-slate-900">
                Statistics Dashboard
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Live overview of all {total} community reports
              </p>
            </div>
            <button
              onClick={() => onNav("admin-dashboard")}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 12 6 8l4-4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Reports
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-5 md:py-6">
          <div className="max-w-6xl space-y-5">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
              {[
                {
                  label: "Total reports",
                  value: total,
                  detail: `${active} currently active`,
                  color: "#2357C3",
                  bg: "#EFF4FF",
                },
                {
                  label: "Resolution rate",
                  value: `${resolutionRate}%`,
                  detail: `${resolved} reports resolved`,
                  color: "#059669",
                  bg: "#ECFDF5",
                },
                {
                  label: "AI override rate",
                  value: `${reviewRate}%`,
                  detail: `${overrides} overrides / ${aiReviewed.length} reviewed`,
                  color: "#6366F1",
                  bg: "#EEF2FF",
                },
                {
                  label: "Urgent reports",
                  value: urgent,
                  detail:
                    urgent === 1 ? "Requires attention" : "Require attention",
                  color: "#DC2626",
                  bg: "#FEF2F2",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white p-4 md:p-5 shadow-sm"
                  style={{ background: stat.bg }}
                >
                  <p className="text-[10px] md:text-xs font-bold uppercase tracking-wide text-slate-500">
                    {stat.label}
                  </p>
                  <p
                    className="text-2xl md:text-3xl font-bold mt-2"
                    style={{ color: stat.color }}
                  >
                    {stat.value}
                  </p>
                  <p className="text-[11px] md:text-xs text-slate-500 mt-1">
                    {stat.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">
                      Reports by Status
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Current workflow distribution
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {total} total
                  </span>
                </div>
                <div className="space-y-4">
                  {statusData.map((item) => {
                    const percentage = total
                      ? Math.round((item.value / total) * 100)
                      : 0
                    return (
                      <div key={item.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ background: item.color }}
                            />
                            {item.label}
                          </span>
                          <span className="text-xs font-bold text-slate-700">
                            {item.value}{" "}
                            <span className="font-medium text-slate-400">
                              ({percentage}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${percentage}%`,
                              background: item.color,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-sm font-bold text-slate-800">
                    Reports by Category
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Issue volume across city services
                  </p>
                </div>
                <div className="space-y-3">
                  {categoryData.map((item) => (
                    <div
                      key={item.label}
                      className="grid grid-cols-[100px_1fr_24px] items-center gap-3"
                    >
                      <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <CategoryIcon category={item.label} size={13} />
                        {item.label}
                      </span>
                      <div className="h-7 rounded-lg bg-slate-50 overflow-hidden">
                        <div
                          className="h-full rounded-lg bg-[#2357C3]/15 border-r-2 border-[#2357C3] transition-all"
                          style={{
                            width: `${(item.value / maxCategory) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-700 text-right">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <div className="mb-5">
                  <h2 className="text-sm font-bold text-slate-800">
                    Priority Breakdown
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Report urgency distribution
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {priorityData.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-3 text-center"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full block mx-auto mb-2"
                        style={{ background: item.color }}
                      />
                      <p className="text-xl font-bold text-slate-800">
                        {item.value}
                      </p>
                      <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-indigo-100 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">
                      Human AI Oversight
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Admin decisions compared with AI suggestions
                    </p>
                  </div>
                  <AIBadge />
                </div>
                <div className="flex items-center gap-5">
                  <div className="relative w-24 h-24 shrink-0">
                    <svg width="96" height="96" viewBox="0 0 96 96">
                      <circle
                        cx="48"
                        cy="48"
                        r="38"
                        fill="none"
                        stroke="#E2E8F0"
                        strokeWidth="10"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="38"
                        fill="none"
                        stroke="#6366F1"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${reviewRate * 2.388} 238.8`}
                        transform="rotate(-90 48 48)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold text-indigo-600">
                        {reviewRate}%
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        Admin overrides
                      </span>
                      <span className="text-sm font-bold text-emerald-600">
                        {overrides}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        AI results reviewed
                      </span>
                      <span className="text-sm font-bold text-amber-600">
                        {aiReviewed.length}
                      </span>
                    </div>
                    <p className="pt-2 border-t border-slate-100 text-[11px] leading-relaxed text-slate-400">
                      Override rate counts reviewed AI results where the admin
                      changed category or priority.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Admin: Review ────────────────────────────────────────────────────────────

function PhotoOnlyModelCard({ photo }: { photo?: string }) {
  const [result, setResult] = useState<ImageModelResult | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading")

  useEffect(() => {
    let active = true
    if (!photo) {
      setState("failed")
      return () => {
        active = false
      }
    }
    setResult(null)
    setState("loading")
    classifyReportPhoto(photo)
      .then((prediction) => {
        if (!active) return
        setResult(prediction)
        setState("ready")
      })
      .catch(() => {
        if (active) setState("failed")
      })
    return () => {
      active = false
    }
  }, [photo])

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Trained photo classifier</h3>
      <p className="mt-1 text-xs text-slate-600">
        This model analyzes only the photo and may suggest Infrastructure or Sanitation. Separately, Gemini analyzes the report description and optional photo to suggest a category, priority, summary, and photo consistency. Staff set the status and final values.
      </p>
      {state === "loading" && (
        <p className="mt-3 text-sm text-slate-600">Analyzing the attached photo…</p>
      )}
      {state === "failed" && (
        <p className="mt-3 text-sm text-slate-600">
          No photo model result is available. Gemini triage is separate.
        </p>
      )}
      {state === "ready" && result && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-slate-800">
            {result.category ?? "Uncertain — staff review needed"}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">
            Classification score {Math.round(result.score * 100)}%
          </span>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        Trained photo categories: road infrastructure and littering.
      </p>
    </div>
  )
}

function AdminReview({
  report,
  onBack,
  onUpdate,
  onTriage,
  onNav,
  screen,
}: {
  report: Report
  onBack: () => void
  onUpdate: (
    id: string,
    updates: {
      status?: Status
      category?: Category
      priority?: Priority
      verified?: boolean
      comment?: string
    },
  ) => Promise<void>
  onTriage: () => Promise<void>
  onNav: (s: Screen) => void
  screen: Screen
}) {
  const [status, setStatus] = useState<Status>(report.status)
  const [category, setCategory] = useState<Category | "">(
    report.reviewed
      ? report.category
      : "",
  )
  const [priority, setPriority] = useState<Priority | "">(
    report.reviewed
      ? report.priority
      : "",
  )
  const [categoryChanged, setCategoryChanged] = useState(false)
  const [priorityChanged, setPriorityChanged] = useState(false)
  const [verifiedConfirmed, setVerifiedConfirmed] = useState(false)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const statusLocked = report.status === "Resolved" || report.status === "Rejected"
  const currentStatusRank = STATUS_STEPS.indexOf(report.status)
  const statusChangeNeedsValues =
    status !== report.status && (!category || !priority)
  const run = async (updates: {
    status?: Status
    category?: Category
    priority?: Priority
    verified?: boolean
    comment?: string
  }) => {
    setBusy(true)
    setError("")
    try {
      await onUpdate(report.id, updates)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save review.")
      return false
    } finally {
      setBusy(false)
    }
  }
  const hasChanges =
    status !== report.status ||
    (categoryChanged && Boolean(category)) ||
    (priorityChanged && Boolean(priority)) ||
    (report.needsVerification && verifiedConfirmed) ||
    Boolean(comment.trim())
  const saveChanges = () => {
    const updates: {
      status?: Status
      category?: Category
      priority?: Priority
      verified?: boolean
      comment?: string
    } = {}
    if (status !== report.status) updates.status = status
    if (categoryChanged && category) updates.category = category
    if (priorityChanged && priority) updates.priority = priority
    if (report.needsVerification && verifiedConfirmed) updates.verified = true
    if (comment.trim()) updates.comment = comment.trim()
    if (Object.keys(updates).length)
      void run(updates).then((saved) => {
        if (saved) setComment("")
      })
  }
  const acceptAI = () => {
    if (report.aiCategory) {
      setCategory(report.aiCategory as Category)
      setCategoryChanged(true)
    }
    if (report.aiPriority) {
      setPriority(report.aiPriority as Priority)
      setPriorityChanged(true)
    }
  }
  const triage = async () => {
    setBusy(true)
    setError("")
    try {
      await onTriage()
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI triage failed.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex h-full">
      <AdminSidebar screen={screen} onNav={onNav} />
      <div className="flex-1 overflow-y-auto bg-[#F0F4FF]">
        <div className="flex items-center gap-3 border-b bg-white px-5 py-5 md:px-8">
          <button
            onClick={onBack}
            className="rounded-full bg-slate-100 p-2"
            aria-label="Back to reports"
          >
            ←
          </button>
          <div className="flex-1">
            <p className="text-xs text-slate-500">
              {report.id} · {report.resident}
            </p>
            <h1 className="text-lg font-bold">Review Report</h1>
          </div>
          <StatusPill status={report.status} />
        </div>
        <div className="grid max-w-5xl grid-cols-1 gap-6 p-5 md:grid-cols-2 md:p-8">
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase text-slate-400">
              Resident submission
            </h2>
            {report.photo && (
              <ReportPhoto src={report.photo} alt="Report photo" />
            )}
            <div className="rounded-2xl border bg-white p-4">
              <p className="text-sm text-slate-700">{report.description}</p>
              <p className="mt-3 text-xs text-slate-500">
                <PinIcon /> {report.location}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Submitted {formatManilaDate(report.submittedAt)}
              </p>
            </div>
            {report.history?.length ? (
              <div className="rounded-2xl border bg-white p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase text-slate-400">
                  Status history
                </h3>
                {report.history.map((item, i) => (
                  <div key={i} className="border-l-2 border-blue-200 pb-4 pl-3">
                    <p className="text-sm font-semibold">{item.to_status}</p>
                    <p className="text-xs text-slate-500">
                      {formatManilaDate(item.created_at)} · {item.actor}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase text-slate-400">
              AI triage and admin decision
            </h2>
            <div className="rounded-2xl border border-indigo-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <AIBadge />
                <span className="text-xs capitalize text-slate-500">
                  {report.aiStatus || "pending"}
                </span>
              </div>
              {report.aiStatus !== "done" && (
                <button
                  disabled={busy}
                  onClick={triage}
                  className="mt-3 min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50"
                >
                  {busy
                    ? "Working…"
                    : report.aiStatus === "failed"
                      ? "Retry AI triage"
                      : report.aiStatus === "running"
                        ? "Check AI triage"
                        : "Run AI triage"}
                </button>
              )}
              {report.aiStatus === "done" && (
                <div className="mt-4 space-y-2 text-sm">
                  <p>{report.aiSummary}</p>
                  <p>
                    AI suggests: <b>{report.aiCategory || "—"}</b> ·{" "}
                    <b>{report.aiPriority || "—"}</b> · Photo consistency:{" "}
                    <b>{report.aiConsistency || "unclear"}</b>
                  </p>
                  {report.aiVisibleIssue && (
                    <p>Visible issue: {report.aiVisibleIssue}</p>
                  )}
                  {report.needsVerification && (
                    <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
                      Needs human verification. {report.aiReason}
                    </p>
                  )}
                  {report.aiCategory && report.aiPriority && (
                    <button
                      disabled={busy || statusLocked}
                      onClick={acceptAI}
                      className="mt-2 min-h-11 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Use AI suggestions
                    </button>
                  )}
                </div>
              )}
              {report.aiStatus === "failed" && (
                <p className="mt-3 text-sm text-amber-700">
                  AI could not complete this report. Check the error details or
                  retry.
                </p>
              )}
            </div>
            {report.photo && <PhotoOnlyModelCard photo={report.photo} />}
            <div className="rounded-2xl border bg-white p-4">
              <p className="mb-3 text-xs font-semibold uppercase text-slate-400">
                Final admin values
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-500">
                  Category
                  <select
                    value={category}
                    disabled={statusLocked}
                    onChange={(e) => {
                      setCategory(e.target.value as Category | "")
                      setCategoryChanged(true)
                    }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">Choose category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-500">
                  Priority
                  <select
                    value={priority}
                    disabled={statusLocked}
                    onChange={(e) => {
                      setPriority(e.target.value as Priority | "")
                      setPriorityChanged(true)
                    }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">Choose priority</option>
                    {(["Low", "Medium", "High", "Urgent"] as Priority[]).map(
                      (p) => (
                        <option key={p}>{p}</option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              {report.needsVerification && (
                <label className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    checked={verifiedConfirmed}
                    disabled={statusLocked}
                    onChange={(e) => setVerifiedConfirmed(e.target.checked)}
                    className="mt-0.5"
                  />
                  I reviewed the issue/photo and confirm it no longer needs
                  verification.
                </label>
              )}
              <div className="mt-4">
                <label
                  htmlFor="report-status"
                  className="text-xs font-medium text-slate-600"
                >
                  Report status
                </label>
                <select
                  id="report-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                  disabled={statusLocked}
                  className="mt-1 min-h-11 w-full rounded-lg border px-3 py-2 text-sm text-slate-800"
                >
                  {status === "Submitted" && (
                    <option value="Submitted" disabled>
                      Submitted (initial status)
                    </option>
                  )}
                  {STATUS_STEPS.filter(
                    (s) =>
                      s !== "Submitted" &&
                      (s === "Rejected" || STATUS_STEPS.indexOf(s) >= currentStatusRank),
                  ).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {statusLocked && (
                  <p className="mt-2 text-xs font-medium text-slate-600">
                    This report is closed. Final admin values are locked and cannot be changed.
                  </p>
                )}
                {statusChangeNeedsValues && (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    Choose a final category and priority before changing the report status.
                  </p>
                )}
              </div>
              <label htmlFor="review-comment" className="mt-4 block text-xs font-medium text-slate-600">
                Comment for resident (optional)
              </label>
              <textarea
                id="review-comment"
                value={comment}
                disabled={statusLocked}
                onChange={(e) => setComment(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Share an update with the resident…"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              />
              <button
                disabled={busy || statusLocked || !hasChanges || statusChangeNeedsValues}
                onClick={saveChanges}
                className="mt-4 min-h-11 w-full rounded-xl bg-[#2357C3] py-3 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy
                  ? "Saving…"
                  : status === "Resolved" || status === "Rejected"
                    ? "Save Final Review"
                    : "Save Review"}
              </button>
            </div>
            <div className="rounded-2xl border bg-white p-4">
              <p className="mb-3 text-xs font-semibold uppercase text-slate-400">
                Comments visible to resident
              </p>
              {report.adminComments?.map((item) => (
                <div key={item.id} className="mb-2 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold">
                    {item.author} · {formatManilaDate(item.createdAt)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{item.text}</p>
                </div>
              ))}
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
function toReport(data: ApiReport, user: User): Report {
  return {
    id: data.code,
    reportId: data.id,
    description: data.description,
    location: data.location_text,
    category: (data.category || "Other") as Category,

    priority: (data.priority || "Medium") as Priority,
    status: data.status,
    submittedAt: data.created_at,
    updatedAt: data.updated_at,
    photo: data.photo_id ? api.photoUrl(data.photo_id) : undefined,
    photoHint: data.add_photo_hint,
    aiSummary: data.ai_summary || "No AI triage has been run yet.",
    reviewed: Boolean(data.category && data.priority),

    aiConfirmed: Boolean(
      data.ai_status === "done" &&
        data.category &&
        data.priority &&
        data.category === data.ai_category &&
        data.priority === data.ai_priority,
    ),
    resident: data.resident || user.name,
    aiStatus: data.ai_status,
    aiConsistency: data.ai_consistency,
    aiConfidence: data.ai_confidence,
    aiReason: data.ai_reason,
    needsVerification: Boolean(data.needs_verification),

    aiCategory: data.ai_category,

    aiPriority: data.ai_priority,

    aiVisibleIssue: data.ai_visible_issue,
    adminComments:
      data.comments?.map((item) => ({
        id: String(item.id),
        author: item.author,
        text: item.body,
        createdAt: item.created_at,
      })) ?? [],

    history: data.history ?? [],
  } as Report
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(
    () => readRoute().screen ?? "onboarding",
  )
  const [reports, setReports] = useState<Report[]>([])
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const autoTriageTimes = useRef(new Map<number, number>())

  useEffect(() => {
    if (!currentUser) return
    const expireSession = () => {
      setCurrentUser(null)
      setReports([])
      setSelectedReport(null)
      setScreen("onboarding")
      window.history.replaceState(null, "", window.location.pathname)
      setError("Your session expired. Please sign in again.")
    }
    window.addEventListener("civicai:session-expired", expireSession)
    return () =>
      window.removeEventListener("civicai:session-expired", expireSession)
  }, [currentUser?.id])

  const refreshReports = async (user: User) => {
    const rows = await api.reports()
    const next = rows.map((row) => toReport(row, user))
    setReports(next)
    const route = readRoute()
    setSelectedReport((old) =>
      old
        ? (next.find((item) => item.reportId === old.reportId) ?? old)
        : route.reportId
          ? (next.find((item) => item.reportId === route.reportId) ?? null)
          : null,
    )
    if (
      route.reportId &&
      !next.some((item) => item.reportId === route.reportId)
    )
      setScreen(user.role === "admin" ? "admin-dashboard" : "resident-home")
    return next
  }

  useEffect(() => {
    let active = true
    api
      .me()
      .then(async (user) => {
        if (!active) return
        setCurrentUser(user)
        const route = readRoute()
        const validForRole =
          route.screen &&
          (user.role === "admin"
            ? route.screen.startsWith("admin-")
            : route.screen.startsWith("resident-"))
        setScreen(
          validForRole
            ? route.screen!
            : user.role === "admin"
              ? "admin-dashboard"
              : "resident-home",
        )
        try {
          await refreshReports(user)
        } catch (e) {
          if (active)
            setError(e instanceof Error ? e.message : "Could not load reports.")
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!currentUser || loading || screen === "onboarding") return
    const url = new URL(window.location.href)
    url.searchParams.set("screen", screen)
    if (
      ["admin-review", "resident-detail", "resident-ai"].includes(screen) &&
      selectedReport
    )
      url.searchParams.set("report", String(selectedReport.reportId))
    else url.searchParams.delete("report")
    window.history.replaceState(null, "", url)
  }, [currentUser?.id, loading, screen, selectedReport?.reportId])

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") return
    const now = Date.now()
    reports.forEach((report) => {
      if (report.aiStatus !== "pending" && report.aiStatus !== "running") return
      const lastAttempt = autoTriageTimes.current.get(report.reportId) ?? 0
      if (now - lastAttempt < 60_000) return
      autoTriageTimes.current.set(report.reportId, now)
      void api
        .runTriage(report.reportId)
        .then(() => refreshReports(currentUser))
        .catch(() => {})
    })
  }, [currentUser?.id, currentUser?.role, reports])

  useEffect(() => {
    if (!currentUser) return
    const timer = window.setInterval(() => {
      api
        .reports()
        .then((rows) => {
          const next = rows.map((row) => toReport(row, currentUser))
          setReports(next)
          setSelectedReport((old) =>
            old
              ? (next.find((item) => item.reportId === old.reportId) ?? old)
              : null,
          )
        })
        .catch(() => {})
    }, 8000)
    return () => window.clearInterval(timer)
  }, [currentUser?.id, currentUser?.role])

  const handleAuth = async (user: User) => {
    setCurrentUser(user)
    setError("")
    setScreen(user.role === "admin" ? "admin-dashboard" : "resident-home")
    await refreshReports(user)
  }
  const handleNav = async (next: Screen) => {
    if (next === "onboarding") {
      try {
        await api.logout()
      } catch {
        /* Return to login even if the session already expired. */
      }
      setCurrentUser(null)
      setReports([])
      setSelectedReport(null)
      window.history.replaceState(null, "", window.location.pathname)
    }
    setScreen(next)
  }
  const handleUpdateReport = async (
    id: string,
    updates: {
      status?: Status
      category?: Category
      priority?: Priority
      verified?: boolean
      comment?: string
    },
  ) => {
    const report = reports.find((item) => item.id === id)
    if (!report) return
    await api.updateReport({ id: report.reportId, ...updates })
    if (currentUser) await refreshReports(currentUser)
  }
  const handleTriage = async (reportId: number) => {
    try {
      await api.runTriage(reportId)
      if (currentUser) await refreshReports(currentUser)
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI triage failed.")
    }
  }

  const handleRetryPhoto = async (reportId: number, photo: File) => {
    await api.uploadPhoto(reportId, photo)
    const result = await api.runTriage(reportId)
    if (currentUser) await refreshReports(currentUser)
    if (result.ai_status === "failed")
      throw new Error(
        "Photo uploaded, but AI could not review the report. Staff can review it manually.",
      )
  }
  const handleSaveAddress = async (address: string) => {
    const result = await api.updateProfile(address)
    setCurrentUser((user) =>
      user ? { ...user, permanent_address: result.permanent_address } : user,
    )
  }
  const handleCreateReport = async (
    description: string,
    location: string,
    photo: File | null,
  ) => {
    const created = await api.createReport(description, location)
    if (photo) {
      try {
        await api.uploadPhoto(created.id, photo)
      } catch (e) {
        setError(
          `Report ${created.code} was submitted, but the photo did not upload: ${
            e instanceof Error ? e.message : "upload failed"
          }`,
        )
      }
    }

    void api
      .runTriage(created.id)
      .then((result) => {
        if (result.ai_status === "failed")
          setError(
            "Report saved, but automatic AI suggestions could not be generated. Staff can review it manually.",
          )
      })
      .catch(() =>
        setError(
          "Report saved, but automatic AI suggestions could not be generated. Staff can review it manually.",
        ),
      )
    if (!currentUser) return

    const refreshed = await refreshReports(currentUser)

    setSelectedReport(
      refreshed.find((item) => item.reportId === created.id) ?? {
        id: created.code,
        reportId: created.id,
        description,
        location,
        status: "Submitted",
        category: "Other",
        priority: "Medium",
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aiSummary:
          "AI suggestions are generated automatically for staff review.",
        aiConfirmed: false,
        resident: currentUser.name,
      },
    )
    setScreen("resident-ai")
  }

  const renderScreen = () => {
    if (loading)
      return (
        <div className="min-h-screen grid place-items-center text-slate-600">
          Loading CivicAI…
        </div>
      )
    if (!currentUser) return <Onboarding onSelect={handleAuth} />
    switch (screen) {
      case "resident-home":
        return (
          <ResidentHome
            reports={reports}
            onSelect={(r) => {
              setSelectedReport(r)
              setScreen("resident-detail")
            }}
            onNav={handleNav}
            screen={screen}
          />
        )
      case "resident-new":
        return (
          <ResidentNew
            onNav={handleNav}
            onSubmit={handleCreateReport}
            screen={screen}
            initialLocation={currentUser.permanent_address}
          />
        )
      case "resident-ai":
        return selectedReport ? (
          <ResidentAI
            report={selectedReport}
            onNav={handleNav}
            onRetryPhoto={handleRetryPhoto}
            screen={screen}
          />
        ) : null
      case "resident-detail":
        return selectedReport ? (
          <ResidentDetail
            report={selectedReport}
            onBack={() => setScreen("resident-home")}
            onNav={handleNav}
            onRetryPhoto={handleRetryPhoto}
            screen={screen}
          />
        ) : null
      case "resident-profile":
        return (
          <ResidentProfile
            reports={reports}
            onNav={handleNav}
            screen={screen}
            user={currentUser}
            onSaveAddress={handleSaveAddress}
          />
        )
      case "admin-dashboard":
        return (
          <AdminDashboard
            reports={reports}
            onSelect={(r) => {
              setSelectedReport(r)
              setScreen("admin-review")
            }}
            onNav={handleNav}
            screen={screen}
          />
        )
      case "admin-statistics":
        return (
          <AdminStatistics
            reports={reports}
            onNav={handleNav}
            screen={screen}
          />
        )
      case "admin-review":
        return selectedReport ? (
          <AdminReview
            key={selectedReport.reportId}
            report={selectedReport}
            onBack={() => setScreen("admin-dashboard")}
            onUpdate={handleUpdateReport}
            onTriage={() => handleTriage(selectedReport.reportId)}
            onNav={handleNav}
            screen={screen}
          />
        ) : null
      default:
        return null
    }
  }

  return (
    <CivicContext.Provider value={{ user: currentUser, reports }}>
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="z-50 flex shrink-0 items-start justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm"
          >
            {error}
            <button onClick={() => setError("")} className="shrink-0 font-bold">
              Dismiss
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1">{renderScreen()}</div>
      </div>
    </CivicContext.Provider>
  )
}
