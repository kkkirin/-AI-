/**
 * @jest-environment node
 */
import * as http from 'http';
import { AddressInfo } from 'net';
import { LocalAIProvider } from '../LocalAIProvider';
import { GenerationCancelledError } from '../AIProvider';
import { AIMode, Language } from '../../types';

const request = {
  inputText: 'こんにちは',
  mode: AIMode.TRANSLATE,
  inputLanguage: Language.AUTO,
  outputLanguage: Language.AUTO,
};

// llama-server の代わりに、トークンをゆっくり流し続ける SSE サーバー
function startSlowSSEServer(): Promise<{ server: http.Server; port: number; closed: Promise<void> }> {
  let resolveClosed: () => void;
  const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const timer = setInterval(() => {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'a' } }] })}\n\n`);
    }, 20);
    res.on('close', () => {
      clearInterval(timer);
      resolveClosed();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port, closed });
    });
  });
}

describe('LocalAIProvider.generateStream cancel', () => {
  it('stops mid-stream and closes the connection when aborted', async () => {
    const { server, port, closed } = await startSlowSSEServer();
    try {
      const provider = new LocalAIProvider(`http://127.0.0.1:${port}/v1`);
      const controller = new AbortController();
      const tokens: string[] = [];

      const promise = provider.generateStream(request, (token) => {
        tokens.push(token);
        if (tokens.length === 3) {
          controller.abort();
        }
      }, controller.signal);

      await expect(promise).rejects.toBeInstanceOf(GenerationCancelledError);
      await closed;
      expect(tokens.length).toBe(3);
    } finally {
      server.close();
    }
  });

  it('rejects immediately when already aborted', async () => {
    const provider = new LocalAIProvider('http://127.0.0.1:1/v1');
    const controller = new AbortController();
    controller.abort();
    await expect(provider.generateStream(request, () => undefined, controller.signal))
      .rejects.toBeInstanceOf(GenerationCancelledError);
  });
});
