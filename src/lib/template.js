import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const viewsDir = join(__dirname, '../views');

// Simple template engine with {{ variable }} and {{# include }} syntax
export async function renderTemplate(templateName, data = {}) {
  const templatePath = join(viewsDir, `${templateName}.html`);
  
  if (!existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateName}`);
  }

  let html = readFileSync(templatePath, 'utf-8');

  // Process includes {{# include:partial }}
  html = html.replace(/\{\{#\s*include:(\w+)\s*\}\}/g, (match, partial) => {
    const partialPath = join(viewsDir, 'partials', `${partial}.html`);
    if (existsSync(partialPath)) {
      return readFileSync(partialPath, 'utf-8');
    }
    return '';
  });

  // Process conditionals {{#if condition}}...{{/if}}
  html = html.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
    return data[condition] ? content : '';
  });

  // Process loops {{#each items}}...{{/each}}
  html = html.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayName, content) => {
    const items = data[arrayName] || [];
    return items.map((item, index) => {
      let itemContent = content;
      // Replace item properties
      if (typeof item === 'object') {
        Object.keys(item).forEach(key => {
          const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
          itemContent = itemContent.replace(regex, escapeHtml(String(item[key] ?? '')));
        });
      } else {
        itemContent = itemContent.replace(/\{\{\s*this\s*\}\}/g, escapeHtml(String(item)));
      }
      itemContent = itemContent.replace(/\{\{\s*@index\s*\}\}/g, String(index));
      return itemContent;
    }).join('');
  });

  // Replace variables {{ variable }}
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    const value = data[key];
    if (typeof value !== 'object') {
      html = html.replace(regex, escapeHtml(String(value ?? '')));
    }
  });

  // Handle nested object properties {{ obj.prop }}
  html = html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
    const value = getNestedValue(data, path);
    return value !== undefined ? escapeHtml(String(value)) : '';
  });

  // Clean up any remaining unmatched template tags
  html = html.replace(/\{\{[^}]+\}\}/g, '');

  return html;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, char => map[char]);
}

// Raw HTML helper (use with caution)
export function raw(html) {
  return { __raw: true, html };
}
