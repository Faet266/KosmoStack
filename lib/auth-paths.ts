export const sessionCookie = "kosmostack-session"
export const challengeCookie = "kosmostack-challenge"

export function afterLogin(value: string | null | undefined) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/u.test(value)) return "/"
  const path = new URL(value, "http://localhost").pathname
  return path === "/login" || path.startsWith("/api/") || path.startsWith("/_next/") ? "/" : value
}

export const authFeedback = {
  details: "Введите фамилию и имя, затем действующий адрес почты.",
  rate: "Слишком много запросов кода. Повторите позже.",
  digits: "Введите шесть цифр с экрана.",
  expired: "Код неверен, истёк или исчерпаны попытки. При необходимости запросите новый.",
  unavailable: "Локальная база входа недоступна. Повторите позже.",
} as const
