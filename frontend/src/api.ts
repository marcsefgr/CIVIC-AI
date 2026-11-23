export type User = {
  id: number
  name: string
  email: string
  role: "resident" | "admin"
  permanent_address?: string | null
}
export type ApiReport = {
  id: number
  code: string
  description: string
  location_text: string
  status: "Submitted" | "In Review" | "In Progress" | "Resolved" | "Rejected"
  category: string | null
  priority: string | null
  ai_summary: string | null
  photo_id: number | null
  add_photo_hint?: string | null
  created_at: string
  updated_at: string
  resident?: string
  ai_status?: "pending" | "running" | "done" | "failed"
  ai_category?: string | null
  ai_priority?: string | null
  ai_visible_issue?: string | null
  ai_consistency?: "match" | "partial" | "mismatch" | "unclear" | null
  ai_confidence?: number | null
  ai_reason?: string | null
  needs_verification?: number
  comments?: { id: number; author: string; body: string; created_at: string }[]
  history?: {
    from_status: string | null
    to_status: string
    created_at: string
    actor: string
  }[]
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData) && init.body !== undefined)
    headers.set("Content-Type", "application/json")
  const response = await fetch(`/api/${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  })
  const contentType = response.headers.get("content-type") ?? ""
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text()
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "login.php" &&
      path !== "register.php" &&
      path !== "me.php"
    ) {
      window.dispatchEvent(new Event("civicai:session-expired"))
    }
    const message =
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : `Request failed (${response.status})`
    throw new Error(message)
  }
  return body as T
}

export const api = {
  me: () => request<User>("me.php"),
  login: (email: string, password: string) =>
    request<User>("login.php", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (
    name: string,
    email: string,
    password: string,
    adultConfirm: boolean,
  ) =>
    request<{ ok: boolean }>("register.php", {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        password,
        adult_confirm: adultConfirm,
      }),
    }),
  logout: () =>
    request<{ ok: boolean }>("logout.php", { method: "POST", body: "{}" }),
  reports: () => request<ApiReport[]>("reports.php"),
  createReport: (
    description: string,
    location: string,
  ) =>
    request<{ id: number; code: string }>("reports.php", {
      method: "POST",
      body: JSON.stringify({
        description,
        location,
      }),
    }),
  uploadPhoto: (reportId: number, photo: File) => {
    const form = new FormData()
    form.set("report_id", String(reportId))
    form.set("photo", photo)
    return request<{ id: number }>("photo.php", { method: "POST", body: form })
  },
  updateReport: (payload: {
    id: number
    status?: string
    category?: string
    priority?: string
    verified?: boolean
    comment?: string
  }) =>
    request<{ ok: boolean }>("report_review.php", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProfile: (permanentAddress: string) =>
    request<{ permanent_address: string }>("profile.php", {
      method: "POST",
      body: JSON.stringify({ permanent_address: permanentAddress }),
    }),
  runTriage: (reportId: number) =>
    request<Record<string, unknown>>("triage.php", {
      method: "POST",
      body: JSON.stringify({ report_id: reportId }),
    }),

  addComment: (reportId: number, body: string) =>
    request<{ id: number }>("comments.php", {
      method: "POST",
      body: JSON.stringify({ report_id: reportId, body }),
    }),
  photoUrl: (photoId: number) =>
    `/api/photo.php?id=${encodeURIComponent(photoId)}`,
}
