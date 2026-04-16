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

// ── iOS Safe File Readers ──
// Blob.text() e Blob.arrayBuffer() spesso "congelano" la PWA silenziosamente ("si addormenta")
// FileReader è più affidabile e rilascia i callback correttamente anche con RAM sotto stress.
async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Errore di sistema nella lettura del file (iOS issue). Riprova.'));
    reader.readAsText(file);
  });
}

async function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Errore nella lettura dei dati del file.'));
    reader.readAsArrayBuffer(file);
  });
}

// ── CSV Parser ──
export async function parseCSV(file) {
  const text = await readFileAsText(file); // Risolve il freeze su iOS PWA
  if (!text || text.trim().length === 0) {
    throw new Error('CSV vuoto o illeggibile. Prova con la funzione Incolla Testo o ritenta.');
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

          // Se non troviamo colonne, proviamo ad unire tutti i campi come testo brutto
          if (!descCol) {
            return resolve(extractFromText(text, false));
          }

          const transactions = rows
            .map(row => ({
              description: String(row[descCol] || '').trim(),
              amount: parseAmount(row[amtCol]),
              date: parseDate(row[dateCol]),
            }))
            .filter(tx => tx.description && tx.amount > 0);

          if (transactions.length === 0) {
            return resolve(extractFromText(text, false)); // Fallback a Regex
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

// ── PDF Parser ──
export async function parsePDF(file) {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    
    // Usiamo il nostro FileReader asincrono invece di file.arrayBuffer()
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let allText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      allText += content.items.map(item => item.str).join(' ') + '\n';
    }
    return extractFromText(allText, false);
  } catch(e) {
    throw new Error('Errore estrazione PDF (' + e.message + '). Riprova con un CSV o uno Screenshot.');
  }
}

// ── Excel Parser ──
export async function parseExcel(file) {
  try {
    const XLSX = await import('xlsx');
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const csvText = XLSX.utils.sheet_to_csv(worksheet);
    
    const blob = new Blob([csvText], { type: 'text/csv' });
    return parseCSV(blob);
  } catch(e) {
    throw new Error('Errore durante la lettura del file Excel: ' + e.message);
  }
}

// ── Image OCR (Implementazione Tesseract) ──
async function downscaleImage(file, maxWidth = 1200) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Converte in blob per abbassare il footprint di memoria
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error('Conversione immagine fallita'));
        else resolve(blob);
      }, 'image/jpeg', 0.85);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Errore caricamento immagine per il ridimensionamento.'));
    };
    
    img.src = url;
  });
}

export async function parseImage(file) {
  try {
    // Importazione dinamica per non pesare sul caricamento base dell'app
    const Tesseract = (await import('tesseract.js')).default || await import('tesseract.js');
    
    // DOWN-SCALE: Riduciamo la foto a max 1200px per evitare il crash OOM (Out Of Memory) su iOS Safari PWA!
    const resizedBlob = await downscaleImage(file, 1200);
    
    // Url temporaneo per liberare memoria velocemente
    const imgUrl = URL.createObjectURL(resizedBlob);
    
    // Inizializza l'OCR con la lingua Italiana
    const worker = await Tesseract.createWorker('ita');
    const ret = await worker.recognize(imgUrl);
    
    await worker.terminate();
    URL.revokeObjectURL(imgUrl);
    
    if (!ret.data || !ret.data.text) {
      throw new Error('Screenshot non decifrabile (testo insufficiente).');
    }
    
    return extractFromText(ret.data.text, true);
  } catch (e) {
    throw new Error('Errore motore OCR: ' + e.message + '. Ritenta la foto o seleziona un file più piccolo.');
  }
}

function extractFromText(allText, isImage = false) {
  // Pulisce piccoli errori classici degli screenshot / OCR
  let cleanedText = allText;
  if (isImage) {
    cleanedText = cleanedText.replace(/€/gi, ' ');
    cleanedText = cleanedText.replace(/\b([a-z])\s+([a-z])\b/gi, '$1$2'); // Unisce lettere spaiate
  }

  const lines = cleanedText.split('\n');
  const transactions = [];
  
  // Aggiunti pattern più larghi per supportare l'OCR
  const patterns = [
    // Data (gg/mm/aa) - Descrizione - Importo (12,34)
    /(\d{1,2}[\/\-\.\s]{1,4}\d{1,2}[\/\-\.\s]{1,4}\d{2,4})\s+(.+?)\s+(-?\d+[.,]\d{2})\s*€?/g,
    // Formati alternativi
    /(\d{4}[\/\-\.\s]{1,4}\d{1,2}[\/\-\.\s]{1,4}\d{1,2})\s+(.+?)\s+(-?\d+[.,]\d{2})/g,
    // Senza spazio vicino all'importo (errore tipico OCR)
    /(\d{1,2}[\/\-\.\s]{1,4}\d{1,2})\s+(.+?)(\d+[.,]\d{2})/g,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const desc = match[2].trim();
        const amountStr = match[3] || match[4]; // Dipende dal pattern
        const amount = parseAmount(amountStr);
        let date = parseDate(match[1].replace(/\s/g, '')); // Tolti gli spazzi errati delle date OCR
        
        if (desc && amount > 0 && desc.length > 2) {
          transactions.push({ description: desc, amount, date });
        }
      }
    }
  }

  if (transactions.length === 0) {
    throw new Error('Nessuna transazione identificata nel documento/immagine.');
  }
  
  return findRecurring(transactions);
}
