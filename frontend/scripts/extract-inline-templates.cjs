#!/usr/bin/env node
/**
 * Extract inline template: and styles: from Angular .ts components
 * into separate .html and .scss files, then update the .ts to use
 * templateUrl / styleUrls instead.
 */
const fs = require('fs');
const path = require('path');

const TARGET_FILES = [
  'src/app/features/auth/login-page.component.ts',
  'src/app/features/auth/register-page.component.ts',
  'src/app/features/search/search-page.component.ts',
  'src/app/features/vehicle/vehicle-detail-page.component.ts',
  'src/app/features/booking/booking-page.component.ts',
  'src/app/features/chat/chat-page.component.ts',
  'src/app/features/favorites/favorites-page.component.ts',
  'src/app/features/compare/compare-page.component.ts',
  'src/app/features/profile/profile-page.component.ts',
  'src/app/features/user-profile/user-profile-page.component.ts',
  'src/app/features/host/host-page.component.ts',
  'src/app/features/owner-dashboard/owner-dashboard-page.component.ts',
  'src/app/features/admin/admin-page.component.ts',
  'src/app/features/privacy/privacy-page.component.ts',
  'src/app/features/privacy/privacy-center-page.component.ts',
  'src/app/shared/components/image-gallery.component.ts',
];

const BASE = path.resolve(__dirname, '..');

