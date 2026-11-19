export function matchNames(catalog, patch) {
  const ids = catalog?.ids[patch] ?? {};
  const shared = catalog?.shared ?? {};
  const labels = catalog?.labels ?? {};
  const label = (key) => Object.hasOwn(labels, key) ? labels[key] : undefined;
  const idKey = (code) => ids[code] ?? shared[code];

  return {
    skill(value, hero) {
      if (value == null || value === '') return '—';
      const code = String(value);
      if (!/^\d+$/.test(code)) return label(code) ?? code;
      const key = idKey(code);
      if (Array.isArray(key)) {
        const prefix = `specialbonusunique${hero?.replaceAll('_', '') ?? 'unknown'}`;
        const candidates = key.filter(name => name.replaceAll('_', '').startsWith(prefix));
        return (candidates.length === 1 ? label(candidates[0]) : null) ?? `技能 ${code}`;
      }
      return label(key) ?? `技能 ${code}`;
    },
    item(value) {
      if (value == null || value === '') return '—';
      const code = String(value);
      if (/^\d+$/.test(code)) {
        const record = idKey(code);
        const keys = Array.isArray(record) ? record.filter(key => key.startsWith('item_')) : [record];
        return (keys.length === 1 ? label(keys[0]) : null) ?? code;
      }
      const key = code.startsWith('item_') ? code : `item_${code}`;
      return label(key) ?? code;
    },
  };
}
