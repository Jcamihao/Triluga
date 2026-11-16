import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { ChatGateway } from './chat.gateway';
import { ChatSendLimiter } from './chat-send-limiter';
import { ChatPresenceService } from './chat-presence.service';
import { ChatService } from './chat.service';

// Teste de unidade do gateway: chama handleSend direto, com service falso.
// Não sobe socket.io (socket.io-client não está instalado no projeto).
describe('ChatGateway.handleSend: limite de 30 mensagens por minuto', () => {
  function build(limiter: ChatSendLimiter) {
    const chatService = {
      sendMessage: jest.fn(
        async (senderId: string, conversationId: string) => ({
          conversationId,
          participantIds: [senderId],
          message: { id: 'm', content: 'oi' },
        }),
      ),
    };
    const gateway = new ChatGateway(
      chatService as unknown as ChatService,
      {} as JwtService,
      {} as ChatPresenceService,
      limiter,
    );
    gateway.server = {
      to: () => ({ emit: jest.fn() }),
    } as unknown as ChatGateway['server'];
    return { gateway, chatService };
  }

  const client = { id: 'socket-1', data: { user: { sub: 'user-A' } } } as any;
  const body = { conversationId: 'conv-1', content: 'oi' };

  it('31ª mensagem é recusada com WsException e o service NÃO é chamado nela', async () => {
    let now = 0;
    const limiter = new ChatSendLimiter({
      limit: 30,
      windowMs: 60000,
      now: () => now,
    });
    const { gateway, chatService } = build(limiter);

    for (let i = 0; i < 30; i++) {
      await expect(gateway.handleSend(client, body)).resolves.toBeDefined();
    }
    expect(chatService.sendMessage).toHaveBeenCalledTimes(30);

    const error = await gateway.handleSend(client, body).catch((e) => e);
    expect(error).toBeInstanceOf(WsException);
    expect(error.message).toBe('Muitas mensagens. Aguarde um instante.');
    expect(chatService.sendMessage).toHaveBeenCalledTimes(30);

    // Depois da janela, volta a enviar.
    now = 60001;
    await expect(gateway.handleSend(client, body)).resolves.toBeDefined();
    expect(chatService.sendMessage).toHaveBeenCalledTimes(31);
  });

  it('o limite é por usuário: outro usuário não é afetado', async () => {
    const limiter = new ChatSendLimiter({
      limit: 1,
      windowMs: 60000,
      now: () => 0,
    });
    const { gateway, chatService } = build(limiter);

    await gateway.handleSend(client, body);
    await expect(gateway.handleSend(client, body)).rejects.toBeInstanceOf(
      WsException,
    );

    const other = { id: 'socket-2', data: { user: { sub: 'user-B' } } } as any;
    await expect(gateway.handleSend(other, body)).resolves.toBeDefined();
    expect(chatService.sendMessage).toHaveBeenCalledTimes(2);
  });
});
