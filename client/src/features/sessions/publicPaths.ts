export function sessionPublicPath(view: "join" | "present" | "summary", code: string) {
  return "/sessions/" + view + "?" + new URLSearchParams({ code }).toString();
}
