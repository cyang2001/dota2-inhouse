export function matchNames(catalog, patch) {
  const ids = catalog?.ids[patch] ?? {};
  const shared = catalog?.shared ?? {};
  const labels = catalog?.labels ?? {};
  const label = (key) => Object.hasOwn(labels, key) ? labels[key] : undefined;
  const idKey = (code) => ids[code] ?? shared[code];

  return {
    skill(value) {
      if (value == null || value === '') return '—';
      const code = String(value);
      return /^\d+$/.test(code) ? label(idKey(code)) ?? `技能 ${code}` : label(code) ?? code;
    },
    item(value) {
      if (value == null || value === '') return '—';
      const code = String(value);
      if (/^\d+$/.test(code)) return label(idKey(code)) ?? code;
      const key = code.startsWith('item_') ? code : `item_${code}`;
      return label(key) ?? code;
    },
  };
}
