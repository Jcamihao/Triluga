import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    this.logger.log(`register_attempt email=${dto.email.toLowerCase()} role=${dto.role}`);

    if (dto.role === Role.ADMIN) {
      this.logger.warn(`register_blocked_admin email=${dto.email.toLowerCase()}`);
      throw new BadRequestException('Não é possível criar conta ADMIN.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash,
      role: dto.role,
      profile: {
        fullName: dto.fullName,
        phone: dto.phone,
        city: dto.city,
        state: dto.state,
      },
    });

    this.logger.log(`register_success userId=${user.id} email=${user.email} role=${user.role}`);
    return this.issueTokens(user.id, user.email, user.role, user);
  }

  async login(dto: LoginDto) {
    this.logger.log(`login_attempt email=${dto.email.toLowerCase()}`);
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      this.logger.warn(`login_user_not_found email=${dto.email.toLowerCase()}`);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (user.status === UserStatus.BLOCKED) {
      this.logger.warn(`login_blocked userId=${user.id} email=${user.email}`);
      throw new ForbiddenException('Sua conta está bloqueada.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      this.logger.warn(`login_invalid_password userId=${user.id} email=${user.email}`);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    await this.usersService.updateLastLogin(user.id);
    this.logger.log(`login_success userId=${user.id} email=${user.email} role=${user.role}`);

    return this.issueTokens(user.id, user.email, user.role, user);
  }

  async refresh(dto: RefreshDto) {
    const refreshSecret =
      this.configService.get<string>('auth.refreshSecret') ??
      'velo_refresh_secret';
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(dto.refreshToken, {
        secret: refreshSecret,
      });
    } catch (error) {
      this.logger.warn('refresh_invalid_token');
      throw new UnauthorizedException('Refresh token inválido.');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user.refreshTokenHash) {
      this.logger.warn(`refresh_without_hash userId=${user.id}`);
      throw new UnauthorizedException('Refresh token expirado.');
    }

    const isValidRefreshToken = await bcrypt.compare(
      dto.refreshToken,
      user.refreshTokenHash,
    );

    if (!isValidRefreshToken) {
      this.logger.warn(`refresh_hash_mismatch userId=${user.id}`);
      throw new UnauthorizedException('Refresh token inválido.');
    }

    this.logger.log(`refresh_success userId=${user.id} email=${user.email}`);
    return this.issueTokens(user.id, user.email, user.role, user);
  }

  async me(userId: string) {
    this.logger.debug(`me_requested userId=${userId}`);
    const user = await this.usersService.findById(userId);
    return this.usersService.sanitizeUser(user);
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: Role,
    user: Awaited<ReturnType<UsersService['findById']>> | any,
  ) {
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
    };

    const accessSecret =
      this.configService.get<string>('auth.accessSecret') ??
      'velo_access_secret';
    const refreshSecret =
      this.configService.get<string>('auth.refreshSecret') ??
      'velo_refresh_secret';

    const accessExpiresIn =
      this.configService.get<string>('auth.accessExpiresIn') ?? '15m';
    const refreshExpiresIn =
      this.configService.get<string>('auth.refreshExpiresIn') ?? '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn,
      }),
    ]);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.updateRefreshToken(userId, refreshTokenHash);
    this.logger.debug(`tokens_issued userId=${userId} role=${role}`);

    return {
      accessToken,
      refreshToken,
      user: await this.usersService.sanitizeUser(user),
    };
  }
}
