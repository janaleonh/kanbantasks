export function sharedDraft(payloads: { shareType: string; value: string }[]) {
  const text = payloads.filter(payload => ['text', 'url'].includes(payload.shareType) && typeof payload.value === 'string').map(payload => payload.value).join('\n\n');
  if (text.length > 20000) throw new Error('Der geteilte Text ist zu lang (maximal 20.000 Zeichen).');
  return { title: text.split(/\r?\n/).find(line => line.trim())?.trim().slice(0, 300) || '', notes: text };
}
