// Redacted evidence only: never return credentials, prompts, or identifier values.
export function requestEvidence(headers, body) {
  const h = new Headers(headers);
  const raw = h.get('x-codex-turn-metadata') ?? body.client_metadata?.['x-codex-turn-metadata'];
  let metadata;
  try { metadata = JSON.parse(raw); } catch {}
  const knownIDs = ['installation_id', 'session_id', 'thread_id', 'turn_id', 'window_id'];
  const originator = h.get('originator');
  return {
    originator: originator === null ? 'absent' : ['pi', 'codex-tui', 'codex_cli_rs'].includes(originator) ? originator : 'other',
    turnMetadataPresent: raw != null,
    turnMetadataIDsPresent: knownIDs.filter(k => metadata && Object.hasOwn(metadata, k)),
    stream: body.stream === true,
    store: typeof body.store === 'boolean' ? body.store : 'unspecified',
    inputPresent: Object.hasOwn(body, 'input'),
    toolsPresent: Array.isArray(body.tools) && body.tools.length > 0,
    previousResponseIDPresent: typeof body.previous_response_id === 'string',
  };
}

export function modelAcceptance(observed, requested, expectedOverride) {
  const expected = (expectedOverride || (['gpt-6', 'gpt-6-astra'].includes(requested) ? 'gpt-6,gpt-6-astra' : requested))
    .split(',').map(x => x.trim()).filter(Boolean);
  return { expected, observed: [...observed], passed: observed.size > 0 && [...observed].every(m => expected.includes(m)) };
}

export function observeSSELine(line, models, terminals) {
  if (!line.startsWith('data:')) return;
  let event;
  try { event = JSON.parse(line.slice(5)); } catch { return; }
  const model = event.response?.model;
  if (typeof model === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(model)) models.add(model);
  if (['response.completed', 'response.failed', 'response.incomplete'].includes(event.type)) terminals.add(event.type);
}
