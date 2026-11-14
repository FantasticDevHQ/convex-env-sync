export const cloudTarget = { kind: 'cloud', url: 'https://example-preview.convex.cloud', teamId: 1, projectId: 2, deploymentId: 3, deploymentType: 'preview' };
export function syncFixture() {
  const remote = { TOKEN: 'old-synthetic-value', UNRELATED: 'unrelated-synthetic-value' };
  const writes = [];
  let defaultsWrites = 0;
  let mismatch = false;
  const fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.origin === 'https://api.convex.dev') { defaultsWrites++; throw new Error('Unexpected defaults access'); }
    if (parsed.origin !== cloudTarget.url) throw new Error('Unexpected target');
    if (parsed.pathname.endsWith('/deployment_info')) return Response.json({ kind: 'cloud', id: 3, projectId: 2, teamId: 1, deploymentType: 'preview' });
    if (parsed.pathname.endsWith('/list_environment_variables')) return Response.json({ environmentVariables: mismatch && writes.length ? {} : remote });
    if (!parsed.pathname.endsWith('/update_environment_variables')) throw new Error('Unexpected API');
    const body = typeof options.body === 'string' ? options.body : new TextDecoder().decode(options.body);
    const { changes } = JSON.parse(body);
    writes.push(changes);
    for (const { name, value } of changes) if (value == null) delete remote[name]; else remote[name] = value;
    return Response.json({});
  };
  return { remote, writes, fetch, get defaultsWrites() { return defaultsWrites; }, failVerification() { mismatch = true; } };
}
