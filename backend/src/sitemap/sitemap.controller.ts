import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';

@Controller('sitemap')
export class SitemapController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('sitemap.xml')
  @Public()
  @Header('Content-Type', 'application/xml')
  async getSitemap(@Res() res: Response) {
    const appUrl = this.config.get<string>('app.appUrl', 'https://triluga.com.br');
    const frontendUrl = appUrl.replace(':3002', ':4200').replace('/api/v1', '');

    const vehicles = await this.prisma.vehicle.findMany({
      where: { isActive: true, isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 50000,
    });

    const staticPages = [
      { url: '/', priority: '1.0', changefreq: 'daily' },
      { url: '/search', priority: '0.9', changefreq: 'hourly' },
      { url: '/privacy', priority: '0.3', changefreq: 'monthly' },
      { url: '/terms', priority: '0.3', changefreq: 'monthly' },
    ];

    const urls = [
      ...staticPages.map(
        (p) => `  <url>
    <loc>${frontendUrl}${p.url}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
      ),
      ...vehicles.map(
        (v) => `  <url>
    <loc>${frontendUrl}/vehicles/${v.slug}</loc>
    <lastmod>${v.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
      ),
    ].join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    res.send(xml);
  }
}
