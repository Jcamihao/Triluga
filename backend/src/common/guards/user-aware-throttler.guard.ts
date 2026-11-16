import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * ThrottlerGuard que conta por usuário nas rotas autenticadas e por IP nas públicas.
 *
 * Por quê: atrás de NAT, ou de uma borda Cloudflare com trust proxy, muitos
 * usuários dividem o mesmo IP. Contar só por IP faz um usuário esgotar o limite
 * de todos. Contar por usuário resolve isso sem afrouxar nada: quem troca de IP
 * continua no mesmo balde.
 *
 * Por que rota pública conta SEMPRE por IP: login, cadastro e recuperação de senha
 * são públicos. Se o balde fosse por `sub`, quem tem várias contas (ou manda um
 * Bearer de outra conta) ganharia um balde novo a cada requisição e contornaria o
 * limite por IP. Por isso o tracker ignora req.user em rota pública, mesmo que
 * exista um Bearer válido.
 *
 * Sem estado compartilhado: a decisão é tomada por requisição, a partir do
 * ExecutionContext que o ThrottlerGuard 6.5 repassa a getTracker(req, context).
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(
    req: Record<string, any>,
    context?: ExecutionContext,
  ): Promise<string> {
    const ipKey = `ip:${req.ip}`;

    if (!context) {
      return ipKey;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return ipKey;
    }

    const sub = req.user?.sub;

    return typeof sub === 'string' && sub.length > 0 ? `user:${sub}` : ipKey;
  }
}
