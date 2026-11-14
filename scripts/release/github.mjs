export const repository = 'FantasticDevHQ/convex-env-sync';

export function githubApi(token = process.env.GH_TOKEN) {
  if (!token) throw new Error('Release GitHub App authentication is required');
  return async (method, path, data) => {
    const response = await fetch(
      `https://api.github.com/repos/${repository}${path}`,
      {
        method,
        redirect: 'error',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw new Error(`Release GitHub request failed (${response.status})`);
    return response.status === 204 ? undefined : response.json();
  };
}

export async function readContent(api, path, sha) {
  const file = await api('GET', `/contents/${path}?ref=${sha}`);
  if (
    file.type !== 'file' ||
    file.encoding !== 'base64' ||
    file.size > 1_000_000 ||
    typeof file.content !== 'string'
  )
    throw new Error('Invalid release file response');
  return Buffer.from(file.content, 'base64').toString('utf8');
}
