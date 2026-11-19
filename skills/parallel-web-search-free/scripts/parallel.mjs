import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import manifest from '../package.json' with { type: 'json' };

const endpoint = new URL('https://mcp.parallel.ai/mcp');
const responseLimit = 2 * 1024 * 1024;
const usage = 'Usage: node scripts/parallel.mjs search <objective> <query> [query ...]\n'
  + '       node scripts/parallel.mjs fetch <url> [url ...]';

function toolArguments(command, values) {
  if (values.some((value) => !value.trim())) throw new Error('Arguments must be nonempty.');

  if (command === 'search' && values.length >= 2 && values.length <= 6) {
    const [objective, ...search_queries] = values;
    return { name: 'web_search', arguments: { objective, search_queries } };
  }

  if (command === 'fetch' && values.length >= 1 && values.length <= 20) {
    for (const value of values) {
      const url = URL.parse(value);
      if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Fetch requires HTTP or HTTPS URLs without embedded credentials.');
      }
    }
    return { name: 'web_fetch', arguments: { urls: values } };
  }

  throw new Error(usage);
}

async function boundedFetch(url, options) {
  const response = await fetch(url, options);
  if (!response.body) return response;

  let bytes = 0;
  const body = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > responseLimit) throw new Error('Parallel MCP response exceeded 2 MiB.');
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, response);
}

function toolPayload(result) {
  const text = result.content?.find((block) => block.type === 'text')?.text;
  if (result.isError) throw new Error(text || 'Parallel MCP returned a tool error.');

  const payload = result.structuredContent ?? (text && JSON.parse(text));
  if (!Array.isArray(payload?.results)) throw new Error('Parallel MCP returned an invalid result.');
  return payload;
}

async function run(command, values) {
  if (command === '--help' && values.length === 0) {
    console.log(usage);
    return;
  }

  const tool = toolArguments(command, values);
  const signal = AbortSignal.timeout(45_000);
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      // Keep this project-wide so Parallel can measure aggregate free MCP usage.
      headers: { 'User-Agent': 'agent-master-skills' },
      redirect: 'error',
    },
    fetch: (url, options) => boundedFetch(url, {
      ...options,
      signal: options?.signal ? AbortSignal.any([signal, options.signal]) : signal,
    }),
  });
  const client = new Client({ name: manifest.name, version: manifest.version });

  try {
    await client.connect(transport, { signal });
    const result = await client.callTool(tool, undefined, { signal });
    console.log(JSON.stringify(toolPayload(result)));
  } finally {
    await transport.terminateSession().catch(() => {});
    await client.close().catch(() => {});
  }
}

try {
  const [command, ...values] = process.argv.slice(2);
  await run(command, values);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
