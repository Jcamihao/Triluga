import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly from: string;
  private readonly frontendUrl: string;
  private readonly adminEmail: string;
  private readonly isConfigured: boolean;

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>('email.user', '');
    const pass = this.config.get<string>('email.pass', '');
    this.from = this.config.get<string>(
      'email.from',
      '"Triluga" <noreply@triluga.com.br>',
    );
    this.frontendUrl = this.config.get<string>(
      'email.frontendUrl',
      'https://triluga.com.br',
    );
    this.adminEmail = this.config.get<string>('email.adminEmail', '');
    this.isConfigured = Boolean(user && pass);

    if (this.isConfigured) {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('email.host', 'smtp.gmail.com'),
        port: this.config.get<number>('email.port', 587),
        secure: this.config.get<boolean>('email.secure', false),
        auth: { user, pass },
      });
    } else {
      this.logger.warn(
        'SMTP não configurado. Emails seguirão em modo degradado (apenas log).',
      );
    }
  }

  async sendEmailVerification(to: string, fullName: string, token: string) {
    const link = `${this.frontendUrl}/auth/verify-email?token=${token}`;
    await this.send({
      to,
      subject: 'Confirme seu email – Triluga',
      html: this.templateEmailVerification(fullName, link),
    });
  }

  async sendWelcome(to: string, fullName: string) {
    await this.send({
      to,
      subject: 'Bem-vindo ao Triluga! 🚗',
      html: this.templateWelcome(fullName),
    });
  }

  async sendPasswordReset(to: string, fullName: string, token: string) {
    const link = `${this.frontendUrl}/auth/reset-password?token=${token}`;
    await this.send({
      to,
      subject: 'Redefinição de senha – Triluga',
      html: this.templatePasswordReset(fullName, link),
    });
  }

  async sendChatNotification(
    to: string,
    fullName: string,
    vehicleTitle: string,
    conversationId: string,
  ) {
    const link = `${this.frontendUrl}/chat/${conversationId}`;
    await this.send({
      to,
      subject: `Nova mensagem sobre "${vehicleTitle}" – Triluga`,
      html: this.templateChatNotification(fullName, vehicleTitle, link),
    });
  }

  async sendDocumentApproved(
    to: string,
    fullName: string,
    documentType: 'document' | 'driver-license',
  ) {
    const label =
      documentType === 'driver-license' ? 'CNH' : 'documento de identidade';
    await this.send({
      to,
      subject: `Seu ${label} foi aprovado – Triluga`,
      html: this.templateDocumentStatus(fullName, label, true),
    });
  }

  async sendDocumentRejected(
    to: string,
    fullName: string,
    documentType: 'document' | 'driver-license',
    reason?: string,
  ) {
    const label =
      documentType === 'driver-license' ? 'CNH' : 'documento de identidade';
    await this.send({
      to,
      subject: `Ação necessária: ${label} não aprovado – Triluga`,
      html: this.templateDocumentStatus(fullName, label, false, reason),
    });
  }

  async sendSearchAlertMatch(
    to: string,
    fullName: string,
    alertTitle: string,
    vehicleTitle: string,
    vehicleId: string,
  ) {
    const link = `${this.frontendUrl}/vehicles/${vehicleId}`;
    await this.send({
      to,
      subject: `Novo veículo para seu alerta "${alertTitle}" – Triluga`,
      html: this.templateSearchAlertMatch(
        fullName,
        alertTitle,
        vehicleTitle,
        link,
      ),
    });
  }

  async sendNewReportAlert(params: {
    vehicleTitle: string;
    vehicleId: string;
    reason: string;
    reporterEmail: string;
  }) {
    if (!this.adminEmail) return;
    const adminLink = `${this.frontendUrl}/admin`;
    await this.send({
      to: this.adminEmail,
      subject: `[Triluga] Novo report: "${params.vehicleTitle}"`,
      html: this.templateBase(
        'Novo report de anúncio',
        `
        <h1 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#b91c1c;">⚠️ Novo report recebido</h1>
        <p style="margin:0 0 24px;font-size:15px;color:#4d6b59;line-height:1.6;">Um usuário denunciou um anúncio na plataforma.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:12px;border-left:4px solid #ef4444;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:0.5px;">Detalhes</p>
              <p style="margin:0 0 4px;font-size:14px;color:#1a2421;"><strong>Anúncio:</strong> ${params.vehicleTitle}</p>
              <p style="margin:0 0 4px;font-size:14px;color:#1a2421;"><strong>Motivo:</strong> ${params.reason}</p>
              <p style="margin:0;font-size:14px;color:#1a2421;"><strong>Denunciante:</strong> ${params.reporterEmail}</p>
            </td>
          </tr>
        </table>
        <a href="${adminLink}" style="display:block;width:100%;text-align:center;background:linear-gradient(135deg,#b91c1c,#ef4444);color:#ffffff;text-decoration:none;padding:16px;border-radius:999px;font-size:15px;font-weight:900;box-sizing:border-box;">Revisar no painel admin</a>
        `,
      ),
    });
  }

  private async send(options: { to: string; subject: string; html: string }) {
    if (!this.isConfigured || !this.transporter) {
      this.logger.debug(
        `[EMAIL degradado] Para: ${options.to} | Assunto: ${options.subject}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({ from: this.from, ...options });
      this.logger.debug(
        `email_sent to=${options.to} subject="${options.subject}"`,
      );
    } catch (error) {
      this.logger.error(
        `email_failed to=${options.to} error=${(error as Error).message}`,
      );
    }
  }

  private templateBase(title: string, content: string) {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f0fbf7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a2421;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fbf7;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,109,55,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#006d37,#2ecc71);padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:900;font-style:italic;letter-spacing:-1px;color:#ffffff;">Triluga</p>
              <p style="margin:8px 0 0;font-size:13px;font-weight:500;color:rgba(255,255,255,0.8);">Seu Classificado de Automotores</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 40px 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f0fbf7;padding:24px 40px;text-align:center;border-top:1px solid #d4ede3;">
              <p style="margin:0;font-size:12px;color:#4d6b59;">
                © ${new Date().getFullYear()} Triluga. Todos os direitos reservados.<br/>
                Você está recebendo este email pois possui uma conta no Triluga.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private templateWelcome(fullName: string) {
    const firstName = fullName.split(' ')[0];
    return this.templateBase(
      'Bem-vindo ao Triluga',
      `
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#006d37;">Olá, ${firstName}! 👋</h1>
      <p style="margin:0 0 24px;font-size:16px;color:#4d6b59;line-height:1.6;">Sua conta no Triluga foi criada com sucesso. Agora você pode buscar, comparar e anunciar veículos.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fbf7;border-radius:12px;padding:0;overflow:hidden;margin-bottom:28px;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#006d37;text-transform:uppercase;letter-spacing:0.5px;">O que você pode fazer</p>
            <p style="margin:0 0 8px;font-size:14px;color:#1a2421;">🔍 Buscar veículos por cidade, tipo e faixa de preço</p>
            <p style="margin:0 0 8px;font-size:14px;color:#1a2421;">⚖️ Comparar veículos lado a lado</p>
            <p style="margin:0 0 8px;font-size:14px;color:#1a2421;">💬 Entrar em contato direto com anunciantes</p>
            <p style="margin:0;font-size:14px;color:#1a2421;">🚗 Anunciar seus próprios veículos</p>
          </td>
        </tr>
      </table>
      <a href="${this.frontendUrl}" style="display:block;width:100%;text-align:center;background:linear-gradient(135deg,#006d37,#2ecc71);color:#ffffff;text-decoration:none;padding:16px;border-radius:999px;font-size:16px;font-weight:900;box-sizing:border-box;">Acessar o Triluga</a>
    `,
    );
  }

  private templatePasswordReset(fullName: string, link: string) {
    const firstName = fullName.split(' ')[0];
    return this.templateBase(
      'Redefinição de senha',
      `
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#006d37;">Redefinir senha</h1>
      <p style="margin:0 0 24px;font-size:16px;color:#4d6b59;line-height:1.6;">Olá, ${firstName}. Recebemos uma solicitação para redefinir a senha da sua conta.</p>
      <a href="${link}" style="display:block;width:100%;text-align:center;background:linear-gradient(135deg,#006d37,#2ecc71);color:#ffffff;text-decoration:none;padding:16px;border-radius:999px;font-size:16px;font-weight:900;box-sizing:border-box;margin-bottom:24px;">Redefinir minha senha</a>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e1;border-radius:12px;border-left:4px solid #f59e0b;margin-bottom:16px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">⚠️ Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este email — sua senha não será alterada.</p>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:12px;color:#9ab0a3;word-break:break-all;">Ou copie este link: ${link}</p>
    `,
    );
  }

  private templateChatNotification(
    fullName: string,
    vehicleTitle: string,
    link: string,
  ) {
    const firstName = fullName.split(' ')[0];
    return this.templateBase(
      'Nova mensagem',
      `
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#006d37;">Nova mensagem 💬</h1>
      <p style="margin:0 0 24px;font-size:16px;color:#4d6b59;line-height:1.6;">Olá, ${firstName}. Você recebeu uma nova mensagem sobre <strong style="color:#1a2421;">${vehicleTitle}</strong>.</p>
      <a href="${link}" style="display:block;width:100%;text-align:center;background:linear-gradient(135deg,#006d37,#2ecc71);color:#ffffff;text-decoration:none;padding:16px;border-radius:999px;font-size:16px;font-weight:900;box-sizing:border-box;">Ver mensagem</a>
    `,
    );
  }

  private templateDocumentStatus(
    fullName: string,
    label: string,
    approved: boolean,
    reason?: string,
  ) {
    const firstName = fullName.split(' ')[0];
    const color = approved ? '#006d37' : '#ba1a1a';
    const icon = approved ? '✅' : '❌';
    const title = approved
      ? `${icon} ${label} aprovado`
      : `${icon} ${label} não aprovado`;
    const message = approved
      ? `Seu ${label} foi verificado e aprovado com sucesso! Agora você tem acesso a todos os recursos da plataforma.`
      : `Infelizmente seu ${label} não pôde ser aprovado. Por favor, envie novamente com uma foto nítida e legível.`;

    return this.templateBase(
      title,
      `
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:${color};">${title}</h1>
      <p style="margin:0 0 24px;font-size:16px;color:#4d6b59;line-height:1.6;">Olá, ${firstName}. ${message}</p>
      ${reason ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffdad6;border-radius:12px;border-left:4px solid #ba1a1a;margin-bottom:24px;"><tr><td style="padding:16px 20px;"><p style="margin:0;font-size:13px;color:#93000a;line-height:1.5;"><strong>Motivo:</strong> ${reason}</p></td></tr></table>` : ''}
      <a href="${this.frontendUrl}/profile" style="display:block;width:100%;text-align:center;background:linear-gradient(135deg,#006d37,#2ecc71);color:#ffffff;text-decoration:none;padding:16px;border-radius:999px;font-size:16px;font-weight:900;box-sizing:border-box;">Ir para meu perfil</a>
    `,
    );
  }

  private templateEmailVerification(fullName: string, link: string) {
    const firstName = fullName.split(' ')[0];
    return this.templateBase(
      'Confirme seu email',
      `
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#006d37;">Olá, ${firstName}! 👋</h1>
      <p style="margin:0 0 24px;font-size:16px;color:#4d6b59;line-height:1.6;">Sua conta no Triluga foi criada. Confirme seu email para começar a anunciar e usar todas as funcionalidades da plataforma.</p>
      <a href="${link}" style="display:block;width:100%;text-align:center;background:linear-gradient(135deg,#006d37,#2ecc71);color:#ffffff;text-decoration:none;padding:16px;border-radius:999px;font-size:16px;font-weight:900;box-sizing:border-box;margin-bottom:24px;">Confirmar meu email</a>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e1;border-radius:12px;border-left:4px solid #f59e0b;margin-bottom:16px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">⚠️ Este link expira em <strong>48 horas</strong>. Se você não criou esta conta, ignore este email.</p>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:12px;color:#9ab0a3;word-break:break-all;">Ou copie este link: ${link}</p>
    `,
    );
  }

  private templateSearchAlertMatch(
    fullName: string,
    alertTitle: string,
    vehicleTitle: string,
    link: string,
  ) {
    const firstName = fullName.split(' ')[0];
    return this.templateBase(
      'Novo veículo encontrado',
      `
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#006d37;">Novo veículo encontrado! 🔔</h1>
      <p style="margin:0 0 8px;font-size:16px;color:#4d6b59;line-height:1.6;">Olá, ${firstName}. Um veículo compatível com seu alerta <strong style="color:#006d37;">${alertTitle}</strong> acaba de ser publicado.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fbf7;border-radius:12px;margin:20px 0 28px;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#1a2421;">${vehicleTitle}</p>
          </td>
        </tr>
      </table>
      <a href="${link}" style="display:block;width:100%;text-align:center;background:linear-gradient(135deg,#006d37,#2ecc71);color:#ffffff;text-decoration:none;padding:16px;border-radius:999px;font-size:16px;font-weight:900;box-sizing:border-box;">Ver veículo</a>
    `,
    );
  }
}
