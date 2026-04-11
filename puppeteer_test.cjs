const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('PAGE_ERROR:', error));
  
  await page.goto('http://localhost:5173/');
  
  // Login
  await page.type('input[name=email]', 'matteofavilli@hotmail.it');
  await page.type('input[name=password]', 'Formentera@2026');
  await page.click('button[type=submit]');
  
  // Give it time to load the dashboard
  await new Promise(r => setTimeout(r, 2000));
  
  // Settings tab is the 3rd button with class tab-item
  const tabs = await page.$$('button.tab-item');
  if (tabs.length >= 3) {
      await tabs[2].click();
  } else {
      console.log('Could not find tab buttons');
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Setup file chooser interception on the hidden input directly!
  const fileInput = await page.$('input[type=file]');
  await fileInput.uploadFile('C:/Users/donat/Downloads/account-statement_2026-01-01_2026-04-11_en-us_c88b30.csv');
  
  console.log('Upload complete. Checking for modal or errors. Waiting 3s...');
  await new Promise(r => setTimeout(r, 3000));
  
  const modalText = await page.evaluate(() => document.body.innerText);
  console.log('Body Text Snippet: ', modalText.substring(0, 500));
  
  await browser.close();
})();
