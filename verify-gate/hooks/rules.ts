export type Rules = { watch: RegExp; check: RegExp; ship: RegExp }

export const rules = (o: { watch?: unknown; check?: unknown; ship?: unknown }): Rules => ({
  watch: new RegExp(String(o.watch ?? '')),
  check: new RegExp(String(o.check ?? '')),
  ship: new RegExp(String(o.ship ?? '')),
})

// `<check> && <ship>` verifies before it ships: the shell skips the ship when the check fails.
export const checksFirst = (command: string, r: Rules): boolean => {
  const c = r.check.exec(command)
  const s = r.ship.exec(command)
  if (!c || !s || c.index > s.index) return false
  const between = command.slice(c.index + c[0].length, s.index)
  return /&&/.test(between) && !/;|\|\||\n|(^|[^&])&([^&]|$)/.test(between)
}
