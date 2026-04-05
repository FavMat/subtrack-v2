import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Plus, LogOut, TrendingUp, LayoutDashboard, Settings, X, Bell, Trash2, Mail, ChevronDown, Lock } from 'lucide-react';

// ─── Emojis e Categorie ───────────────────────────────────────
const EMOJIS = ['🎬','⚡','🏃','💼','🛍️','🧘','📦','🍕','✈️','🚘','🎮','📚','🎵','🐕','🏥','🏦','🎓','💄','🍷','🎁'];

const BASE_CATEGORIES = [
  { value: 'entertainment', label: 'Intrattenimento', icon: '🎬', color: '#8B5CF6' },
  { value: 'utilities',     label: 'Bollette & Utility', icon: '⚡', color: '#F59E0B' },
  { value: 'lifestyle',     label: 'Lifestyle',    icon: '🏃', color: '#10B981' },
  { value: 'software',      label: 'Produttività', icon: '💼', color: '#3B82F6' },
  { value: 'shopping',      label: 'Shopping',     icon: '🛍️', color: '#EF4444' },
  { value: 'health',        label: 'Salute',       icon: '🧘', color: '#14B8A6' },
  { value: 'other',         label: 'Altro',        icon: '📦', color: '#6B7280' },
];

const CYCLES = [
  { value: 'monthly',       label: 'Mensile',         months: 1  },
  { value: 'bimonthly',     label: 'Bimestrale',      months: 2  },
  { value: 'quarterly',     label: 'Trimestrale',     months: 3  },
  { value: 'quadrimestral', label: 'Quadrimestrale',  months: 4  },
  { value: 'semiannual',    label: 'Semestrale',      months: 6  },
  { value: 'yearly',        label: 'Annuale',         months: 12 },
];

const cycleLabel = (val) => CYCLES.find(c => c.value === val)?.label || val;
const toMonthly  = (price, cycle) => {
  const months = CYCLES.find(c => c.value === cycle)?.months || 1;
  return parseFloat(price) / months;
};