function extractTemplate(content) {
  // Find template: ` ... `
  const templateStart = content.indexOf("template: `");
  if (templateStart === -1) return null;
  
  let depth = 0;
  let i = templateStart + "template: `".length;
  let result = '';
  
  while (i < content.length) {
    const ch = content[i];
    if (ch === '\\' && i + 1 < content.length) {
      result += content[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      break;
    }
    result += ch;
    i++;
  }
  
  // Also get the full match range including the closing backtick
  const fullMatch = content.substring(templateStart, i + 1);
  
  return { html: result.trim(), fullMatch, startIndex: templateStart, endIndex: i + 1 };
}

function extractStyles(content) {
  // Find styles: [` ... `]  or  styles: [`...`]
  const stylesStart = content.indexOf("styles: [");
  if (stylesStart === -1) return null;
  
  // Find the opening backtick
  let i = stylesStart + "styles: [".length;
  while (i < content.length && content[i] !== '`') i++;
  if (i >= content.length) return null;
  
  i++; // skip opening backtick
  let result = '';
  
  while (i < content.length) {
    const ch = content[i];
    if (ch === '\\' && i + 1 < content.length) {
      result += content[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      break;
    }
    result += ch;
    i++;
  }
  
  // Find the closing ]
  let j = i + 1;
  while (j < content.length && content[j] !== ']') j++;
  
  const fullMatch = content.substring(stylesStart, j + 1);
  
  return { css: result.trim(), fullMatch, startIndex: stylesStart, endIndex: j + 1 };
}

function applyDesignTokens(css) {
  // Replace hardcoded colors with design tokens
  let result = css;
  
  // Replace rgba(88, 181, 158, ...) with var(--primary-light) approximations
  result = result.replace(/rgba\(88,\s*181,\s*158,\s*0\.0[68]\)/g, 'var(--primary-soft)');
  result = result.replace(/rgba\(88,\s*181,\s*158,\s*0\.1[0-8]?\)/g, 'var(--primary-light)');
  result = result.replace(/rgba\(88,\s*181,\s*158,\s*0\.2[0-8]?\)/g, 'rgba(62, 207, 165, 0.2)');
  
  // Replace hardcoded #58b59e with var(--primary)
  result = result.replace(/#58b59e/gi, 'var(--primary)');
  result = result.replace(/#33c39e/gi, 'var(--primary)');
  result = result.replace(/#3ECFA5/gi, 'var(--primary)');
  
  // Replace rgba(103, 203, 176, ...) patterns
  result = result.replace(/rgba\(103,\s*203,\s*176,\s*0\.\d+\)/g, 'var(--border)');
  
  // Replace gradient backgrounds with flat colors
  result = result.replace(/linear-gradient\(135deg,\s*#8ad8c7\s*0%,\s*#58b59e\s*100%\)/g, 'var(--primary)');
  result = result.replace(/linear-gradient\(135deg,\s*#8ad8c7\s*0%,\s*#63c5af\s*60%,\s*#44947f\s*100%\)/g, 'var(--primary)');
  
  // Replace hardcoded font families
  result = result.replace(/font-family:\s*'Karla'[^;]*/g, "font-family: var(--font-body)");
  result = result.replace(/font-family:\s*'Staatliches'[^;]*/g, "font-family: var(--font-display)");
  result = result.replace(/font-family:\s*'Panton'[^;]*/g, "font-family: var(--font-body)");
  result = result.replace(/font-family:\s*'Built Titling'[^;]*/g, "font-family: var(--font-display)");
  
  // Replace hardcoded text colors
  result = result.replace(/#315f53/g, 'var(--graphite-700)');
  result = result.replace(/#427a6d/g, 'var(--mint-700)');
  result = result.replace(/#335d53/g, 'var(--graphite-700)');
  result = result.replace(/#4d6761/g, 'var(--graphite-600)');
  result = result.replace(/#537069/g, 'var(--graphite-600)');
  result = result.replace(/#33695a/g, 'var(--graphite-700)');
  result = result.replace(/#0b110d/g, 'var(--graphite-950)');
  result = result.replace(/#09100c/g, 'var(--graphite-950)');
  
  // Replace hardcoded bg colors
  result = result.replace(/#edf4f1/g, 'var(--surface-muted)');
  result = result.replace(/#eef5f2/g, 'var(--surface-muted)');
  result = result.replace(/#edf5f2/g, 'var(--surface-muted)');
  result = result.replace(/#eef6f3/g, 'var(--surface-muted)');
  result = result.replace(/#f3f8f6/g, 'var(--surface-soft)');
  result = result.replace(/#fbfdfc/g, 'var(--cream)');
  result = result.replace(/#dce8e3/g, 'var(--graphite-200)');
  result = result.replace(/#dbe8e3/g, 'var(--graphite-200)');
  
  // Replace hardcoded border-radius
  result = result.replace(/border-radius:\s*30px/g, 'border-radius: var(--radius-lg)');
  result = result.replace(/border-radius:\s*32px/g, 'border-radius: var(--radius-xl)');
  result = result.replace(/border-radius:\s*24px/g, 'border-radius: var(--radius-lg)');
  result = result.replace(/border-radius:\s*22px/g, 'border-radius: var(--radius-lg)');
  result = result.replace(/border-radius:\s*20px/g, 'border-radius: var(--radius-lg)');
  result = result.replace(/border-radius:\s*18px/g, 'border-radius: var(--radius-md)');
  result = result.replace(/border-radius:\s*16px/g, 'border-radius: var(--radius-md)');
  result = result.replace(/border-radius:\s*14px/g, 'border-radius: var(--radius-sm)');
  result = result.replace(/border-radius:\s*12px/g, 'border-radius: var(--radius-sm)');
  result = result.replace(/border-radius:\s*999px/g, 'border-radius: var(--radius-pill)');
  
  // Replace hardcoded shadows
  result = result.replace(/rgba\(36,\s*49,\s*45,\s*0\.18\)/g, 'rgba(14, 22, 19, 0.4)');
  result = result.replace(/rgba\(29,\s*41,\s*37,\s*0\.\d+\)/g, 'rgba(14, 22, 19, 0.08)');
  result = result.replace(/rgba\(28,\s*40,\s*37,\s*0\.\d+\)/g, 'rgba(14, 22, 19, 0.08)');
  
  // Replace gradient bgs on containers with flat
  result = result.replace(
    /background:\s*linear-gradient\(180deg,\s*rgba\(251,\s*253,\s*252[^)]*\)[^;]*\)/g,
    'background: var(--white)'
  );
  result = result.replace(
    /background:\s*radial-gradient\([^)]*rgba\(88,\s*181,\s*158[^;]*/g,
    'background: var(--white)'
  );
  
  return result;
}

let processed = 0;
let errors = 0;

for (const relPath of TARGET_FILES) {
  const tsPath = path.join(BASE, relPath);
  
  if (!fs.existsSync(tsPath)) {
    console.log(`SKIP (not found): ${relPath}`);
    continue;
  }
  
  let content = fs.readFileSync(tsPath, 'utf8');
  
  const template = extractTemplate(content);
  const styles = extractStyles(content);
  
  if (!template) {
    console.log(`SKIP (no inline template): ${relPath}`);
    continue;
  }
  
  const dir = path.dirname(tsPath);
  const baseName = path.basename(tsPath, '.ts');
  const htmlPath = path.join(dir, `${baseName}.html`);
  const scssPath = path.join(dir, `${baseName}.scss`);
  
  try {
    // Write HTML
    fs.writeFileSync(htmlPath, template.html + '\n', 'utf8');
    
    // Write SCSS (apply design token replacements)
    if (styles) {
      const cleanedCss = applyDesignTokens(styles.css);
      fs.writeFileSync(scssPath, cleanedCss + '\n', 'utf8');
    } else if (!fs.existsSync(scssPath)) {
      fs.writeFileSync(scssPath, '// Component styles\n', 'utf8');
    }
    
    // Update TS: replace template with templateUrl, styles with styleUrls
    let newContent = content;
    
    // Replace template
    const templateUrlRef = `templateUrl: './${baseName}.html'`;
    newContent = newContent.replace(template.fullMatch, templateUrlRef);
    
    // Replace styles
    if (styles) {
      const styleUrlsRef = `styleUrls: ['./${baseName}.scss']`;
      newContent = newContent.replace(styles.fullMatch, styleUrlsRef);
    }
    
    // If there are styleUrls already but no styles: match, leave them
    fs.writeFileSync(tsPath, newContent, 'utf8');
    
    processed++;
    console.log(`OK: ${relPath} → .html + .scss`);
  } catch (err) {
    errors++;
    console.error(`ERROR: ${relPath}: ${err.message}`);
  }
}

console.log(`\nDone. Processed: ${processed}, Errors: ${errors}`);
