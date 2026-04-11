import Papa from 'papaparse';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import Tesseract from 'tesseract.js';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ── Known subscription keywords ──
const SUB_KEYWORDS = [
  'netflix', 'spotify', 'disney', 'apple', 'google', 'amazon prime', 'prime video',
  'youtube', 'hbo', 'dazn', 'now tv', 'crunchyroll', 'audible',
  'notion', 'dropbox', 'icloud', 'onedrive', 'adobe', 'canva', 'figma', 'chatgpt', 'openai',
  'github', 'heroku', 'vercel', 'aws', 'azure', 'digitalocean',
  'fastweb', 'windtre', 'vodafone', 'tim', 'iliad', 'ho mobile', 'kena',
  'enel', 'eni', 'a2a', 'hera', 'iren', 'sorgenia',
  'xbox', 'playstation', 'nintendo', 'steam', 'ea play',
  'gym', 'palestra', 'fitprime', 'technogym',
  'linkedin', 'medium', 'substack',
  'revolut', 'n26', 'buddybank',
  'assicurazione', 'insurance', 'allianz', 'generali', 'unipol',
];

// ── Detect category from description ──
function detectCategory(desc) {
  const d = desc.toLowerCase();
  if (/netflix|spotify|disney|apple\s?tv|youtube|hbo|dazn|now\s?tv|crunchyroll|audible|prime\s?video/.test(d)) return 'entertainment';
  if (/notion|dropbox|adobe|canva|figma|chatgpt|openai|github|heroku|vercel/.test(d)) return 'software';
  if (/fastweb|windtre|vodafone|tim\b|iliad|ho\s?mobile|kena/.test(d)) return 'utilities';
  if (/enel|eni\b|a2a|hera|iren|sorgenia|luce|gas|energia/.test(d)) return 'utilities';
  if (/xbox|playstation|nintendo|steam|ea\s?play/.test(d)) return 'entertainment';
  if (/gym|palestra|fitprime|technogym/.test(d)) return 'health';
  if (/amazon|prime/.test(d)) return 'shopping';
  if (/assicur|insurance|allianz|generali|unipol/.test(d)) return 'finance';
  return 'other';
}

// ── Parse amount from various formats ──
function parseAmount(val) {
  if (typeof val === 'number') return Math.abs(val);
  if (!val) return 0;
  let s = String(val).trim().replace(/[€$£\s]/g, '');
  // Handle European format: 1.234,56 → 1234.56
  if (/\d+\.\d{3}/.test(s) && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(',', '.');
  }
  return Math.abs(parseFloat(s)) || 0;
}