// ─── Dati demo ────────────────────────────────────────────────
const DEMO_SUBS = [
  { id: 'd1', name: 'Netflix',       price: 15.99, cycle: 'monthly',  next_renewal: addDays(3),  category: 'entertainment', is_shared: false },
  { id: 'd2', name: 'Spotify Family',price: 16.99, cycle: 'monthly',  next_renewal: addDays(12), category: 'entertainment', is_shared: true, shared_name: 'Giulia', shared_payment_status: 'devo' },
  { id: 'd3', name: 'Notion',        price: 9.99,  cycle: 'monthly',  next_renewal: addDays(26), category: 'software',      is_shared: false },
  { id: 'd4', name: 'Fastweb 5G',    price: 29.99, cycle: 'monthly',  next_renewal: addDays(5),  category: 'utilities',     is_shared: false },
  { id: 'd5', name: 'Amazon Prime',  price: 49.90, cycle: 'yearly',   next_renewal: addDays(40), category: 'shopping',      is_shared: false },
];
function addDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export default function App() {
  const [user,     setUser]     = useState(null);
  const [isDemo,   setIsDemo]   = useState(false);
  const [isPro,    setIsPro]    = useState(false);
  const [recapEmailEnabled, setRecapEmailEnabled] = useState(true);
  const [subs,     setSubs]     = useState([]);
  const [tab,      setTab]      = useState('dashboard');
  const [authMode, setAuthMode] = useState('login');
  const [authMsg,  setAuthMsg]  = useState({ text: '', type: '' });
  
  const [analyticsPeriod, setAnalyticsPeriod] = useState('monthly');
  const [alertPref, setAlertPref] = useState(() => localStorage.getItem('st_alert') || '1');
  
  const [modal, setModal] = useState({ open: false, sub: null, addCat: false, isShared: false, showAdvanced: true, catIcon: '📦' });
  const [expandedCat, setExpandedCat] = useState(null);
  
  const [customCats, setCustomCats] = useState(() => {
    try { return JSON.parse(localStorage.getItem('st_cats') || '[]'); } catch { return []; }
  });

  const allCats = [...BASE_CATEGORIES, ...customCats];

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setUser(session.user); fetchAll(session.user); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session) { setUser(session.user); fetchAll(session.user); }
      else { setUser(null); setIsDemo(false); setSubs([]); }
    });
    return () => subscription.unsubscribe();
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
    const fd = new FormData(e.target);
    const email = fd.get('email'), password = fd.get('password');
    if (authMode === 'signup') {
      const confirm = fd.get('confirm');
      if (password !== confirm) return setAuthMsg({ text: 'Le password non coincidono.', type: 'error' });
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthMsg({ text: error.message, type: 'error' });
      else setAuthMsg({ text: '✅ Controlla la tua email per confermare!', type: 'success' });
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthMsg({ text: error.message, type: 'error' });
    }
  };

  const handleForgot = async () => {
    const email = document.getElementById('email-input')?.value;
    if (!email) return setAuthMsg({ text: 'Inserisci prima la tua email.', type: 'error' });
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) setAuthMsg({ text: error.message, type: 'error' });
    else setAuthMsg({ text: '📧 Email di recupero inviata!', type: 'success' });
  };

  const startDemo = () => {
    setIsDemo(true); setIsPro(true); setSubs(DEMO_SUBS);
    setUser({ id: 'demo', email: 'demo@subtrack.app' });
  };

  const logout = async () => {
    if (isDemo) { setUser(null); setIsDemo(false); setSubs([]); return; }
    await supabase.auth.signOut();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      user_id:      user.id,
      name:         fd.get('name'),
      price:        parseFloat(fd.get('price')),
      cycle:        fd.get('cycle'),
      next_renewal: fd.get('next_renewal'),
      category:     fd.get('category'),
      is_shared:    isPro ? modal.isShared : false,
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
    if (!confirm('Eliminare questo abbonamento?')) return;
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
    const val  = name.toLowerCase().replace(/\s+/g, '_');
    const colors = ['#EC4899','#06B6D4','#84CC16','#F97316','#A855F7'];
    const color  = colors[customCats.length % colors.length];
    setCustomCats(c => [...c, { value: val, label: name, icon, color }]);
    setModal(m => ({ ...m, addCat: false }));
  };

  const openSubModal = (sub = null) => {
    setModal({
      open: true, sub, addCat: false, catIcon: '📦',
      isShared: sub ? !!sub.is_shared : false,
      showAdvanced: sub ? !!sub.is_shared : true // Default expand advanced if it was shared
    });
  };

  const closeModal = () => setModal({ open: false, sub: null, addCat: false, isShared: false, showAdvanced: false, catIcon: '📦' });

  // ── Dashboard Math ───────────────────────────────────────────
  const pureMonthlyTotal = subs.filter(s => s.cycle === 'monthly').reduce((acc, s) => acc + parseFloat(s.price), 0);
  const amortizedLongTotal = subs.filter(s => s.cycle !== 'monthly').reduce((acc, s) => acc + toMonthly(s.price, s.cycle), 0);
  const totalAmortizedMonthly = pureMonthlyTotal + amortizedLongTotal;
  const yearlyTotal  = totalAmortizedMonthly * 12;

  const activeAlertDays = isPro ? parseInt(alertPref, 10) : 1;
  const renewingSoon = subs.filter(s => {
    const d = new Date(s.next_renewal), today = new Date();
    today.setHours(0,0,0,0);
    const diff = Math.ceil((d - today) / 86400000);
    return diff >= 0 && diff <= activeAlertDays;
  });

  const getCatColor = (val) => allCats.find(c => c.value === val)?.color || '#6B7280';
  const getCatIcon  = (val) => allCats.find(c => c.value === val)?.icon  || '📦';
  const formatDate = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

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
      <p className="hero-subtitle" style={{ textAlign: 'center', marginBottom: '1.25rem' }}>Traccia abbonamenti. Dividi le spese. Restaci in controllo.</p>
      <div className="glass-panel auth-card">
        <div className="auth-tabs">
          <button className={`auth-tab ${authMode === 'login'  ? 'active' : ''}`} onClick={() => setAuthMode('login')}>Accedi</button>
          <button className={`auth-tab ${authMode === 'signup' ? 'active' : ''}`} onClick={() => setAuthMode('signup')}>Registrati</button>
        </div>
        <form onSubmit={handleAuth}>
          <div className="input-group"><label>EMAIL</label><input type="email" name="email" required /></div>
          <div className="input-group"><label>PASSWORD</label><input type="password" name="password" required /></div>
          {authMode === 'signup' && <div className="input-group"><label>CONFERMA PASSWORD</label><input type="password" name="confirm" required /></div>}
          {authMsg.text && <p className={`auth-message ${authMsg.type}`}>{authMsg.text}</p>}
          <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>{authMode === 'login' ? 'Accedi →' : 'Crea account →'}</button>
        </form>
      </div>
      <button className="btn btn-outline" style={{ marginTop: '0.75rem' }} onClick={startDemo}>Prova la demo (Pro) →</button>
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
              <p className="label" style={{ opacity: 0.9, fontSize: '0.8rem', letterSpacing: '0.04em' }}>SPESA DEL MESE</p>
              <h2 className="amount" style={{ marginBottom: '0.4rem', fontSize: '3.4rem', letterSpacing: '-1.5px' }}>€{pureMonthlyTotal.toFixed(2)}</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '0.5rem', opacity: 0.9 }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 500, color: '#fff' }}>
                   + €{amortizedLongTotal.toFixed(2)} quota da abbonamenti multimese
                </p>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.02em', marginTop: '3px', textTransform: 'uppercase' }}>
                   Annuale: €{yearlyTotal.toFixed(2)}
                </p>
              </div>
            </div>
            
            <div className="alert-selector" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-card)', padding: '0.6rem', borderRadius: '999px', margin: '-0.25rem 0 1.25rem', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>🔔 Avvisi: </span>
              {isPro ? (
                <select value={alertPref} onChange={e => setAlertPref(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontWeight: 700, padding: '0 0.2rem', width: 'auto', outline: 'none', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <option value="1">1 giorno prima</option><option value="3">3 giorni prima</option><option value="7">1 settimana prima</option><option value="14">2 settimane prima</option>
                </select>
              ) : (
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.8rem', marginLeft: '0.2rem', display: 'flex', alignItems: 'center' }}>
                  1 giorno prima
                  <span title="Funzione Pro" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '4px', marginLeft: '6px' }}>★ PRO</span>
                </span>
              )}
            </div>

            {renewingSoon.length > 0 && (
              <div className="renewal-banner">
                <span className="banner-icon">🔔</span>
                <div className="banner-text">
                  <p><strong>{renewingSoon[0].name}</strong> rinnova il <strong>{formatDate(renewingSoon[0].next_renewal)}</strong>{renewingSoon.length > 1 && ` (+${renewingSoon.length - 1})`}</p>
                </div>
              </div>
            )}

            <div className="subs-list">
              <div className="section-header">
                <h3>Le tue sottoscrizioni</h3>
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
                    <p className="sub-meta">Rinnova: {formatDate(sub.next_renewal)}</p>
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
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Analytics</h3>
            </div>
            
            <div className="analytics-toggle">
              <button className={analyticsPeriod === 'monthly' ? 'active' : ''} onClick={() => setAnalyticsPeriod('monthly')}>Mensile</button>
              <button className={analyticsPeriod === 'yearly' ? 'active' : ''} onClick={() => setAnalyticsPeriod('yearly')}>Annuale</button>
            </div>

            {/* Grafico a torta Pulito */}
            <div className="glass-panel" style={{ padding: '2rem 1rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div className="pie-chart-container">
                 <div className="pie-chart" style={{ background: conicGradientStr }} />
                 <div className="pie-center-hole">
                   <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', lineHeight: 1.2 }}>
                     TOTALE<br/>{analyticsPeriod === 'yearly' ? 'ANNUALE' : 'MENSILIZZATO'}
                   </p>
                   <p style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '0.1rem' }}>€{currentTotalAmount.toFixed(0)}</p>
                 </div>
              </div>
            </div>

            {/* Lista Breakdown con Barre Visive Ripristinate */}
            <div className="glass-panel" style={{ marginBottom: '1.25rem', padding: '1.25rem' }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
                Breakdown Categorie ({analyticsPeriod === 'yearly' ? 'Annuale' : 'Mensilizzato'})
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
                    
                    {/* ACCORDION TRIGGER */}
                    <div onClick={() => setExpandedCat(expandedCat === cat.value ? null : cat.value)} 
                         style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', cursor: 'pointer', padding: '0.35rem 0', borderRadius: 'var(--radius-xs)', transition: 'all 0.2s', ...(expandedCat === cat.value ? { background: 'var(--bg-input)', padding: '0.35rem' } : {}) }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                         <span style={{ fontSize: '1.1rem' }}>{cat.icon}</span>
                         <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                           {cat.label}
                         </span>
                         {/* Pallino Colorato Legenda */}
                         <span style={{ color: cat.color, fontSize: '0.7rem', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>●</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>€{catTotal.toFixed(2)}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, width: '32px', textAlign: 'right' }}>{perc.toFixed(0)}%</span>
                        {/* Chevron Esplandi */}
                        <ChevronDown size={14} style={{ color: 'var(--text-muted)', transform: expandedCat === cat.value ? 'rotate(180deg)' : 'none', transition: '0.3s' }} />
                      </div>
                    </div>
                    
                    {/* LISTA ACCORDION ESPLOSA DEI SERVIZI INTERNI */}
                    {expandedCat === cat.value && catSubs.length > 0 && (
                       <div style={{ padding: '0.5rem 0.5rem 0.5rem 1rem', borderLeft: `2.5px solid ${cat.color}80`, marginLeft: '0.5rem', animation: 'fadeIn 0.2s ease', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                         {catSubs.sort((a,b) => toMonthly(b.price, b.cycle) - toMonthly(a.price, a.cycle)).map(sub => {
                            const subAmount = analyticsPeriod === 'yearly' ? toMonthly(sub.price, sub.cycle) * 12 : toMonthly(sub.price, sub.cycle);
                            return (
                              <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                 <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{sub.name}</span>
                                 <span style={{ fontSize: '0.85rem', color: cat.color, fontWeight: 700 }}>€{subAmount.toFixed(2)}</span>
                              </div>
                            );
                         })}
                       </div>
                    )}

                    {/* Barra grafica visibile per forza d'impatto */}
                    <div className="chart-bar-track" style={{ width: '100%', height: '6px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div className="chart-bar-fill" style={{ width: `${perc}%`, background: cat.color, height: '100%', borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })}
              {currentTotalAmount === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nessun dato.</p>}
            </div>

            {/* L'Ultima Schermata - Top 5 Servizi (Ripristinata!) */}
            <div className="glass-panel">
              <p style={{ fontWeight: 800, marginBottom: '1rem', fontSize: '1rem' }}>Top 5 Servizi</p>
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
              {subs.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nessun abbonamento.</p>}
            </div>
          </div>
        )}

        {/* ══ SETTINGS TAB ══ */}
        {/* ══ SETTINGS TAB ══ */}
        {tab === 'settings' && (
          <div>
            <h3 style={{ marginBottom: '1.25rem', fontSize: '1.3rem', fontWeight: 800 }}>Impostazioni</h3>
            <p className="settings-section-title">Account</p>
            <div className="settings-row"><span className="settings-row-label">Email</span><span className="settings-row-value">{user.email}</span></div>
            <div className="settings-row"><span className="settings-row-label">Piano</span><span className="settings-row-value" style={{ color: isPro ? 'var(--accent)' : undefined }}>{isDemo ? 'Demo (Pro)' : isPro ? '★ Premium' : 'Free'}</span></div>
            
            {isPro && (
              <>
                <p className="settings-section-title" style={{ marginTop: '1.5rem' }}>Notifiche Email</p>
                <div className="settings-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="settings-row-label">Recap Mensile</span>
                    <span className="settings-row-value" style={{ fontSize: '0.75rem', marginTop: '2px' }}>Ricevi previsioni spese ogni 1° del mese</span>
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

            <button onClick={logout} className="btn btn-danger" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2.5rem' }}>
              <LogOut size={16} style={{ marginRight: '6px' }} /> Esci dall'account
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
              <h3>{modal.addCat ? 'Nuova Categoria' : modal.sub ? 'Modifica Servizio' : 'Nuovo Abbonamento'}</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {modal.sub && !modal.addCat && (
                  <button type="button" className="btn-icon" onClick={handleDelete} title="Elimina" style={{ color: 'var(--danger)', background: 'var(--danger-light)' }}>
                    <Trash2 size={18} />
                  </button>
                )}
                <button className="btn-close btn-icon" onClick={closeModal}><X size={20} /></button>
              </div>
            </div>

            {modal.addCat ? (
              <form onSubmit={handleAddCat}>
                <div className="input-group"><label>NOME</label><input name="cat_name" required placeholder="es. Palestra" autoFocus /></div>
                <div className="input-group">
                  <label>EMOJI</label>
                  {/* Grid Selector di 20 Emoji al posto del campo testo libero! */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginTop: '0.4rem' }}>
                    {EMOJIS.map(e => (
                      <div key={e} onClick={() => setModal(m => ({...m, catIcon: e}))} 
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
                  <button type="button" className="btn btn-outline" onClick={() => setModal(m => ({ ...m, addCat: false }))}>Annulla</button>
                  <button type="submit" className="btn btn-primary">Salva</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSave}>
                <div className="input-group"><label>NOME SERVIZIO</label><input name="name" defaultValue={modal.sub?.name} required placeholder="es. Netflix" /></div>
                <div className="input-row">
                  <div className="input-group"><label>PREZZO (€)</label><input name="price" type="number" step="0.01" min="0" defaultValue={modal.sub?.price} required /></div>
                  <div className="input-group"><label>CICLO</label><select name="cycle" defaultValue={modal.sub?.cycle || 'monthly'}>{CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                </div>
                <div className="input-group">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    CATEGORIA 
                    {isPro ? (
                      <button type="button" onClick={() => setModal(m => ({ ...m, addCat: true }))} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>+ AGGIUNGI</button>
                    ) : (
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                        (Solo Pro)
                        <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '4px', marginLeft: '6px' }}>★ PRO</span>
                      </span>
                    )}
                  </label>
                  <select name="category" defaultValue={modal.sub?.category || 'entertainment'} className="custom-select">{allCats.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}</select>
                </div>
                <div className="input-group">
                  <label>DATA PROSSIMO RINNOVO</label><input name="next_renewal" type="date" defaultValue={modal.sub?.next_renewal || new Date().toISOString().split('T')[0]} required />
                </div>

                {/* ══ GESTIONE ABBONAMENTO CONDIVISO: LOGICA PRO COMPATTA ══ */}
                <div className="shared-section-wrapper" style={{ 
                    background: isPro && modal.isShared ? 'var(--bg-input)' : 'transparent', 
                    borderRadius: 'var(--radius-sm)', padding: isPro && modal.isShared ? '1.25rem' : '0.5rem 0', 
                    margin: '1.25rem 0', border: isPro && modal.isShared ? '1px solid var(--border)' : 'none', borderTop: !modal.isShared ? '1px solid var(--border-soft)' : '',
                  }}>
                  
                  {isPro ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: modal.isShared ? 'var(--accent)' : 'var(--text-primary)', textTransform: 'none', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          👥 Abbonamento Condiviso
                        </label>
                        <label className="switch">
                          <input type="checkbox" name="is_shared" checked={modal.isShared} onChange={e => setModal(m => ({...m, isShared: e.target.checked}))} />
                          <span className="slider" />
                        </label>
                      </div>

                      {modal.isShared && (
                        <div style={{ marginTop: '1rem', animation: 'fadeUp 0.3s ease' }}>
                          <button type="button" onClick={() => setModal(m => ({...m, showAdvanced: !m.showAdvanced}))}
                            style={{ width: '100%', background: '#fff', border: '1px solid var(--border)', padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-xs)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', boxShadow: 'var(--shadow-xs)' }}>
                            <div style={{display:'flex', alignItems:'center', gap: '0.4rem'}}>⚙️ Opzioni Avanzate</div>
                            <ChevronDown size={16} style={{ transform: modal.showAdvanced ? 'rotate(180deg)' : 'none', transition: '0.3s' }}/>
                          </button>

                          {/* EXACT MATCH TO SCREENSHOT 2 */}
                          {modal.showAdvanced && (
                             <div className="shared-details-grid" style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.2s ease', padding: '1.25rem', background: '#ffffff', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-soft)' }}>
                              <div className="input-row">
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                  <label>NOME ALTRA PERSONA</label>
                                  <input name="shared_name" placeholder="es. Marco" defaultValue={modal.sub?.shared_name} />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                  <label>EMAIL</label>
                                  <input type="email" name="shared_email" placeholder="marco@email.it" defaultValue={modal.sub?.shared_email} />
                                </div>
                              </div>

                              <div className="input-group" style={{ marginBottom: 0 }}>
                                <label style={{ color: 'var(--accent)' }}>SITUAZIONE PAGAMENTO</label>
                                <select name="shared_payment_status" defaultValue={modal.sub?.shared_payment_status || 'devo'} style={{ background: '#fff' }}>
                                  <option value="devo">L'ha pagato l'altro (Devo soldi!)</option>
                                  <option value="mi_deve">L'ho pagato io (Mi devono soldi!)</option>
                                </select>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16,185,129,0.05)', padding: '0.75rem 0.85rem', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(16,185,129,0.25)' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--success)', margin: 0 }}>
                                  ✅ HA GIÀ PAGATO LA SUA PARTE?
                                </label>
                                <label className="switch">
                                  <input type="checkbox" name="shared_has_paid" defaultChecked={modal.sub?.shared_has_paid} />
                                  <span className="slider" />
                                </label>
                              </div>

                              <div className="input-group" style={{ marginBottom: 0 }}>
                                <label>VUOI MANDARE IL PROMEMORIA EMAIL?</label>
                                <select name="shared_reminder_cycle" defaultValue={modal.sub?.shared_reminder_cycle || ''} style={{ background: '#fff' }}>
                                  <option value="">Non inviare Promemoria</option>
                                  <option value="monthly">Ogni Mese</option>
                                  <option value="bimonthly">Ogni Bimestre</option>
                                  <option value="quarterly">Ogni Trimestre</option>
                                  <option value="quadrimestral">Ogni Quadrimestre</option>
                                  <option value="semiannual">Ogni Semestre</option>
                                  <option value="yearly">Ogni Anno</option>
                                </select>
                                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.3 }}>
                                  Se selezionato, un'email automatica partirà verso l'altra persona 1 settimana prima del ciclo scelto.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.5, cursor: 'not-allowed' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'none', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'not-allowed' }}>
                        👥 Abbonamento Condiviso
                        <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', fontSize: '0.55rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '4px', marginLeft: '2px' }}>★ PRO</span>
                      </label>
                      <label className="switch" style={{ pointerEvents: 'none' }}><input type="checkbox" disabled /><span className="slider" /></label>
                    </div>
                  )}
                </div>

                <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
                  <button type="submit" className="btn btn-primary">{modal.sub ? 'Salva modifiche' : 'Aggiungi abbonamento'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <nav className="tab-bar">
        <button className={`tab-item ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}><LayoutDashboard size={20} /><span>Home</span></button>
        <button className={`tab-item ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}><TrendingUp size={20} /><span>Analytics</span></button>
        <button className={`tab-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}><Settings size={20} /><span>Impostazioni</span></button>
      </nav>
    </div>
  );
}
