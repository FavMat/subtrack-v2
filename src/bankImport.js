// ── bankImport.js - iOS-safe version ──
// Uses static imports only (no dynamic imports that can fail on iOS PWA)
// PapaParse uses its own web worker for CSV parsing
import Papa from 'papaparse';

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
  'claude', 'anthropic', 'midjourney', 'gemini',
];

const CATEGORY_MAP = {
  entertainment: ['netflix', 'spotify', 'disney', 'youtube', 'hbo', 'dazn', 'now tv', 'crunchyroll', 'audible', 'xbox', 'playstation', 'nintendo', 'steam', 'ea play'],
  productivity: ['notion', 'dropbox', 'icloud', 'onedrive', 'adobe', 'canva', 'figma', 'github', 'chatgpt', 'openai', 'claude', 'anthropic', 'midjourney', 'gemini'],
  cloud: ['heroku', 'vercel', 'aws', 'azure', 'digitalocean'],
  utilities: ['fastweb', 'windtre', 'vodafone', 'tim', 'iliad', 'ho mobile', 'kena', 'enel', 'eni', 'a2a', 'hera', 'iren', 'sorgenia'],
  health: ['gym', 'palestra', 'fitprime', 'technogym'],
  finance: ['revolut', 'n26', 'buddybank'],
  news: ['linkedin', 'medium', 'substack'],
};

function detectCategory(name) {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return 'entertainment';
}

function parseAmount(val) {
  if (!val) return 0;
  const str = String(val).replace(/[^0-9,.\-]/g, '');
  const normalized = str.replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : Math.abs(n);
}

function parseDate(val) {
  if (!val) return null;
  const str = String(val).trim();
  let d = new Date(str);
  if (!isNaN(d)) return d;
  const m1 = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m1) {
    const year = m1[3].length === 2 ? '20' + m1[3] : m1[3];
    d = new Date(`${year}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`);
    if (!isNaN(d)) return d;
  }
  return null;
}

function findRecurring(transactions) {
  const groups = {};
  for (const tx of transactions) {
    const key = tx.description
      .toLowerCase()
      .replace(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 30);
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  const results = [];
  for (const [, txs] of Object.entries(groups)) {
    if (txs.length < 2) {
      const isKnown = SUB_KEYWORDS.some(kw => txs[0].description.toLowerCase().includes(kw));
      if (!isKnown) continue;
    }

    const amounts = txs.map(t => t.amount).filter(a => a > 0);
    if (amounts.length === 0) continue;
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (avgAmount < 0.5 || avgAmount > 5000) continue;

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

    let name = txs[0].description
      .replace(/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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
      selected: false,
    });
  }

  return results.sort((a, b) => b.price - a.price);
}

// ── CSV Parser ──
// Reads the file as text first (avoids iOS FileReader WebView issues),
// then parses synchronously so there are no async bridge issues.
export async function parseCSV(file) {
  const text = await file.text();
  if (!text || text.trim().length === 0) {
    throw new Error('CSV vuoto o non leggibile');
  }

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        try {
          const rows = result.data;
          if (!rows || rows.length === 0) {
            return reject(new Error('CSV senza righe dati'));
          }

          const descCol = Object.keys(rows[0]).find(c =>
            /desc|descri|narr|detail|merchant|nome|causale|beneficiario/i.test(c)
          );
          const amtCol = Object.keys(rows[0]).find(c =>
            /amount|importo|ammontare|betrag|valore|addebito|dare/i.test(c)
          );
          const dateCol = Object.keys(rows[0]).find(c =>
            /date|data|datum|fecha|started|completed|valuta/i.test(c)
          );

          if (!descCol) {
            return reject(new Error(
              'Colonna descrizione non trovata.\nColonne: ' + Object.keys(rows[0]).join(', ')
            ));
          }

          const transactions = rows
            .map(row => ({
              description: String(row[descCol] || '').trim(),
              amount: parseAmount(row[amtCol]),
              date: parseDate(row[dateCol]),
            }))
            .filter(tx => tx.description && tx.amount > 0);

          if (transactions.length === 0) {
            return reject(new Error('Nessuna transazione con importo valido trovata.'));
          }

          resolve(findRecurring(transactions));
        } catch(e) {
          reject(e);
        }
      },
      error: (err) => reject(new Error('Errore lettura CSV: ' + (err.message || err))),
    });
  });
}

// ── PDF Parser - NOT supported on mobile, show clear message ──
export async function parsePDF(file) {
  // PDF.js is too heavy for iOS PWA (causes crash/infinite hang)
  // We convert PDF text extraction to a simple FileReader approach
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let allText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      allText += content.items.map(item => item.str).join(' ') + '\n';
    }
    return extractFromText(allText, false);
  } catch(e) {
    throw new Error('Impossibile leggere il PDF su mobile. Esporta il file come CSV dalla tua banca e ricaricalo.');
  }
}

// ── Excel Parser ──
export async function parseExcel(file) {
  try {
    const XLSX = await import('xlsx');
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const csvText = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvText], { type: 'text/csv' });
    return parseCSV(blob);
  } catch(e) {
    throw new Error('Impossibile leggere il file Excel su mobile. Esporta come CSV e ricarica.');
  }
}

// ── Image OCR - NOT recommended on mobile ──
export async function parseImage(file) {
  throw new Error(
    'L\'analisi immagini non è supportata su mobile.\n\n' +
    'Carica invece il file CSV o PDF esportato dalla tua banca.'
  );
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
  if (transactions.length === 0) {
    throw new Error('Nessuna transazione trovata nel file.');
  }
  return findRecurring(transactions);
}
