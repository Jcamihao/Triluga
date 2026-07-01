# Triluga Design System — v2.1

> Classificados de veículos · Angular 16 + Tailwind CSS + Material Design 3

---

## Paleta de Cores

A paleta usa exclusivamente tokens MD3 (Material Design 3). Não há escala mint separada — tudo deriva do primary `#006d37`.

### MD3 — tokens canônicos

| Token CSS | Valor | Uso |
|---|---|---|
| `--md-primary` | `#006d37` | Cor principal — CTAs, links, botões |
| `--md-on-primary` | `#ffffff` | Texto sobre fundo primary |
| `--md-primary-container` | `#2ecc71` | Container tonal (verde vivo) |
| `--md-on-primary-container` | `#005027` | Texto em hover, badges, textos de ênfase |
| `--md-secondary` | `#336943` | Gradientes, elementos de suporte |
| `--md-on-surface` | `#091d2e` | Texto principal |
| `--md-on-surface-variant` | `#3d4a3e` | Texto secundário |
| `--md-surface` | `#f7f9ff` | Background da página |
| `--md-surface-container-lowest` | `#ffffff` | Cards, inputs |
| `--md-surface-container-low` | `#edf4ff` | Hover states, eyebrows, chips hover |
| `--md-surface-container` | `#e3efff` | Badges, seleção de texto, eyebrow border |
| `--md-surface-container-high` | `#d9eaff` | Elementos de destaque |
| `--md-surface-container-highest` | `#d1e4fb` | Surface variant |
| `--md-outline` | `#6c7b6d` | Borders em hover, focus borders |
| `--md-outline-variant` | `#bbcbbb` | Borders padrão, cards hover |
| `--md-error-color` | `#ba1a1a` | Estados de erro |
| `--md-error-container` | `#ffdad6` | Background de erro |
| `--md-on-error-container` | `#93000a` | Texto em container de erro |
| `--md-inverse-surface` | `#203243` | Superfícies invertidas (dark) |
| `--md-inverse-on-surface` | `#e8f2ff` | Texto em superfícies invertidas |

### Graphite (Suporte) — textos e neutros

| Token | Valor |
|---|---|
| `--graphite-100` | `#e2e7e5` |
| `--graphite-200` | `#c5ccc9` |
| `--graphite-300` | `#8a9592` |
| `--graphite-400` | `#5c6b66` |
| `--graphite-500` | `#3a4845` |
| `--graphite-600` | `#252f2c` |
| `--graphite-700` | `#1a2421` |

### Base

| Token | Valor |
|---|---|
| `--white` | `#ffffff` |
| `--gray-50` | `#fafcfb` |
| `--gray-100` | `#f3f7f5` |
| `--gray-150` | `#ebf0ed` |
| `--gray-200` | `#e2e7e5` |

### Semânticas

| Token | Valor | Uso |
|---|---|---|
| `--success` | `#22c55e` | Confirmações |
| `--warning` | `#f59e0b` | Alertas |
| `--error` | `#ef4444` | Erros |
| `--info` | `#3b82f6` | Informativos |

### Aliases canônicos → MD3

```css
--primary             → --md-primary              (#006d37)
--primary-hover       → --md-on-primary-container (#005027)
--primary-light       → --md-surface-container-low
--primary-subtle      → --md-surface-container
--background          → --md-surface
--surface             → --md-surface-container-lowest
--surface-muted       → --md-surface-container-low
--border              → --md-outline-variant
--border-strong       → --md-outline
--text-primary        → --md-on-surface
--text-secondary      → --md-on-surface-variant
--input-outline       → --md-outline-variant
--input-outline-focus → --md-primary
```

### Mapeamento de substituição (mint → MD3)

| Antigo | Novo | Razão |
|---|---|---|
| `--mint-50` | `--md-surface-container-low` | Hover backgrounds sutis |
| `--mint-100` | `--md-surface-container` | Badges, seleção, borders leves |
| `--mint-200` | `--md-outline-variant` | Borders em hover de cards |
| `--mint-300` | `--md-outline` | Focus borders, hover borders |
| `--mint-400` | `--md-primary` | Input focus border, chip ativo |
| `--mint-500` | `--md-primary` | CTA, botão primário |
| `--mint-600` | `--md-primary` | Links, ícones, hover de botão |
| `--mint-700` | `--md-on-primary-container` | Texto em badges, hover de links |

### Sombras com primary

```css
rgba(0, 109, 55, 0.10)  /* focus ring search */
rgba(0, 109, 55, 0.12)  /* focus ring inputs */
rgba(0, 109, 55, 0.25)  /* btn-primary shadow */
rgba(0, 109, 55, 0.30)  /* btn-primary hover shadow */
```

---

## Tipografia

**Fonte:** Inter (400, 500, 600, 700, 800, 900) — via Google Fonts

| Elemento | Tamanho | Weight |
|---|---|---|
| `h1` | `clamp(28px, 4vw+12px, 48px)` | 800 |
| `h2` | `clamp(22px, 3vw+8px, 36px)` | 700 |
| `h3` | `clamp(18px, 2vw+4px, 24px)` | 700 |
| `h4` | `clamp(16px, 1.5vw+4px, 20px)` | 600 |
| `body` | `15px` — line-height 1.6 | 400 |
| `small` | `13px` | 400 |

**Classes especiais:**

