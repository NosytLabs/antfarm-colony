/** OpenCode local plugin. Copies only status metadata to a loopback colony. */
export const AntfarmColony = async () => {
  const url = new URL(process.env.ANTFARM_COLONY_URL || 'http://127.0.0.1:8114');
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password) {
    throw new Error('ANTFARM_COLONY_URL must be an HTTP loopback URL without credentials');
  }
  const endpoint = `${url.origin}/api/bridge/events`;
  const roles = new Map();
  const queue = [];
  let sending = false;
  let retryAfter = 0;
  const roleFor = tool => /read|search|grep|glob|fetch|list/i.test(tool) ? 'scout' : /test|verify|review/i.test(tool) ? 'verifier' : /plan|todo/i.test(tool) ? 'planner' : 'builder';
  async function drain() {
    if (sending) return;
    sending = true;
    try {
      while (queue.length) {
        const event = queue.shift();
        if (Date.now() < retryAfter) continue;
        try {
          const response = await fetch(endpoint, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify(event), signal: AbortSignal.timeout(1_000),
          });
          if (!response.ok) retryAfter = Date.now() + 3_000;
        } catch { retryAfter = Date.now() + 3_000; }
      }
    } finally { sending = false; }
  }
  function emit(sessionId, status, tool) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 120) return;
    if (typeof tool === 'string') roles.set(sessionId, roleFor(tool));
    const role = roles.get(sessionId) || 'builder';
    if (roles.size > 100) roles.delete(roles.keys().next().value);
    queue.push({source:'opencode',sessionId,eventId:crypto.randomUUID(),status,role,name:`OpenCode ${role}`, ...(tool ? {tool:String(tool).slice(0,80)} : {})});
    if (queue.length > 80) queue.splice(0, queue.length - 80);
    void drain();
  }
  return {
    'tool.execute.before': async input => { emit(input.sessionID, 'running', input.tool); },
    'tool.execute.after': async input => { emit(input.sessionID, 'running', input.tool); },
    event: async ({event}) => {
      const properties = event.properties || {};
      const id = properties.sessionID || properties.info?.id;
      if (event.type === 'session.idle' || event.type === 'session.deleted') emit(id, 'idle');
      else if (event.type === 'session.error') emit(id, 'failed');
      else if (event.type === 'permission.asked') emit(id, 'blocked');
      else if (event.type === 'permission.replied') emit(id, 'running');
      else if (event.type === 'session.status') emit(id, properties.status?.type === 'idle' ? 'idle' : 'running');
    },
  };
};
