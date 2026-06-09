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
import * as crypto from 'crypto';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { UsersService } from '../users/users.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly rememberedRefreshExpiresIn = '30d';

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  async register(dto: RegisterDto) {
    this.logger.log(
      `register_attempt email=${dto.email.toLowerCase()} role=${Role.USER}`,
    );

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash,
      role: Role.USER,
      profile: {
        fullName: dto.fullName,
        phone: dto.phone,
        zipCode: dto.zipCode,
        addressLine: dto.addressLine,
        addressComplement: dto.addressComplement,
        city: dto.city,
        state: dto.state,
        documentNumber: dto.documentNumber,
      },
    });

    this.logger.log(
      `register_success userId=${user.id} email=${user.email} role=${user.role}`,
    );

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: verificationExpiresAt,
      },
    });

    this.emailService
      .sendEmailVerification(user.email, dto.fullName, verificationToken)
      .catch((err) => this.logger.error(`verification_email_failed userId=${user.id} error=${err.message}`));

    return this.issueTokens(user.id, user.email, user.role, { ...user, emailVerified: false });
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

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      this.logger.warn(
        `login_invalid_password userId=${user.id} email=${user.email}`,
      );
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    await this.usersService.updateLastLogin(user.id);
    this.logger.log(
      `login_success userId=${user.id} email=${user.email} role=${user.role}`,
    );

    return this.issueTokens(user.id, user.email, user.role, user, {
      rememberMe: dto.rememberMe === true,
    });
  }

  async refresh(refreshToken: string | undefined) {
    const refreshSecret =
      this.configService.get<string>('auth.refreshSecret') ??
      'triluga_refresh_secret';

    if (!refreshToken) {
      this.logger.warn('refresh_missing_token');
      throw new UnauthorizedException('Refresh token inválido.');
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
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
      refreshToken,
      user.refreshTokenHash,
    );

    if (!isValidRefreshToken) {
      this.logger.warn(`refresh_hash_mismatch userId=${user.id}`);
      throw new UnauthorizedException('Refresh token inválido.');
    }

    this.logger.log(`refresh_success userId=${user.id} email=${user.email}`);
    return this.issueTokens(user.id, user.email, user.role, user, {
      rememberMe: payload.rememberMe === true,
    });
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      this.logger.debug('logout_without_refresh_token');
      return { success: true };
    }

    const refreshSecret =
      this.configService.get<string>('auth.refreshSecret') ??
      'triluga_refresh_secret';

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: refreshSecret,
        },
      );
      await this.usersService.updateRefreshToken(payload.sub, null);
      this.logger.log(`logout_success userId=${payload.sub}`);
    } catch (error) {
      this.logger.warn('logout_refresh_token_invalid');
    }

    return { success: true };
  }

  async me(userId: string) {
    this.logger.debug(`me_requested userId=${userId}`);
    const user = await this.usersService.findById(userId);
    return this.usersService.sanitizeUser(user);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email).catch(() => null);

    // Resposta genérica para não revelar se o email existe
    if (!user) {
      this.logger.debug(`forgot_password_email_not_found email=${dto.email}`);
      return { success: true };
    }

    // Invalida tokens anteriores não utilizados
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token: rawToken, expiresAt },
    });

    const fullName = (user as any).profile?.fullName ?? user.email;
    await this.emailService.sendPasswordReset(user.email, fullName, rawToken);
    this.logger.log(`forgot_password_sent userId=${user.id}`);

    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token inválido ou expirado.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await Promise.all([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Invalida todas as sessões ativas
      this.usersService.updateRefreshToken(record.userId, null),
    ]);

    this.logger.log(`reset_password_success userId=${record.userId}`);
    return { success: true };
  }

  async verifyEmail(token: string) {
    if (!token) throw new BadRequestException('Token inválido.');

    const user = await this.prisma.user.findUnique({
      where: { emailVerificationToken: token },
    });

    if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
      throw new BadRequestException('Link de verificação inválido ou expirado.');
    }

    if (user.emailVerified) {
      return { success: true, alreadyVerified: true };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    });

    this.logger.log(`email_verified userId=${user.id}`);
    return { success: true, alreadyVerified: false };
  }

  async resendVerification(email: string) {
    const user = await this.usersService.findByEmail(email).catch(() => null);

    if (!user) return { success: true }; // não revela se o email existe

    if ((user as any).emailVerified) {
      throw new BadRequestException('Email já verificado.');
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: verificationExpiresAt,
      },
    });

    const fullName = (user as any).profile?.fullName ?? user.email;
    this.emailService
      .sendEmailVerification(user.email, fullName, verificationToken)
      .catch((err) => this.logger.error(`resend_verification_failed userId=${user.id} error=${err.message}`));

    this.logger.log(`verification_resent userId=${user.id}`);
    return { success: true };
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: Role,
    user: Awaited<ReturnType<UsersService['findById']>> | any,
    options: { rememberMe?: boolean } = {},
  ) {
    const rememberMe = options.rememberMe === true;
    const emailVerified = (user as any)?.emailVerified ?? false;
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
      rememberMe,
      emailVerified,
    };

    const accessSecret =
      this.configService.get<string>('auth.accessSecret') ??
      'triluga_access_secret';
    const refreshSecret =
      this.configService.get<string>('auth.refreshSecret') ??
      'triluga_refresh_secret';

    const accessExpiresIn =
      this.configService.get<string>('auth.accessExpiresIn') ?? '15m';
    const refreshExpiresIn = rememberMe
      ? this.rememberedRefreshExpiresIn
      : (this.configService.get<string>('auth.refreshExpiresIn') ?? '7d');

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
      user: await this.usersService.sanitizeUser(user),
      refreshToken,
      rememberMe,
    };
  }
}