| Classe | Uso |
|---|---|
| `.eyebrow` | Label uppercase, pill shape — bg `surface-container-low`, texto `on-primary-container` |
| `.price-text` | Weight 800, tabular-nums, tracking apertado |
| `.badge-text` | Weight 700, letter-spacing 0.04em |
| `.profile-name-text` | Weight 700, letter-spacing -0.01em |
| `.text-mint` | `color: var(--md-primary)` |

---

## Espaçamento (grid de 8px)

| Token | Valor |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-10` | 40px |
| `--space-12` | 48px |
| `--space-16` | 64px |
| `--space-20` | 80px |

---

## Border Radius

| Token | Valor |
|---|---|
| `--radius-sm` | 8px |
| `--radius-md` | 12px |
| `--radius-lg` | 16px |
| `--radius-xl` | 20px |
| `--radius-2xl` | 24px |
| `--radius-full` | 999px |

---

## Sombras

| Token | Valor |
|---|---|
| `--shadow-xs` | `0 1px 2px rgba(26,36,33,.05)` |
| `--shadow-sm` | `0 2px 8px rgba(26,36,33,.06), 0 1px 2px rgba(26,36,33,.04)` |
| `--shadow-md` | `0 4px 16px rgba(26,36,33,.08), 0 2px 4px rgba(26,36,33,.04)` |
| `--shadow-lg` | `0 8px 32px rgba(26,36,33,.10), 0 2px 8px rgba(26,36,33,.04)` |
| `--shadow-xl` | `0 16px 48px rgba(26,36,33,.12), 0 4px 12px rgba(26,36,33,.06)` |
| `--shadow-mint` | `0 4px 16px rgba(0,109,55,.25)` |

---

## Componentes

### Botões

```css
.btn          /* base — 48px, padding 0 24px, radius-md */
.btn-primary  /* bg: --md-primary, sombra rgba(0,109,55,.25) */
.btn-secondary /* branco com borda graphite-100 */
.btn-ghost    /* transparente, cor --md-primary */

/* Tamanhos */
.btn-sm       /* 36px height */
.btn-lg       /* 56px height, weight 700 */

/* Modificadores */
.btn-pill     /* radius-full */
.btn-block    /* width: 100% */
```

### Badges

| Classe | Background | Texto |
|---|---|---|
| `.badge-mint` | `--md-surface-container` | `--md-on-primary-container` |
| `.badge-muted` | `--gray-100` | `--graphite-400` |
| `.badge-outline` | transparente | `--graphite-400` |
| `.badge-success` | `#dcfce7` | `#166534` |
| `.badge-warning` | `#fef3c7` | `#92400e` |
| `.badge-error` | `#fecaca` | `#991b1b` |

Altura fixa: **24px** · padding: `0 10px` · font-size: 11px · weight 700

### Cards

| Classe | Comportamento |
|---|---|
| `.card` | border, radius-xl, hover: `translateY(-2px)` + `shadow-lg` + `border: outline-variant` |
| `.card--flat` | sem shadow base, `shadow-md` no hover |

### Chips / Filtros

```css
.chip         /* height 36px, pill, hover → md-surface-container-low + md-outline border */
.chip--active /* border --md-primary + bg --md-surface-container-low */
```

### Painéis

```css
.glass-panel        /* surface + border + shadow-md + radius-xl */
.glass-panel-strong /* surface + border + shadow-lg + radius-xl */
.glass-panel-dark   /* gray-100 + border + shadow-lg + radius-xl */
```

### Layout

```css
.page           /* max-width: 1520px, margin auto, padding gutter */
.surface-card   /* white, border, radius-2xl, shadow-xs */
.section-head   /* grid gap-2 */
.section-head--row  /* flex space-between */
.section-link   /* link inline --md-primary com ícone */
```

### Feedback

```css
.skeleton           /* gradient animado 1.5s (shimmer) */
.empty-state        /* grid centralizado, border dashed, bg gray-50 */
.feedback--error    /* bg #fef2f2, border #fecaca, text #991b1b */
.feedback--success  /* bg #f0fdf4, border #bbf7d0, text #166534 */
```

---

## Animações / Transitions

| Token | Valor |
|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--ease-spring` | `cubic-bezier(0.2, 0.9, 0.2, 1)` |
| `--duration-fast` | 150ms |
| `--duration-normal` | 250ms |
| `--duration-slow` | 400ms |

`prefers-reduced-motion` cobre todas as animações — colapsam para 0.01ms.

---

## Layout

| Token | Valor |
|---|---|
| `--page-max` | 1520px |
| `--page-gutter` | `clamp(14px, 2vw, 24px)` |
| `--page-gutter` (≥768px) | `clamp(18px, 2vw, 28px)` |
| `--page-gutter` (≥1280px) | `28px` |

---

## Arquivos de referência

| Arquivo | Conteúdo |
|---|---|
| [frontend/src/styles.scss](frontend/src/styles.scss) | Tokens, reset, componentes globais |
| [frontend/tailwind.config.js](frontend/tailwind.config.js) | Extensão do tema Tailwind com cores MD3 |
| [frontend/src/app/app.component.scss](frontend/src/app/app.component.scss) | Menu drawer, avatar, nav links |
| [frontend/src/app/shared/components/search-header/search-header.component.scss](frontend/src/app/shared/components/search-header/search-header.component.scss) | Barra de busca, filtros, notificações |
