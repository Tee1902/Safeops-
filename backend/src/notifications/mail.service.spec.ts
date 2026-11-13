import { createServer, type Server, type Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { MailService } from './mail.service.js';
import { config } from '../../test/fixtures.js';

describe('BE3 asynchronous SMTP alerts', () => {
  let server: Server;
  let service: MailService;
  const sockets = new Set<Socket>();
  let messages: string[];
  let rejectMail: boolean;
  beforeEach(async () => {
    rejectMail = false;
    messages = [];
    server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.write('220 local.test ESMTP\r\n');
      let buffer = '';
      let message = '';
      let data = false;
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        let end: number;
        while ((end = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (data) {
            if (line === '.') {
              messages.push(message);
              data = false;
              socket.write('250 accepted\r\n');
            } else message += `${line}\r\n`;
          } else if (/^EHLO|^HELO/.test(line))
            socket.write('250 local.test\r\n');
          else if (line === 'DATA') {
            data = true;
            socket.write('354 send message\r\n');
          } else if (line === 'QUIT') socket.end('221 bye\r\n');
          else if (rejectMail && line.startsWith('MAIL FROM'))
            socket.write('550 rejected\r\n');
          else socket.write('250 OK\r\n');
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('SMTP listener missing');
    service = new MailService(
      config({
        MAIL_HOST: '127.0.0.1',
        MAIL_PORT: address.port,
        MAIL_USER: '',
        MAIL_PASSWORD: '',
      }),
    );
  });
  afterEach(async () => {
    service.onModuleDestroy();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  it('returns immediately, then delivers a minimal incident link via real SMTP', async () => {
    expect(
      service.enqueue({
        to: 'security@example.com',
        incidentId: '123',
        kind: 'assignment',
      }),
    ).toBeUndefined();
    expect(messages).toEqual([]);
    for (let attempt = 0; attempt < 100 && !messages.length; attempt++)
      await delay(10);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('http://localhost:3001/incidents/123');
    expect(messages[0]).toContain('To: security@example.com');
    expect(messages[0]).not.toMatch(
      /password|accessToken|refreshToken|latitude|longitude/,
    );
  });
  it('absorbs SMTP rejection and continues processing subsequent alerts', async () => {
    rejectMail = true;
    expect(() =>
      service.enqueue({
        to: 'admin@example.com',
        incidentId: '1',
        kind: 'critical',
      }),
    ).not.toThrow();
    await delay(80);
    expect(messages).toHaveLength(0);
    rejectMail = false;
    service.enqueue({
      to: 'admin@example.com',
      incidentId: '2',
      kind: 'critical',
    });
    for (let attempt = 0; attempt < 100 && !messages.length; attempt++)
      await delay(10);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('/incidents/2');
  });
});
