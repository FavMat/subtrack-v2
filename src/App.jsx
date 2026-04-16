import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { Plus, LogOut, TrendingUp, LayoutDashboard, Settings, X, Bell, Trash2, Mail, ChevronDown, Lock, Building, RefreshCw, CheckCircle2, Upload, FileText } from 'lucide-react';
import { usePlaidLink } from 'react-plaid-link';
import { translations } from './translations';
import { parseCSV, parsePDF, parseExcel, parseImage } from './bankImport';

// ─── Emojis e Categorie ───────────────────────────────────────
const EMOJIS = ['🎬', '⚡', '🏃', '💼', '🛍️', '🧘', '📦', '🍕', '✈️', '🚘', '🎮', '📚', '🎵', '🐕', '🏥', '🏦', '🎓', '💄', '🍷', '🎁'];

function addDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { this.setState({ info }); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#fff', color: '#000', minHeight: '100vh', overflow: 'auto' }}>
          <h2 style={{ color: 'black' }}>UI Crash! (Cattura errore)</h2>
          <pre style={{ color: 'red', fontSize: '12px', whiteSpace: 'pre-wrap' }}>{this.state.error?.toString()}</pre>
          <pre style={{ color: 'blue', fontSize: '10px', whiteSpace: 'pre-wrap' }}>{this.state.info?.componentStack}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: '10px', marginTop: '20px', background: '#e0e0e0', color: 'black' }}>Ricarica l'app</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  const [user, setUser] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [recapEmailEnabled, setRecapEmailEnabled] = useState(true);
  const [subs, setSubs] = useState([]);
  const [tab, setTab] = useState('dashboard');
  const [authMode, setAuthMode] = useState('login');
  const [authMsg, setAuthMsg] = useState({ text: '', type: '' });
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [linkToken, setLinkToken] = useState(null);
  const [isSyncingBank, setIsSyncingBank] = useState(false);
  const [bankConnected, setBankConnected] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showPastePanel, setShowPastePanel] = useState(false);
  const fileInputRef = useRef(null);

  const [analyticsPeriod, setAnalyticsPeriod] = useState('monthly');
  const [alertPref, setAlertPref] = useState(() => localStorage.getItem('st_alert') || '1');

  const [modal, setModal] = useState({ open: false, sub: null, addCat: false, isShared: false, showAdvanced: true, catIcon: '📦' });
  const [expandedCat, setExpandedCat] = useState(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const openPaywall = () => setPaywallOpen(true);

  const [customCats, setCustomCats] = useState(() => {
    try { return JSON.parse(localStorage.getItem('st_cats') || '[]'); } catch { return []; }
  });

  // ── i18n & PWA Logic ──
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('st_lang');
    if (saved) return saved;
    return navigator.language.toLowerCase().startsWith('it') ? 'it' : 'en';
  });

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosPrompt, setShowIosPrompt] = useState(false);

  useEffect(() => {
    localStorage.setItem('st_lang', lang);
  }, [lang]);

  useEffect(() => {
    // Rileva se è un iPhone/iPad che gira nel browser standard di Safari
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isIOSDevice && !isStandalone) {
      setIsIos(true);
    }

    // Intercetta PWA Prompt su Android / Chrome Desktop
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosPrompt(true);
      return;
    }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    }
  };

  const t = (key) => translations[lang]?.[key] || translations['en'][key] || key;

  const BASE_CATEGORIES = [
    { value: 'entertainment', label: t('cat_ent'), icon: '🎬', color: '#8B5CF6' },
    { value: 'utilities', label: t('cat_util'), icon: '⚡', color: '#F59E0B' },
    { value: 'lifestyle', label: t('cat_life'), icon: '🏃', color: '#10B981' },
    { value: 'software', label: t('cat_soft'), icon: '💼', color: '#3B82F6' },
    { value: 'shopping', label: t('cat_shop'), icon: '🛍️', color: '#EF4444' },
    { value: 'health', label: t('cat_health'), icon: '🧘', color: '#14B8A6' },
    { value: 'other', label: t('cat_other'), icon: '📦', color: '#6B7280' },
  ];

  const CYCLES = [
    { value: 'monthly', label: t('cycle_monthly'), months: 1 },
    { value: 'bimonthly', label: t('cycle_bimonthly'), months: 2 },
    { value: 'quarterly', label: t('cycle_quarterly'), months: 3 },
    { value: 'quadrimestral', label: t('cycle_quadrimestral'), months: 4 },
    { value: 'semiannual', label: t('cycle_semiannual'), months: 6 },
    { value: 'yearly', label: t('cycle_yearly'), months: 12 },
  ];

  const DEMO_SUBS = [
    { id: 'd1', name: 'Netflix', price: 15.99, cycle: 'monthly', next_renewal: addDays(3), category: 'entertainment', is_shared: false },
    { id: 'd2', name: 'Spotify Family', price: 16.99, cycle: 'monthly', next_renewal: addDays(12), category: 'entertainment', is_shared: true, shared_name: 'Giulia', shared_payment_status: 'devo' },
    { id: 'd3', name: 'Notion', price: 9.99, cycle: 'monthly', next_renewal: addDays(26), category: 'software', is_shared: false },
    { id: 'd4', name: 'Fastweb 5G', price: 29.99, cycle: 'monthly', next_renewal: addDays(5), category: 'utilities', is_shared: false },
    { id: 'd5', name: 'Amazon Prime', price: 49.90, cycle: 'yearly', next_renewal: addDays(40), category: 'shopping', is_shared: false },
  ];

  const cycleLabel = (val) => CYCLES.find(c => c.value === val)?.label || val;
  const toMonthly = (price, cycle) => {
    const months = CYCLES.find(c => c.value === cycle)?.months || 1;
    return parseFloat(price) / months;
  };

  const allCats = [...BASE_CATEGORIES, ...customCats];

  const [resetPasswordMode, setResetPasswordMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setUser(session.user); fetchAll(session.user); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setResetPasswordMode(true);
      }
      if (session) { setUser(session.user); fetchAll(session.user); }
      else { setUser(null); setIsDemo(false); setSubs([]); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) {
      setResetPasswordMode(true);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // iOS PWA: force React re-render when app returns from background (e.g. after file picker)
  useEffect(() => {
    // Il vecchio hack 'opacity: 0.999' causava il WebGL Context Loss
    // distruggendo l'intera interfaccia al ritorno dal File Picker. Rimosso.
  }, []);

  useEffect(() => { localStorage.setItem('st_cats', JSON.stringify(customCats)); }, [customCats]);
  useEffect(() => { localStorage.setItem('st_alert', alertPref); }, [alertPref]);

  const fetchAll = async (u) => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', u.id).single();
    if (profile) {
      setIsPro(profile.is_pro || profile.is_pro_manual);
      setRecapEmailEnabled(profile.recap_email_enabled ?? true);
    }
    const { data: rows } = await supabase.from('subscriptions').select('*').eq('user_id', u.id).order('next_renewal', { ascending: true });
    if (rows) setSubs(rows);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError(''); setAuthMsg({ text: '', type: '' });
    const fd = new FormData(e.target);
    const email = fd.get('email');
    
    if (authMode === 'forgot-password') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      });
      if (error) setAuthError(t('err_login'));
      else setAuthMsg({ text: t('reset_pass_msg'), type: 'success' });
      return;
    }

    const password = fd.get('password');
    const confirm = fd.get('confirm');
    
    if (authMode === 'signup') {
      if (password !== confirm) return setAuthMsg({ text: t('err_pass_match'), type: 'error' });
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthError(t('err_login'));
      else if (data.user) setAuthMsg({ text: t('signup_success'), type: 'success' });
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(t('err_login'));
      else if (data.user) {
        setUser(data.user); setIsDemo(false);
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
        const proStatus = profile?.is_pro || profile?.is_pro_manual;
        setIsPro(!!proStatus);
        if (!proStatus) setPaywallOpen(true);
      }
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setAuthError('');
    const fd = new FormData(e.target);
    const new_password = fd.get('new_password');
    const { error } = await supabase.auth.updateUser({ password: new_password });
    if (error) {
      setAuthError('Errore: ' + error.message);
    } else {
      setResetPasswordMode(false);
      setAuthMsg({ text: 'Password aggiornata con successo!', type: 'success' });
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  };

  const onPlaidSuccess = useCallback(async (public_token) => {
    try {
      if (!isDemo && public_token !== 'demo-fallback') {
        const { error } = await supabase.functions.invoke('plaid-exchange-token', { body: { public_token } });
        if (error) throw error;
      }
      setBankConnected(true);
      setIsSyncingBank(false);
    } catch (err) {
      console.error('Plaid exchange err:', err);
      setIsSyncingBank(false);
      alert('Errore scambio token: ' + (err?.message || err));
    }
  }, [isDemo]);

  const plaidConfig = {
    token: linkToken,
    onSuccess: (public_token, metadata) => onPlaidSuccess(public_token),
    onExit: () => setIsSyncingBank(false),
  };

  const { open: openPlaid, ready: plaidReady } = usePlaidLink(plaidConfig);

  useEffect(() => {
    if (linkToken && plaidReady) {
      openPlaid();
    }
  }, [linkToken, plaidReady, openPlaid]);

  const startPlaidFlow = async () => {
    if (!isPro) { setPaywallOpen(true); return; }

    // In Demo mode simula connessione riuscita
    if (isDemo) {
      setIsSyncingBank(true);
      setTimeout(() => { setBankConnected(true); setIsSyncingBank(false); }, 1500);
      return;
    }

    setIsSyncingBank(true);
    try {
      const res = await supabase.functions.invoke('plaid-create-link', { body: { userId: user?.id } });
      console.log('Plaid create-link response:', res);
      
      if (res.error) {
        alert('Errore Plaid: ' + (res.error?.message || JSON.stringify(res.error)));
        setIsSyncingBank(false);
        return;
      }
      if (!res.data?.link_token) {
        alert('Nessun link_token ricevuto: ' + JSON.stringify(res.data));
        setIsSyncingBank(false);
        return;
      }
      
      setLinkToken(res.data.link_token);
    } catch (e) {
      console.error('Plaid flow error:', e);
      alert('Eccezione Plaid: ' + e.message);
      setIsSyncingBank(false);
    }
  };

  const startDemo = () => {
    setIsDemo(true); setIsPro(true); setSubs(DEMO_SUBS);
    setUser({ id: 'demo', email: 'demo@subtrack.app' });
  };

  const logout = async () => {
    if (isDemo) { setUser(null); setIsDemo(false); setSubs([]); return; }
    await supabase.auth.signOut();
  };

  const processCSVText = async (text) => {
    if (!text || text.trim().length < 10) {
      alert('Testo troppo corto. Incolla il contenuto completo del file CSV.');
      return;
    }
    setIsImporting(true);
    setShowPastePanel(false);
    try {
      const results = await parseCSV(new Blob([text], { type: 'text/csv' }));
      if (results.length === 0) {
        alert('Nessun abbonamento ricorrente trovato nel testo incollato.');
      } else {
        setImportResults(results);
      }
    } catch (err) {
      alert(err.message || 'Errore nel parsing del testo');
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddImportedSubs = async () => {
    const selected = importResults.filter(r => r.selected);
    if (!selected.length) { setImportResults(null); return; }

    // Duplicate check
    const duplicates = selected.filter(s =>
      subs.some(existing => existing.name.toLowerCase().trim() === s.name.toLowerCase().trim())
    );
    if (duplicates.length > 0) {
      const names = duplicates.map(d => d.name).join(', ');
      const proceed = window.confirm(`⚠️ Attenzione: "${names}" ${duplicates.length > 1 ? 'sembrano già presenti' : 'sembra già presente'} nella tua lista.\n\nVuoi aggiungerli comunque?`);
      if (!proceed) return;
    }

    if (!isDemo) {
      const inserts = selected.map(s => {
        const nrDate = new Date(s.lastDate || new Date());
        if (s.cycle === 'yearly') nrDate.setFullYear(nrDate.getFullYear() + 1);
        else nrDate.setMonth(nrDate.getMonth() + 1);
        
        return {
          user_id: user.id,
          name: s.name,
          price: s.price,
          cycle: s.cycle,
          category: s.category,
          next_renewal: nrDate.toISOString().split('T')[0]
        };
      });
      const { data, error } = await supabase.from('subscriptions').insert(inserts).select();
      if (!error && data) {
        setSubs(prev => [...prev, ...data].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
      }
    } else {
      const newSubs = selected.map(s => ({
        ...s,
        created_at: new Date().toISOString()
      }));
      setSubs(prev => [...prev, ...newSubs]);
    }
    setImportResults(null);
    setTab('dashboard');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      user_id: user.id,
      name: fd.get('name'),
      price: parseFloat(fd.get('price')),
      cycle: fd.get('cycle'),
      next_renewal: fd.get('next_renewal'),
      category: fd.get('category'),
      is_shared: isPro ? modal.isShared : false,
    };

    if (data.is_shared) {
      data.shared_name = fd.get('shared_name') || null;
      data.shared_email = fd.get('shared_email') || null;
      data.shared_payment_status = fd.get('shared_payment_status') || null;
      data.shared_reminder_cycle = fd.get('shared_reminder_cycle') || null;
      data.shared_has_paid = fd.get('shared_has_paid') === 'on';
    } else {
      data.shared_name = null; data.shared_email = null;
      data.shared_payment_status = null; data.shared_reminder_cycle = null;
      data.shared_has_paid = false;
    }

    if (isDemo) {
      if (modal.sub) setSubs(s => s.map(x => x.id === modal.sub.id ? { ...x, ...data } : x));
      else setSubs(s => [...s, { ...data, id: 'demo-' + Date.now() }]);
      return closeModal();
    }

    if (modal.sub) {
      await supabase.from('subscriptions').update(data).eq('id', modal.sub.id);
    } else {
      await supabase.from('subscriptions').insert([data]);
    }
    closeModal(); fetchAll(user);
  };

  const handleDelete = async () => {
    if (!modal.sub) return;
    if (!confirm(t('del_confirm'))) return;
    if (isDemo) { setSubs(s => s.filter(x => x.id !== modal.sub.id)); return closeModal(); }
    await supabase.from('subscriptions').delete().eq('id', modal.sub.id);
    closeModal(); fetchAll(user);
  };

  const handleAddCat = (e) => {
    e.preventDefault();
    if (!isPro) return;
    const fd = new FormData(e.target);
    const name = fd.get('cat_name'); if (!name) return;
    const icon = fd.get('cat_icon') || '📦';
    const val = name.toLowerCase().replace(/\s+/g, '_');
    const colors = ['#EC4899', '#06B6D4', '#84CC16', '#F97316', '#A855F7'];
    const color = colors[customCats.length % colors.length];
    setCustomCats(c => [...c, { value: val, label: name, icon, color }]);
    setModal(m => ({ ...m, addCat: false }));
  };

  const openSubModal = (sub = null) => {
    if (!sub && !isPro && subs.length >= 10) {
      openPaywall();
      return;
    }
    setModal({ open: true, sub, addCat: false, isShared: sub?.is_shared || false, showAdvanced: sub?.is_shared || false, catIcon: '📦' });
  }; 
  
  const closeModal = () => setModal({ open: false, sub: null, addCat: false, isShared: false, showAdvanced: false, catIcon: '📦' });
  // ── Dashboard Math ───────────────────────────────────────────
  const pureMonthlyTotal = subs.filter(s => s.cycle === 'monthly').reduce((acc, s) => acc + parseFloat(s.price), 0);
  const amortizedLongTotal = subs.filter(s => s.cycle !== 'monthly').reduce((acc, s) => acc + toMonthly(s.price, s.cycle), 0);
  const totalAmortizedMonthly = pureMonthlyTotal + amortizedLongTotal;
  const yearlyTotal = totalAmortizedMonthly * 12;

  const activeAlertDays = isPro ? parseInt(alertPref, 10) : 1;
  const renewingSoon = subs.filter(s => {
    const d = new Date(s.next_renewal), today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((d - today) / 86400000);
    return diff >= 0 && diff <= activeAlertDays;
  });

  const getCatColor = (val) => allCats.find(c => c.value === val)?.color || '#6B7280';
  const getCatIcon = (val) => allCats.find(c => c.value === val)?.icon || '📦';
  const formatDate = (d) => new Date(d).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-US', { day: 'numeric', month: 'short' });

  // ── Analytics Math ───────────────────────────────────────────
  const currentTotalAmount = analyticsPeriod === 'yearly' ? yearlyTotal : totalAmortizedMonthly;
  let cumulativePercent = 0;
  const pieSlices = allCats.map(cat => {
    const sum = subs.filter(s => s.category === cat.value).reduce((a, s) => a + toMonthly(s.price, s.cycle), 0);
    const catTotal = analyticsPeriod === 'yearly' ? sum * 12 : sum;
    const p = currentTotalAmount > 0 ? (catTotal / currentTotalAmount) * 100 : 0;
    if (p <= 0) return null;
    const endPercent = cumulativePercent + p;
    const slice = `${cat.color} ${cumulativePercent}% ${endPercent}%`;
    cumulativePercent = endPercent;
    return slice;
  }).filter(Boolean);
  const conicGradientStr = pieSlices.length > 0 ? `conic-gradient(${pieSlices.join(', ')})` : 'conic-gradient(#e2e8f0 0 100%)';

  // ══════════════════════════════════════════════════════════
  // UI RENDER
  // ══════════════════════════════════════════════════════════
  if (!user) return (
    <div className="app-container"><div className="auth-screen"><div className="auth-content">
      <h1 className="logo-small" style={{ fontSize: '2.6rem', textAlign: 'center', margin: '0 0 -5px' }}>SubTrack</h1>
      <p className="hero-subtitle" style={{ textAlign: 'center', marginBottom: '1.25rem' }}>{t('app_subtitle')}</p>

      {/* PWA INSTALL PROMPT */}
      {(deferredPrompt || isIos) && (
        <div style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '12px', marginBottom: '1.25rem', border: '1px solid var(--border)', textAlign: 'center' }}>
          <h4 style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1rem', marginBottom: '4px' }}>{t('install_title')}</h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>{t('install_desc')}</p>
          <button onClick={handleInstallClick} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
            {t('install_btn')}
          </button>
          {showIosPrompt && (
            <p style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--accent-2)', fontWeight: 600 }}>{t('install_ios')}</p>
          )}
        </div>
      )}

      <div className="glass-panel auth-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="auth-tabs" style={{ marginBottom: '1.5rem' }}>
          <button className={`auth-tab ${authMode === 'login' ? 'active' : ''}`} onClick={() => {setAuthMode('login'); setAuthMsg({text:'', type:''}); setAuthError('');}}>{t('login_tab')}</button>
          <button className={`auth-tab ${authMode === 'signup' ? 'active' : ''}`} onClick={() => {setAuthMode('signup'); setAuthMsg({text:'', type:''}); setAuthError('');}}>{t('signup_tab')}</button>
        </div>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div className="input-group"><label>{t('email_label')}</label><input type="email" name="email" required /></div>
          
          {authMode !== 'forgot-password' && (
            <div className="input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>{t('password_label')}</label>
                {authMode === 'login' && (
                   <span onClick={() => {setAuthMode('forgot-password'); setAuthMsg({text:'', type:''}); setAuthError('');}} style={{ fontSize: '0.75rem', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>{t('forgot_pass_tab')}</span>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} name="password" required />
                <button type="button" onClick={() => setShowPassword(p => !p)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '4px' }}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          )}
          
          {authMode === 'signup' && <div className="input-group"><label>{t('confirm_password_label')}</label><input type="password" name="confirm" required /></div>}
          {authError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{authError}</p>}
          {authMsg.text && <p className={`auth-message ${authMsg.type}`}>{authMsg.text}</p>}
          
          <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              {authMode === 'login' ? t('login_btn') : authMode === 'signup' ? t('signup_btn') : t('reset_pass_btn')}
            </button>
            {authMode === 'forgot-password' && (
              <p onClick={() => {setAuthMode('login'); setAuthMsg({text:'', type:''}); setAuthError('');}} style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem', cursor: 'pointer', fontWeight: 600 }}>{t('back_to_login')}</p>
            )}
          </div>
        </form>
      </div>
      <button className="btn btn-outline" style={{ marginTop: '0.75rem' }} onClick={startDemo}>{t('demo_btn')}</button>
    </div></div></div>
  );

  // If user is resetting password, block the UI with a modal
  if (resetPasswordMode) return (
    <div className="app-container"><div className="auth-screen"><div className="auth-content">
      <h1 className="logo-small" style={{ fontSize: '2rem', textAlign: 'center', marginBottom: '1rem' }}>{t('reset_pass_title')}</h1>
      <div className="glass-panel auth-card">
        <form onSubmit={handleUpdatePassword}>
          <div className="input-group">
            <label>{t('new_password_label')}</label>
            <div style={{ position: 'relative' }}>
              <input type={showPassword ? 'text' : 'password'} name="new_password" required />
              <button type="button" onClick={() => setShowPassword(p => !p)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '4px' }}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          {authError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{authError}</p>}
          <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }}>{t('update_pass_btn')}</button>
        </form>
      </div>
    </div></div></div>
  );

  return (
    <div className="app-container dashboard">
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div className="logo-small">SubTrack</div>
          {isPro && <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '999px', letterSpacing: '0.07em' }}>★ PRO</span>}
          {isDemo && <span style={{ background: 'rgba(245,158,11,0.12)', color: '#D97706', fontSize: '0.6rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '999px', letterSpacing: '0.07em' }}>DEMO</span>}
        </div>
        <button onClick={logout} className="btn-icon"><LogOut size={20} /></button>
      </header>

      <main className="screen">
        {/* ══ HOME TAB ══ */}
        {tab === 'dashboard' && (
          <>
            <div className="total-card">
              <p className="label" style={{ opacity: 0.9, fontSize: '0.8rem', letterSpacing: '0.04em' }}>{t('monthly_spend')}</p>
              <h2 className="amount" style={{ marginBottom: '0.4rem', fontSize: '3.4rem', letterSpacing: '-1.5px' }}>€{pureMonthlyTotal.toFixed(2)}</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '0.5rem', opacity: 0.9 }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 500, color: '#fff' }}>
                  + €{amortizedLongTotal.toFixed(2)} {t('quota_multimonth')}
                </p>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.02em', marginTop: '3px', textTransform: 'uppercase' }}>
                  {t('yearly_total')}: €{yearlyTotal.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="alert-selector" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-card)', padding: '0.6rem', borderRadius: '999px', margin: '-0.25rem 0 1.25rem', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>🔔 {t('alerts_label')} </span>
              {isPro ? (
                <select value={alertPref} onChange={e => setAlertPref(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontWeight: 700, padding: '0 0.2rem', width: 'auto', outline: 'none', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <option value="1">{t('alert_1')}</option><option value="3">{t('alert_3')}</option><option value="7">{t('alert_7')}</option><option value="14">{t('alert_14')}</option>
                </select>
              ) : (
                <span onClick={openPaywall} style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.8rem', marginLeft: '0.2rem', display: 'flex', alignItems: 'center', cursor: 'pointer', opacity: 0.9 }}>
                  {t('alert_1')}
                  <span title={t('pro_only')} style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '4px', marginLeft: '6px' }}>★ PRO</span>
                </span>
              )}
            </div>

            {renewingSoon.length > 0 && (
              <div className="renewal-banner">
                <span className="banner-icon">🔔</span>
                <div className="banner-text">
                  <p><strong>{renewingSoon[0].name}</strong> {t('renews_on')} <strong>{formatDate(renewingSoon[0].next_renewal)}</strong>{renewingSoon.length > 1 && ` (+${renewingSoon.length - 1})`}</p>
                </div>
              </div>
            )}

            {!isPro && (
              <div className="pro-banner" onClick={openPaywall} style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', padding: '1rem 1.25rem', borderRadius: 'var(--radius)', margin: '0 0 1.25rem 0', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>{t('pro_banner_home_title')}</h4>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', opacity: 0.9 }}>{t('pro_banner_home_desc')}</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.2)', padding: '0.4rem 0.6rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                    SCOPRI 🚀
                  </div>
                </div>
              </div>
            )}

            <div className="subs-list">
              <div className="section-header">
                <h3>{t('your_subs')}</h3>
                <span className="sub-count">{subs.length}{isPro ? '' : '/10'}</span>
              </div>
              {subs.map(sub => (
                <div key={sub.id} className="sub-card" data-category={sub.category} onClick={() => openSubModal(sub)}>
                  <div className="sub-dot" style={{ background: getCatColor(sub.category) + '20' }}>{getCatIcon(sub.category)}</div>
                  <div className="sub-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <h4 className="sub-name">{sub.name}</h4>
                      {sub.is_shared && <span className="badge-shared" title="Condiviso">👥</span>}
                    </div>
                    <p className="sub-meta">{t('renews')} {formatDate(sub.next_renewal)}</p>
                  </div>
                  <div className="sub-price">
                    <span className="sub-price-val">€{parseFloat(sub.price).toFixed(2)}</span>
                    <span className="sub-cycle-text">{cycleLabel(sub.cycle).toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ ANALYTICS TAB ══ */}
        {tab === 'analytics' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{t('analytics_title')}</h3>
            </div>

            <div className="analytics-toggle">
              <button className={analyticsPeriod === 'monthly' ? 'active' : ''} onClick={() => setAnalyticsPeriod('monthly')}>{t('btn_monthly')}</button>
              <button className={analyticsPeriod === 'yearly' ? 'active' : ''} onClick={() => setAnalyticsPeriod('yearly')}>{t('btn_yearly')}</button>
            </div>

            <div className="glass-panel" style={{ padding: '2rem 1rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div className="pie-chart-container">
                <div className="pie-chart" style={{ background: conicGradientStr }} />
                <div className="pie-center-hole">
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', lineHeight: 1.2 }}>
                    {analyticsPeriod === 'yearly' ? t('total_yearly') : t('total_monthly')}
                  </p>
                  <p style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '0.1rem' }}>€{currentTotalAmount.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ marginBottom: '1.25rem', padding: '1.25rem' }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
                {analyticsPeriod === 'yearly' ? t('breakdown_yearly') : t('breakdown_monthly')}
              </p>

              {allCats.map(cat => {
                const catSubs = subs.filter(s => s.category === cat.value);
                const pureM = catSubs.filter(s => s.cycle === 'monthly').reduce((acc, s) => acc + parseFloat(s.price), 0);
                const amorL = catSubs.filter(s => s.cycle !== 'monthly').reduce((acc, s) => acc + toMonthly(s.price, s.cycle), 0);
                const sumMonthly = pureM + amorL;
                const catTotal = analyticsPeriod === 'yearly' ? sumMonthly * 12 : sumMonthly;

                if (catTotal === 0) return null;
                const perc = currentTotalAmount > 0 ? (catTotal / currentTotalAmount * 100) : 0;

                return (
                  <div key={cat.value} className="chart-bar-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
                    <div onClick={() => setExpandedCat(expandedCat === cat.value ? null : cat.value)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', cursor: 'pointer', padding: '0.35rem 0', borderRadius: 'var(--radius-xs)', transition: 'all 0.2s', ...(expandedCat === cat.value ? { background: 'var(--bg-input)', padding: '0.35rem' } : {}) }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.1rem' }}>{cat.icon}</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {cat.label}
                        </span>
                        <span style={{ color: cat.color, fontSize: '0.7rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>●</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>€{catTotal.toFixed(2)}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, width: '32px', textAlign: 'right' }}>{perc.toFixed(0)}%</span>
                        <ChevronDown size={14} style={{ color: 'var(--text-muted)', transform: expandedCat === cat.value ? 'rotate(180deg)' : 'none', transition: '0.3s' }} />
                      </div>
                    </div>

                    {expandedCat === cat.value && catSubs.length > 0 && (
                      <div style={{ padding: '0.5rem 0.5rem 0.5rem 1rem', borderLeft: `2.5px solid ${cat.color}80`, marginLeft: '0.5rem', animation: 'fadeIn 0.2s ease', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {catSubs.sort((a, b) => toMonthly(b.price, b.cycle) - toMonthly(a.price, a.cycle)).map(sub => {
                          const subAmount = analyticsPeriod === 'yearly' ? toMonthly(sub.price, sub.cycle) * 12 : toMonthly(sub.price, sub.cycle);
                          return (
                            <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' }}>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '0.5rem', flex: 1 }}>{sub.name}</span>
                              <span style={{ fontSize: '0.85rem', color: cat.color, fontWeight: 700, flexShrink: 0 }}>€{subAmount.toFixed(2)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="chart-bar-track" style={{ width: '100%', height: '6px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div className="chart-bar-fill" style={{ width: `${perc}%`, background: cat.color, height: '100%', borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })}
              {currentTotalAmount === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('no_data')}</p>}
            </div>

            <div className="glass-panel">
              <p style={{ fontWeight: 800, marginBottom: '1rem', fontSize: '1rem' }}>{t('top_5')}</p>
              {[...subs]
                .sort((a, b) => toMonthly(b.price, b.cycle) - toMonthly(a.price, a.cycle))
                .slice(0, 5)
                .map((sub, i) => {
                  const subAmount = analyticsPeriod === 'yearly' ? toMonthly(sub.price, sub.cycle) * 12 : toMonthly(sub.price, sub.cycle);
                  return (
                    <div key={sub.id} className="top-sub-row">
                      <span className="top-sub-rank">#{i + 1}</span>
                      <span className="top-sub-name">{sub.name}</span>
                      <span className="top-sub-price">€{subAmount.toFixed(2)}<span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>/{analyticsPeriod === 'yearly' ? 'y' : 'm'}</span></span>
                    </div>
                  )
                })}
              {subs.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('no_subs')}</p>}
            </div>
          </div>
        )}

        {/* ══ SETTINGS TAB ══ */}
        {tab === 'settings' && (
          <div>
            <h3 style={{ marginBottom: '1.25rem', fontSize: '1.3rem', fontWeight: 800 }}>{t('settings_title')}</h3>
            <p className="settings-section-title">{t('account_section')}</p>
            <div className="settings-row"><span className="settings-row-label">{t('email_row')}</span><span className="settings-row-value">{user.email}</span></div>
            <div className="settings-row" onClick={() => setPaywallOpen(true)}
              style={{ cursor: 'pointer' }}>
              <span className="settings-row-label">{t('plan_row')}</span>
              <span className="settings-row-value" style={{ color: isPro ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {isDemo ? t('demo_plan') : isPro ? `★ ${t('premium_plan')}` : `${t('free_plan')} →`}
              </span>
            </div>

            <p className="settings-section-title" style={{ marginTop: '1.5rem' }}>{t('language_section')}</p>
            <div className="settings-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="settings-row-label">{t('language_label')}</span>
              </div>
              <select value={lang} onChange={(e) => setLang(e.target.value)} style={{ padding: '0.3rem', borderRadius: '4px', background: 'var(--bg-input)', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </select>
            </div>

            {isPro && (
              <>
                <p className="settings-section-title" style={{ marginTop: '1.5rem' }}>{t('email_notifications')}</p>
                <div className="settings-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="settings-row-label">{t('monthly_recap')}</span>
                    <span className="settings-row-value" style={{ fontSize: '0.75rem', marginTop: '2px' }}>{t('monthly_recap_desc')}</span>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={recapEmailEnabled} onChange={async (e) => {
                      const val = e.target.checked;
                      setRecapEmailEnabled(val);
                      if (!isDemo) await supabase.from('profiles').update({ recap_email_enabled: val }).eq('id', user.id);
                    }} />
                    <span className="slider" />
                  </label>
                </div>
              </>
            )}

            {/* Bank Import */}
            <div className="glass-panel" style={{ marginTop: '1.5rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
                <div style={{ background: 'rgba(99,102,241,0.06)', padding: '0.5rem', borderRadius: '8px', color: 'var(--accent)' }}>
                  <FileText size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0 }}>Import Bank Statement</h4>
                    {!isPro && <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '4px' }}>★ PRO</span>}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>Upload the PDF or CSV file generated by your bank to automatically find subscriptions.</p>
                </div>
              </div>

              {/* Method 1: File Upload */}
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-sm)', marginBottom: '0.6rem' }}>
                <button className="btn"
                  style={{ background: 'linear-gradient(135deg, var(--accent), #a855f7)', color: '#fff', width: '100%', fontWeight: 700, border: 'none', position: 'relative', zIndex: 1, pointerEvents: 'none' }}>
                  {isImporting ? <RefreshCw size={16} /> : <Upload size={16} />}
                  {' '}{isImporting ? 'Analyzing...' : 'Choose File'}
                </button>
                <input type="file" accept=".csv,.xlsx,.pdf,image/*"
                  onClick={(e) => {
                    if (!isPro && !isDemo) { e.preventDefault(); setPaywallOpen(true); }
                  }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsImporting(true);
                    const safetyTimer = setTimeout(() => {
                      setIsImporting(false);
                      alert('Processing too slow. Try pasting the CSV text directly using the button below.');
                    }, 45000);
                    setTimeout(async () => {
                      try {
                        let results;
                        const name = file.name.toLowerCase();
                        if (name.endsWith('.pdf')) results = await parsePDF(file);
                        else if (name.endsWith('.xlsx') || name.endsWith('.xls')) results = await parseExcel(file);
                        else if (file.type.startsWith('image/')) results = await parseImage(file);
                        else results = await parseCSV(file);
                        clearTimeout(safetyTimer);
                        if (results.length === 0) alert(t('import_no_results'));
                        else setImportResults(results);
                      } catch (err) {
                        clearTimeout(safetyTimer);
                        alert(err.message || 'Error parsing file');
                      } finally {
                        setIsImporting(false);
                        e.target.value = '';
                      }
                    }, 800);
                  }}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 2 }}
                />
              </div>

              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 0.75rem' }}>Supports PDF (text), CSV or Excel.</p>

              {/* Method 2: Paste CSV text (mobile-safe, no file picker) */}
              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '0.75rem' }}>
                <button
                  onClick={() => {
                    if (!isPro && !isDemo) { setPaywallOpen(true); return; }
                    setShowPastePanel(p => !p);
                  }}
                  style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', width: '100%', padding: '0.6rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  📋 {showPastePanel ? 'Nascondi' : 'Incolla testo CSV'}&nbsp;
                  <span style={{ background: '#10b98120', color: '#059669', fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', border: '1px solid #10b98140' }}>MOBILE ✓</span>
                </button>

                {showPastePanel && (
                  <div style={{ marginTop: '0.75rem', animation: 'fadeIn 0.2s ease' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
                      📱 <strong>Guida iPhone:</strong> Apri il file CSV con l'app Files, premi i 3 puntini → Seleziona tutto → Copia. Poi incolla qui sotto.
                    </p>
                    <textarea
                      id="csv-paste-area"
                      placeholder={'Incolla il contenuto del CSV qui...\n\nEsempio:\nDate,Description,Amount\n2026-01-15,Netflix,-15.99\n2026-02-15,Netflix,-15.99'}
                      style={{
                        width: '100%', minHeight: '120px', padding: '0.75rem',
                        borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)',
                        background: 'var(--bg-input)', color: 'var(--text-primary)',
                        fontSize: '0.78rem', fontFamily: 'monospace', resize: 'vertical',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      onClick={() => {
                        const text = document.getElementById('csv-paste-area').value;
                        processCSVText(text);
                      }}
                      className="btn btn-primary"
                      style={{ width: '100%', marginTop: '0.5rem', fontWeight: 800 }}>
                      🔍 Analizza testo incollato
                    </button>
                  </div>
                )}
              </div>
            </div>


            {/* Bank Sync */}
            <div className="glass-panel" style={{ marginTop: '1.5rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.6rem' }}>
                <div style={{ background: 'rgba(99,102,241,0.06)', padding: '0.5rem', borderRadius: '8px', color: 'var(--accent)' }}>
                  <Building size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0 }}>{t('bank_sync_title')}</h4>
                    <span style={{ background: 'linear-gradient(135deg, var(--accent), #a855f7)', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coming Soon</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{t('bank_sync_desc')}</p>
                </div>
              </div>
              <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.85rem' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  {t('bank_privacy')}
                </p>
              </div>
              {bankConnected ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '0.65rem', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 700 }}>
                  <CheckCircle2 size={16} /> {t('bank_connected_status')}
                </div>
              ) : (
                <button onClick={startPlaidFlow} disabled={isSyncingBank} className="btn"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', width: '100%' }}>
                  {isSyncingBank ? <RefreshCw size={16} className="spin" /> : <Building size={16} />}
                  {' '}{isSyncingBank ? t('syncing') : t('connect_bank')}
                </button>
              )}
            </div>

            <button onClick={logout} className="btn btn-danger" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2.5rem' }}>
              <LogOut size={16} style={{ marginRight: '6px' }} /> {t('logout')}
            </button>
          </div>
        )}
      </main>

      <button className="floating-add-btn" onClick={() => openSubModal()}><Plus size={28} /></button>

      {/* ── Modal Avanzato ── */}
      {modal.open && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h3>{modal.addCat ? t('new_cat') : modal.sub ? t('edit_sub') : t('new_sub')}</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {modal.sub && !modal.addCat && (
                  <button type="button" className="btn-icon" onClick={handleDelete} title="Elimina" style={{ color: 'var(--danger)', background: 'var(--danger-light)' }}>
                    <Trash2 size={18} />
                  </button>
                )}
                <button type="button" className="btn-close btn-icon" onClick={closeModal}><X size={20} /></button>
              </div>
            </div>

            {modal.addCat ? (
              <form onSubmit={handleAddCat}>
                <div className="input-group"><label>{t('cat_name')}</label><input name="cat_name" required placeholder="" autoFocus /></div>
                <div className="input-group">
                  <label>{t('cat_emoji')}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginTop: '0.4rem' }}>
                    {EMOJIS.map(e => (
                      <div key={e} onClick={() => setModal(m => ({ ...m, catIcon: e }))}
                        style={{
                          fontSize: '1.5rem', textAlign: 'center', padding: '0.45rem', cursor: 'pointer',
                          background: modal.catIcon === e ? 'var(--accent-light)' : 'var(--bg-card-solid)',
                          border: modal.catIcon === e ? '2px solid var(--accent)' : '1px solid var(--border-soft)',
                          borderRadius: 'var(--radius-xs)', transition: 'all 0.1s'
                        }}>
                        {e}
                      </div>
                    ))}
                  </div>
                  <input type="hidden" name="cat_icon" value={modal.catIcon || '📦'} />
                </div>
                <div className="modal-actions" style={{ marginTop: '2rem' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setModal(m => ({ ...m, addCat: false }))}>{t('cancel')}</button>
                  <button type="submit" className="btn btn-primary">{t('save')}</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSave}>
                <div className="input-group"><label>{t('sub_name')}</label><input name="name" defaultValue={modal.sub?.name} required placeholder="Netflix" /></div>
                <div className="input-row">
                  <div className="input-group"><label>{t('price')}</label><input name="price" type="number" step="0.01" min="0" defaultValue={modal.sub?.price} required /></div>
                  <div className="input-group"><label>{t('cycle')}</label><select name="cycle" defaultValue={modal.sub?.cycle || 'monthly'}>{CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                </div>
                <div className="input-group">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {t('category')}
                    {isPro ? (
                      <button type="button" onClick={() => setModal(m => ({ ...m, addCat: true }))} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>{t('add_btn')}</button>
                    ) : (
                      <span onClick={openPaywall} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                         <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>({t('pro_only')})</span>
                         <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '4px', marginLeft: '6px' }}>★ PRO</span>
                      </span>
                    )}
                  </label>
                  <select name="category" defaultValue={modal.sub?.category || 'entertainment'} className="custom-select">{allCats.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}</select>
                </div>
                <div className="input-group">
                  <label>{t('next_renewal')}</label><input name="next_renewal" type="date" defaultValue={modal.sub?.next_renewal || new Date().toISOString().split('T')[0]} required />
                </div>

                <div className="shared-section-wrapper" style={{
                  background: isPro && modal.isShared ? 'var(--bg-input)' : 'transparent',
                  borderRadius: 'var(--radius-sm)', padding: isPro && modal.isShared ? '1.25rem' : '0.5rem 0',
                  margin: '1.25rem 0', border: isPro && modal.isShared ? '1px solid var(--border)' : 'none', borderTop: !modal.isShared ? '1px solid var(--border-soft)' : '',
                }}>

                  {isPro ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: modal.isShared ? 'var(--accent)' : 'var(--text-primary)', textTransform: 'none', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          👥 {t('shared_title')}
                        </label>
                        <label className="switch">
                          <input type="checkbox" name="is_shared" checked={modal.isShared} onChange={e => setModal(m => ({ ...m, isShared: e.target.checked }))} />
                          <span className="slider" />
                        </label>
                      </div>

                      {modal.isShared && (
                        <div style={{ marginTop: '1rem', animation: 'fadeUp 0.3s ease' }}>
                          <button type="button" onClick={() => setModal(m => ({ ...m, showAdvanced: !m.showAdvanced }))}
                            style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-xs)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: 'var(--shadow-xs)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>⚙️ {t('advanced_options')}</div>
                            <ChevronDown size={16} style={{ transform: modal.showAdvanced ? 'rotate(180deg)' : 'none', transition: '0.3s' }} />
                          </button>

                          {modal.showAdvanced && (
                             <div className="shared-details-grid" style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '1.2rem', animation: 'fadeIn 0.2s ease', padding: '1.25rem', background: 'rgba(255,255,255,0.4)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,0,0,0.04)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.03)' }}>
                              
                              {/* Nome */}
                              <div className="input-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t('other_person')}</label>
                                <input name="shared_name" placeholder="Es. Marco" defaultValue={modal.sub?.shared_name} style={{ border: '1px solid var(--border-soft)', background: 'var(--bg-input)' }} />
                              </div>

                              <div style={{ height: '1px', background: 'var(--border-soft)' }} />

                              {/* Payment Status Dropdown */}
                              <div className="input-group" style={{ marginBottom: 0 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                                  <span style={{ fontSize: '1rem' }}>💸</span> {t('payment_status')}
                                </label>
                                <select className="custom-select" name="shared_payment_status" defaultValue={modal.sub?.shared_payment_status || 'devo'} style={{ border: '1px solid rgba(99,102,241,0.3)', color: 'var(--accent)', fontWeight: 600, background: 'var(--bg-input)' }}>
                                  <option value="devo">{t('status_devo')}</option>
                                  <option value="mi_deve">{t('status_mi_deve')}</option>
                                </select>
                              </div>

                              {/* Has Paid Toggle */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                  <span style={{ fontSize: '1.2rem', opacity: 0.9 }}>✅</span>
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{t('has_paid_title')}</label>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{t('has_paid_desc')}</span>
                                  </div>
                                </div>
                                <label className="switch">
                                  <input type="checkbox" name="shared_has_paid" defaultChecked={modal.sub?.shared_has_paid} />
                                  <span className="slider" />
                                </label>
                              </div>

                              <div style={{ height: '1px', background: 'var(--border-soft)' }} />

                              {/* Email Persona Condivisa */}
                              <div className="input-group" style={{ marginBottom: 0 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                  <span style={{ fontSize: '1rem' }}>✉️</span> {t('email_row')} <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 'normal', textTransform: 'none' }}>{t('optional')}</span>
                                </label>
                                <input type="email" name="shared_email" placeholder="marco@email.com" defaultValue={modal.sub?.shared_email} style={{ border: '1px solid var(--border-soft)', background: 'var(--bg-input)' }} />
                              </div>

                              {/* Reminder Dropdown */}
                              <div className="input-group" style={{ marginBottom: 0 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                                  <span style={{ fontSize: '1rem' }}>🔔</span> {t('want_reminder')}
                                </label>
                                <select className="custom-select" name="shared_reminder_cycle" defaultValue={modal.sub?.shared_reminder_cycle || ''} style={{ background: 'var(--bg-input)' }}>
                                  <option value="">{t('rem_none')}</option>
                                  <option value="monthly">{t('rem_monthly')}</option>
                                  <option value="bimonthly">{t('rem_bimonthly')}</option>
                                  <option value="quarterly">{t('rem_quarterly')}</option>
                                  <option value="quadrimestral">{t('rem_quadri')}</option>
                                  <option value="semiannual">{t('rem_semi')}</option>
                                  <option value="yearly">{t('rem_yearly')}</option>
                                </select>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '8px', padding: '0.65rem', background: 'rgba(99,102,241,0.06)', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.1)' }}>
                                  <span style={{ fontSize: '0.9rem' }}>💡</span>
                                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>
                                    {t('rem_desc')}
                                  </p>
                                </div>
                              </div>
                            </div>
                           )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div onClick={openPaywall} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.8, cursor: 'pointer', padding: '0.5rem 0', borderBottom: '1px solid var(--border-soft)' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'none', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                        👥 {t('shared_title')}
                        <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '4px', marginLeft: '4px' }}>★ PRO</span>
                      </label>
                      <label className="switch" style={{ pointerEvents: 'none' }}><input type="checkbox" disabled /><span className="slider" /></label>
                    </div>
                  )}
                </div>

                <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                  <button type="submit" className="btn btn-primary">{modal.sub ? t('save_changes') : t('add_sub')}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ══ IMPORT RESULTS MODAL ══ */}
      {importResults && (
        <div className="modal" style={{ zIndex: 9999 }} onClick={() => setImportResults(null)}>
          <div className="modal-content" style={{ animation: 'fadeUp 0.3s cubic-bezier(0.16,1,0.3,1)', padding: 0, maxWidth: '500px', width: '92%' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.5rem 1.5rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={24} color="var(--accent)" />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{t('import_found_title')}</h3>
              </div>
              <button className="btn-icon" onClick={() => setImportResults(null)}><X size={20} /></button>
            </div>
            <div style={{ padding: '0.3rem 1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {t('import_found_desc')}
            </div>
            {/* Select All bar */}
            <div style={{ padding: '0.5rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)', borderTop: '1px solid var(--border-soft)', margin: '0.4rem 0' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {importResults.filter(r => r.selected).length} / {importResults.length} selezionati
              </span>
              <button
                onClick={() => {
                  const allSelected = importResults.every(r => r.selected);
                  setImportResults(importResults.map(r => ({ ...r, selected: !allSelected })));
                }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.25rem 0.7rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}
              >
                {importResults.every(r => r.selected) ? 'Deseleziona tutti' : 'Seleziona tutti'}
              </button>
            </div>
            <div style={{ padding: '0.75rem 1.5rem', maxHeight: '360px', overflowY: 'auto' }}>
              {importResults.map((res, i) => {
                const isDuplicate = subs.some(existing => existing.name.toLowerCase().trim() === res.name.toLowerCase().trim());
                return (
                  <div key={res.id} onClick={(e) => {
                    if (e.target.tagName !== 'INPUT') {
                      setImportResults(prev => prev.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r));
                    }
                  }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem', background: res.selected ? 'rgba(99,102,241,0.08)' : 'var(--bg-input)', border: `1px solid ${res.selected ? 'var(--accent)' : isDuplicate ? '#f59e0b' : 'var(--border)'}`, borderRadius: '12px', marginBottom: '0.5rem', cursor: 'pointer', transition: 'all 0.2s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <input type="checkbox" checked={res.selected} onChange={(e) => {
                        setImportResults(prev => prev.map((r, idx) => idx === i ? { ...r, selected: e.target.checked } : r));
                      }} style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', flexShrink: 0 }} />
                      <div style={{ fontSize: '1.5rem' }}>{getCatIcon(res.category)}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {res.name}
                          {isDuplicate && <span style={{ background: '#fef3c7', color: '#b45309', fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', border: '1px solid #f59e0b80' }}>già presente</span>}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Trovato {res.occurrences} volte</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: res.selected ? 'var(--accent)' : 'var(--text-primary)' }}>€{res.price.toFixed(2)}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/{t('cycle_'+res.cycle)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '1rem 1.5rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              <button onClick={handleAddImportedSubs} className="btn btn-primary" style={{ width: '100%', fontWeight: 800, padding: '0.85rem' }}>
                <Plus size={18} /> {t('import_add_selected')} ({importResults.filter(r => r.selected).length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ PAYWALL MODAL ══ */}
      {paywallOpen && (
        <div className="modal" style={{ zIndex: 9999 }} onClick={() => setPaywallOpen(false)}>
          <div className="modal-content" style={{ animation: 'fadeUp 0.3s cubic-bezier(0.16,1,0.3,1)', padding: 0, maxWidth: '600px', width: '92%' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.5rem 1.5rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{t('paywall_title')}</h3>
              <button className="btn-icon" onClick={() => setPaywallOpen(false)}><X size={20} /></button>
            </div>
            <div style={{ padding: '1rem 1.5rem 1.5rem', display: 'flex', flexDirection: window.innerWidth > 520 ? 'row' : 'column', gap: '1rem' }}>
              <div style={{ flex: 1, padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-input)' }}>
                <h4 style={{ margin: '0 0 0.4rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{t('paywall_basic_name')}</h4>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.25rem' }}>{t('paywall_basic_price')}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><CheckCircle2 size={14} color="var(--text-secondary)" /> {t('paywall_basic_f1')}</li>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><CheckCircle2 size={14} color="var(--text-secondary)" /> {t('paywall_basic_f2')}</li>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><CheckCircle2 size={14} color="var(--text-secondary)" /> {t('paywall_basic_f3')}</li>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', opacity: 0.35 }}><X size={14} /> {t('paywall_basic_no1')}</li>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', opacity: 0.35 }}><X size={14} /> {t('paywall_basic_no2')}</li>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', opacity: 0.35 }}><X size={14} /> {t('paywall_basic_no3')}</li>
                </ul>
                <div style={{ marginTop: '1.25rem', padding: '0.65rem', textAlign: 'center', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('paywall_basic_current')}</div>
              </div>
              <div style={{ flex: 1, padding: '1.25rem', border: '2px solid var(--accent)', borderRadius: '12px', background: 'linear-gradient(145deg,rgba(99,102,241,0.08),rgba(168,85,247,0.05))', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '-10px', right: '14px', background: 'linear-gradient(to right,var(--accent),#a855f7)', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '3px 10px', borderRadius: '12px', textTransform: 'uppercase' }}>{t('paywall_pro_badge')}</div>
                <h4 style={{ margin: '0 0 0.4rem', color: 'var(--accent)', fontWeight: 800 }}>PRO</h4>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.25rem' }}>1.99€ <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{t('paywall_pro_year')}</span></div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><CheckCircle2 size={14} color="var(--accent)" /><strong>{t('paywall_pro_f0')}</strong></li>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><CheckCircle2 size={14} color="var(--accent)" /> {t('paywall_pro_f1')}</li>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><CheckCircle2 size={14} color="var(--accent)" /> {t('paywall_pro_f2')}</li>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><CheckCircle2 size={14} color="var(--accent)" /> {t('paywall_pro_f3')}</li>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><CheckCircle2 size={14} color="var(--accent)" /> {t('paywall_pro_f4')}</li>
                  <li style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><CheckCircle2 size={14} color="var(--accent)" /> {t('paywall_pro_f5')}</li>
                </ul>
                <button onClick={() => { window.location.href = `https://buy.stripe.com/test_00g17LgRjci48jS8ww?client_reference_id=${user?.id}`; }}
                  className="btn btn-primary" style={{ marginTop: '1.25rem', width: '100%', fontWeight: 800, boxShadow: '0 4px 15px rgba(99,102,241,0.3)' }}>
                  {t('paywall_pro_cta')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="tab-bar">
        <button className={`tab-item ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}><LayoutDashboard size={20} /><span>{t('tab_home')}</span></button>
        <button className={`tab-item ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}><TrendingUp size={20} /><span>{t('tab_analytics')}</span></button>
        <button className={`tab-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}><Settings size={20} /><span>{t('tab_settings')}</span></button>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
