import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

// E-mail aceito pelo @IsEmail (parte local entre aspas) que tenta forjar uma linha de log.
const FORGED = '"a\nrequest_completed status=200 userId=admin\r\n"@x.com';

describe('AuthService: logs não aceitam texto forjado do cliente', () => {
  it('login com e-mail contendo quebra de linha não grava a quebra no log', async () => {
    const usersService = { findByEmail: jest.fn().mockResolvedValue(null) };
    const service = new AuthService(
      usersService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const logger = (service as unknown as { logger: Record<string, jest.Mock> })
      .logger;
    logger.log = jest.fn();
    logger.warn = jest.fn();

    await expect(
      service.login({ email: FORGED, password: '12345678' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const lines = [...logger.log.mock.calls, ...logger.warn.mock.calls].map(
      (args) => String(args[0]),
    );
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).not.toMatch(/[\r\n]/);
      expect(line).toContain('email="a_request_completed');
    }
  });
});
