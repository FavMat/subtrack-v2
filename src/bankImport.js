// ── bankImport.js - Dynamic imports to avoid iOS WebKit memory crash ──
// Heavy libs (pdfjs, xlsx, tesseract) are loaded ONLY when the user
// actually uploads that file type, keeping initial memory footprint minimal.

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
  // ISO format
  let d = new Date(str);
  if (!isNaN(d)) return d;
  // dd/mm/yyyy or dd-mm-yyyy
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

// ── CSV Parser (dynamic import of papaparse) ──
export async function parseCSV(file) {
  // Dynamic import: only load papaparse on demand
  const { default: Papa } = await import('papaparse');

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        try {
          const rows = result.data;
          if (!rows.length) return reject(new Error('CSV vuoto o non leggibile'));

          const descCol = Object.keys(rows[0]).find(c => /desc|descri|narr|detail|merchant|nome|causale|beneficiario/i.test(c));
          const amtCol = Object.keys(rows[0]).find(c => /amount|importo|ammontare|betrag|valore|addebito|dare/i.test(c));
          const dateCol = Object.keys(rows[0]).find(c => /date|data|datum|fecha|started|completed|valuta/i.test(c));

          if (!descCol) {
            return reject(new Error('Colonna descrizione non trovata.\n\nColonne presenti: ' + Object.keys(rows[0]).join(', ')));
          }

          const transactions = rows
            .map(row => ({
              description: String(row[descCol] || '').trim(),
              amount: parseAmount(row[amtCol]),
              date: parseDate(row[dateCol]),
            }))
            .filter(tx => tx.description && tx.amount > 0);

          if (transactions.length === 0) {
            return reject(new Error('Nessuna transazione con importo valido trovata nel CSV.'));
          }

          resolve(findRecurring(transactions));
        } catch (e) {
          reject(e);
        }
      },
      error: (err) => reject(new Error('Errore lettura CSV: ' + err.message)),
    });
  });
}

// ── PDF Parser (dynamic import of pdfjs-dist) ──
export async function parsePDF(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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

// ── Excel Parser (dynamic import of xlsx) ──
export async function parseExcel(file) {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv' });
  return parseCSV(blob);
}

// ── Image OCR Parser (dynamic import of tesseract.js) ──
export async function parseImage(file) {
  const { default: Tesseract } = await import('tesseract.js');

  // Tesseract can hang on mobile — enforce 45s timeout
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Analisi immagine troppo lenta. Prova a caricare un CSV o PDF invece.')), 45000)
  );

  const ocr = (async () => {
    let worker;
    try {
      worker = await Tesseract.createWorker('ita+eng');
      const { data: { text } } = await worker.recognize(file);
      return extractFromText(text, true);
    } finally {
      if (worker) await worker.terminate().catch(() => {});
    }
  })();

  return Promise.race([ocr, timeout]);
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
    throw new Error(isImage
      ? 'Nessuna transazione trovata nell\'immagine. Assicurati che lo screen sia nitido e contenga importi chiari.'
      : 'Nessuna transazione trovata nel file. Assicurati che contenga date e importi chiari.');
  }

  return findRecurring(transactions);
}
