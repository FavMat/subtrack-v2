import fs from 'fs';
import path from 'path';

const filePath = 'c:\\Users\\donat\\.gemini\\antigravity\\scratch\\subtrack-v2\\src\\App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Inserimento logica Stripe nel main useEffect
const stripeLogic = `  // Check session and handles redirects (Stripe/Reset)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // 1. Handle Stripe Redirects
    if (params.get('payment') === 'success') {
      setAuthMsg({ text: '🎉 Subscription active! Welcome to SubTrack Pro.', type: 'success' });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('payment') === 'cancelled') {
      setAuthMsg({ text: 'Payment cancelled.', type: 'error' });
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // 2. Handle password reset redirect
    if (params.get('reset') === '1' || window.location.hash.includes('type=recovery')) {
      setScreen('reset');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (!supabase) return;
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        fetchSubs(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        fetchSubs(session.user.id);
      } else {
        setUser(null);
        setSubs([]);
        setScreen('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);`;

// Trova il vecchio useEffect (il primo del componente App) e sostituiscilo
content = content.replace(/\/\/ Check session on load\s+useEffect\(\(\) => \{[\s\S]*?\}, \[\]\);/, stripeLogic);

// 2. Rimozione handleDemo
content = content.replace(/if \(!supabase\) \{[\s\S]*?setUser\(\{ id: 'demo'[\s\S]*?return;\s*\}/, '');

// 3. Rimozione pulsante Demo dal JSX
content = content.replace(/<button type="button" className="btn-link" style=\{\{ marginLeft: '1rem' \}\} onClick=\{\(\) => \{[\s\S]*?setIsDemoMode\(true\);[\s\S]*?\}\}>\s*\{t\.btn_demo\}\s*<\/button>/, '');

// 4. Rimozione Footer Chips
content = content.replace(/\{(\/\* Footer Features \*\/)\}\s*<div className="auth-footer">[\s\S]*?<\/div>(\s*<\/div>)/, '$2');

fs.writeFileSync(filePath, content);
console.log('App.jsx cleaned and ready for production!');
