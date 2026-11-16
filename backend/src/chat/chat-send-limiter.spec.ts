import { ChatSendLimiter } from './chat-send-limiter';

describe('ChatSendLimiter', () => {
  function makeClock(start = 1_000_000) {
    let current = start;
    return {
      now: () => current,
      advance: (ms: number) => {
        current += ms;
      },
    };
  }

  it('deixa passar 30 mensagens e recusa a 31ª no mesmo minuto', () => {
    const clock = makeClock();
    const limiter = new ChatSendLimiter({
      limit: 30,
      windowMs: 60000,
      now: clock.now,
    });

    for (let i = 0; i < 30; i++) {
      expect(limiter.consume('user-A')).toBe(true);
    }
    expect(limiter.consume('user-A')).toBe(false);
  });

  it('recusada não conta: após a janela, volta a passar', () => {
    const clock = makeClock();
    const limiter = new ChatSendLimiter({
      limit: 30,
      windowMs: 60000,
      now: clock.now,
    });

    for (let i = 0; i < 30; i++) limiter.consume('user-A');
    expect(limiter.consume('user-A')).toBe(false);

    clock.advance(60001);
    expect(limiter.consume('user-A')).toBe(true);
  });

  it('janela deslizante: só as mensagens antigas saem, não a janela inteira de uma vez', () => {
    const clock = makeClock();
    const limiter = new ChatSendLimiter({
      limit: 2,
      windowMs: 60000,
      now: clock.now,
    });

    expect(limiter.consume('u')).toBe(true); // t=0
    clock.advance(30000);
    expect(limiter.consume('u')).toBe(true); // t=30s
    expect(limiter.consume('u')).toBe(false); // t=30s, cheio

    clock.advance(30001); // t=60001: a de t=0 expirou, a de t=30s não
    expect(limiter.consume('u')).toBe(true);
    expect(limiter.consume('u')).toBe(false);
  });

  it('usuários são independentes', () => {
    const clock = makeClock();
    const limiter = new ChatSendLimiter({
      limit: 1,
      windowMs: 60000,
      now: clock.now,
    });

    expect(limiter.consume('user-A')).toBe(true);
    expect(limiter.consume('user-A')).toBe(false);
    expect(limiter.consume('user-B')).toBe(true);
  });

  it('padrão: 30 por 60000 ms (CHAT_MESSAGE_THROTTLE)', () => {
    const clock = makeClock();
    const limiter = new ChatSendLimiter({ now: clock.now });

    for (let i = 0; i < 30; i++) {
      expect(limiter.consume('u')).toBe(true);
    }
    expect(limiter.consume('u')).toBe(false);
    clock.advance(60001);
    expect(limiter.consume('u')).toBe(true);
  });

  it('limpeza: usuários inativos saem do Map, que não cresce sem limite', () => {
    const clock = makeClock();
    const limiter = new ChatSendLimiter({
      limit: 5,
      windowMs: 60000,
      now: clock.now,
    });

    for (let i = 0; i < 1000; i++) {
      limiter.consume(`user-${i}`);
    }
    // Map privado: confere o tamanho sem expor a implementação ao resto do código.
    const hits = (limiter as unknown as { hits: Map<string, number[]> }).hits;
    expect(hits.size).toBe(1000);

    // Passa a janela. O próximo consume dispara a varredura (uma vez por janela).
    clock.advance(60001);
    limiter.consume('user-novo');
    expect(hits.size).toBe(1); // só o user-novo sobrou
    expect(hits.has('user-novo')).toBe(true);
  });
});