// ── Parse date from various formats ──
function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  // DD/MM/YYYY
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return new Date(m[3], m[2] - 1, m[1]);
  // YYYY-MM-DD
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return new Date(m[1], m[2] - 1, m[3]);
  // Try native
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ── Find recurring transactions ──
function findRecurring(transactions) {
  // Group by normalized description
  const groups = {};
  for (const tx of transactions) {
    const key = tx.description.toLowerCase()
      .replace(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/g, '') // remove dates
      .replace(/\s+/g, ' ')
      .trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  const results = [];
  for (const [key, txs] of Object.entries(groups)) {
    // Must appear at least 2 times to be "recurring"
    if (txs.length < 2) {
      // But check if it matches a known subscription
      const isKnown = SUB_KEYWORDS.some(kw => key.includes(kw));
      if (!isKnown) continue;
    }

    // Average amount
    const amounts = txs.map(t => t.amount).filter(a => a > 0);
    if (amounts.length === 0) continue;
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (avgAmount < 0.5 || avgAmount > 5000) continue; // filter noise

    // Determine cycle from frequency
    const dates = txs.map(t => t.date).filter(Boolean).sort((a, b) => a - b);
    let cycle = 'monthly';
    if (dates.length >= 2) {
      const diffs = [];
      for (let i = 1; i < dates.length; i++) {
        diffs.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      if (avgDiff > 300) cycle = 'yearly';
      else if (avgDiff > 150) cycle = 'semiannual';
      else if (avgDiff > 75) cycle = 'quarterly';
      else if (avgDiff > 45) cycle = 'bimonthly';
    }

    // Clean name
    let name = txs[0].description
      .replace(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    // Capitalize
    name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    if (name.length > 30) name = name.substring(0, 30).trim();

    results.push({
      id: 'import_' + Math.random().toString(36).substr(2, 9),
      name,
      price: Math.round(avgAmount * 100) / 100,
      cycle,
      category: detectCategory(name),
      occurrences: txs.length,
      lastDate: dates.length > 0 ? dates[dates.length - 1] : new Date(),
      selected: true,
    });
  }

  // Sort by price descending
  return results.sort((a, b) => b.price - a.price);
}

// ── CSV Parser ──
export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data;
        if (!rows.length) return reject(new Error('CSV vuoto'));

        const cols = Object.keys(rows[0]).map(c => c.toLowerCase().trim());

        // Auto-detect columns
        const descCol = Object.keys(rows[0]).find(c => /desc|descri|narr|detail|merchant|nome|causale|beneficiario/i.test(c));
        const amtCol = Object.keys(rows[0]).find(c => /amount|importo|ammontare|betrag|valore|addebito|dare/i.test(c));
        const dateCol = Object.keys(rows[0]).find(c => /date|data|datum|fecha|started|completed|valuta/i.test(c));

        if (!descCol) return reject(new Error('Colonna descrizione non trovata. Colonne disponibili: ' + Object.keys(rows[0]).join(', ')));

        const transactions = rows
          .map(row => ({
            description: String(row[descCol] || '').trim(),
            amount: parseAmount(row[amtCol]),
            date: parseDate(row[dateCol]),
          }))
          .filter(tx => tx.description && tx.amount > 0);

        resolve(findRecurring(transactions));
      },
      error: (err) => reject(err),
    });
  });
}

function extractFromText(allText, isImage = false) {
  const lines = allText.split('\n');
  const transactions = [];

  const patterns = [
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s+(.+?)\s+(-?\d+[.,]\d{2})\s*€?/g,
    /(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\s+(.+?)\s+(-?\d+[.,]\d{2})/g,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const desc = match[2].trim();
        const amount = parseAmount(match[3]);
        const date = parseDate(match[1]);
        if (desc && amount > 0 && desc.length > 2) {
          transactions.push({ description: desc, amount, date });
        }
      }
    }
  }

  if (transactions.length < 3) {
    const textLower = allText.toLowerCase();
    for (const kw of SUB_KEYWORDS) {
      if (textLower.includes(kw)) {
        const idx = textLower.indexOf(kw);
        const nearby = allText.substring(Math.max(0, idx - 50), idx + kw.length + 50);
        const amtMatch = nearby.match(/(\d+[.,]\d{2})/);
        if (amtMatch) {
          transactions.push({
            description: kw.charAt(0).toUpperCase() + kw.slice(1),
            amount: parseAmount(amtMatch[1]),
            date: new Date(),
          });
        }
      }
    }
  }

  if (transactions.length === 0) {
    throw new Error(isImage ? 'Nessuna transazione trovata nell\'immagine. Assicurati che lo screen sia nitido.' : 'Nessuna transazione trovata nel file. Assicurati che contenga date e importi chiari.');
  }

  return findRecurring(transactions);
}

// ── PDF Parser ──
export async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let allText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    allText += pageText + '\n';
  }

  return extractFromText(allText, false);
}

// ── Excel Parser ──
export async function parseExcel(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv' });
  return parseCSV(blob);
}

// ── Image OCR Parser ──
export async function parseImage(file) {
  let worker;
  try {
    worker = await Tesseract.createWorker('ita+eng');
    const { data: { text } } = await worker.recognize(file);
    return extractFromText(text, true);
  } finally {
    if (worker) await worker.terminate();
  }
}
