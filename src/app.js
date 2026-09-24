const tg = window.Telegram?.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) {
      if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor('#080a0f');
      if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor('#080a0f');
    }
  } catch (e) {}
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showPwaInstallBanner();
});

let state = {
  activeTab: (window.location.pathname === '/docs' || window.location.hash === '#docs') ? 'docs' : 'grid',
  stats: { total_live: 0, http_live: 0, socks_live: 0, clean_live: 0, total_countries: 0, total_cities: 0, total_sources: 0, countries: {}, anonymity: {}, tiers: {} },
  system: {
    state: 'IDLE',
    current_task: 'Connecting to infrastructure...',
    progress_total: 0,
    progress_tested: 0,
    last_harvest_time: null,
    next_harvest_time: null,
    harvest_interval_mins: 60
  },
  allProxies: [],
  selectedCountry: 'ALL',
  selectedCity: 'ALL',
  selectedType: 'all',
  selectedTier: 'ALL',
  searchQuery: '',
  proxyLimit: 0,
  isCountryMenuOpen: false,
  initialized: false,
  urlTest: {
    targetURL: '',
    isRunning: false,
    results: {},
    filterPassedOnly: false,
    testedCount: 0,
    passedCount: 0
  }
};

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "-9999px";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) resolve();
      else reject(new Error('Copy command failed'));
    } catch (err) {
      document.body.removeChild(textArea);
      reject(err);
    }
  });
}

function getFlagImgHTML(countryCode, extraClass = "w-4 h-3") {
  if (!countryCode || countryCode === 'UNKNOWN' || countryCode === 'ALL') {
    return `<span class="${extraClass} rounded-sm bg-navy-800 border border-line inline-flex items-center justify-center text-[9px] text-steel-400 font-bold shrink-0"><i class="fa-solid fa-globe text-[9px]"></i></span>`;
  }
  const code = countryCode.toLowerCase();
  return `<img src="https://flagcdn.com/w40/${code}.png" srcset="https://flagcdn.com/w80/${code}.png 2x" class="${extraClass} object-cover rounded-sm border border-line/80 shadow-sm shrink-0" alt="${countryCode}" loading="lazy" onerror="this.outerHTML='<span class=\\'${extraClass} rounded-sm bg-navy-800 text-[8px] font-bold inline-flex items-center justify-center text-steel-400 border border-line\\'>${countryCode}</span>'">`;
}

function getTierStyle(tier) {
  switch (tier) {
    case 'Diamond':
      return { label: 'DIAMOND', class: 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/50 shadow-sm shadow-cyan-900/40', icon: '<i class="fa-solid fa-gem text-cyan-300 mr-1"></i>' };
    case 'Gold':
      return { label: 'GOLD', class: 'bg-brass-500/15 text-brass-400 border border-brass-400/50 shadow-sm shadow-brass-900/40', icon: '<i class="fa-solid fa-medal text-brass-400 mr-1"></i>' };
    case 'Silver':
      return { label: 'SILVER', class: 'bg-navy-800 text-steel-200 border border-steel-500/40', icon: '<i class="fa-solid fa-award text-steel-300 mr-1"></i>' };
    case 'Bronze':
      return { label: 'BRONZE', class: 'bg-amber-950/40 text-amber-500 border border-amber-600/30', icon: '<i class="fa-solid fa-shield text-amber-500 mr-1"></i>' };
    default:
      return { label: 'IRON', class: 'bg-navy-900 text-steel-500 border border-line', icon: '<i class="fa-solid fa-gear text-steel-500 mr-1"></i>' };
  }
}

function getAnonymityStyle(anon) {
  switch (anon) {
    case 'Elite':
      return { label: 'ELITE', class: 'bg-mint-500/15 text-mint-400 border border-mint-500/30' };
    case 'Transparent':
      return { label: 'TRANS', class: 'bg-rose-500/15 text-rose-400 border border-rose-500/30' };
    default:
      return { label: 'ANON', class: 'bg-steel-500/15 text-steel-300 border border-steel-500/30' };
  }
}

function getNextUpdateFormatted(dateStr, isRunning) {
  if (isRunning) return 'Syncing Now';
  if (!dateStr || dateStr.startsWith('0001')) return '60 Min';
  const diffMs = new Date(dateStr) - new Date();
  if (diffMs <= 0) return 'Syncing Now';
  const diffMin = Math.ceil(diffMs / 60000);
  return `${diffMin} Min`;
}

function getLastUpdateFormatted(dateStr) {
  if (!dateStr || dateStr.startsWith('0001')) return 'Just now';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMins = Math.floor((now - date) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getProtocolCounts() {
  let countAll = 0, countHttp = 0, countSocks5 = 0, countSocks4 = 0;
  state.allProxies.forEach(p => {
    if (state.selectedCountry !== 'ALL' && (p.country || '').toUpperCase() !== state.selectedCountry.toUpperCase()) return;
    if (state.selectedCity !== 'ALL' && (p.city || '').toLowerCase() !== state.selectedCity.toLowerCase()) return;
    if (state.selectedTier !== 'ALL' && (p.tier || '').toLowerCase() !== state.selectedTier.toLowerCase()) return;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const match = (p.address && p.address.toLowerCase().includes(q)) ||
                    (p.country && p.country.toLowerCase().includes(q)) ||
                    (p.city && p.city.toLowerCase().includes(q)) ||
                    (p.tier && p.tier.toLowerCase().includes(q)) ||
                    (p.anonymity && p.anonymity.toLowerCase().includes(q));
      if (!match) return;
    }
    countAll++;
    const proto = (p.protocol || '').toLowerCase();
    if (proto === 'http') countHttp++;
    if (proto === 'socks5') countSocks5++;
    if (proto === 'socks4') countSocks4++;
  });

  if (countAll === 0 && state.allProxies.length === 0) {
    return {
      countAll: state.stats.total_live || 0,
      countHttp: state.stats.http_live || 0,
      countSocks5: state.stats.socks5_live || 0,
      countSocks4: state.stats.socks4_live || 0
    };
  }
  return { countAll, countHttp, countSocks5, countSocks4 };
}

function getFilteredProxies() {
  const list = state.allProxies.filter(p => {
    if (state.selectedType !== 'all' && (p.protocol || '').toLowerCase() !== state.selectedType.toLowerCase()) return false;
    if (state.selectedCountry !== 'ALL' && (p.country || '').toUpperCase() !== state.selectedCountry.toUpperCase()) return false;
    if (state.selectedCity !== 'ALL' && (p.city || '').toLowerCase() !== state.selectedCity.toLowerCase()) return false;
    if (state.selectedTier !== 'ALL' && (p.tier || '').toLowerCase() !== state.selectedTier.toLowerCase()) return false;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const match = (p.address && p.address.toLowerCase().includes(q)) ||
                    (p.country && p.country.toLowerCase().includes(q)) ||
                    (p.city && p.city.toLowerCase().includes(q)) ||
                    (p.tier && p.tier.toLowerCase().includes(q)) ||
                    (p.anonymity && p.anonymity.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (state.urlTest.filterPassedOnly) {
      const res = state.urlTest.results[p.address];
      if (!res || !res.passed) return false;
    }
    return true;
  });

  if (state.proxyLimit > 0 && list.length > state.proxyLimit) {
    return list.slice(0, state.proxyLimit);
  }
  return list;
}

function showPwaInstallBanner() {
  if (document.getElementById('pwa-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.className = 'fixed top-3 inset-x-4 max-w-md mx-auto bg-gradient-to-r from-emerald-950 to-zinc-900 border border-emerald-500/40 p-3 rounded-2xl shadow-2xl flex items-center justify-between z-50 animate-bounce';
  banner.innerHTML = `
    <div class="flex items-center gap-2.5">
      <img src="/icon.svg" class="w-8 h-8 rounded-xl bg-zinc-900 p-1 border border-emerald-500/30">
      <div>
        <div class="text-xs font-bold text-white">Install Web App</div>
        <div class="text-[10px] text-zinc-400">Add to Home Screen for fast mobile access</div>
      </div>
    </div>
    <button id="btn-pwa-install" class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl active:scale-95 transition flex items-center gap-1">
      <i class="fa-solid fa-download"></i> Install
    </button>
  `;
  document.body.appendChild(banner);

  document.getElementById('btn-pwa-install')?.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') banner.remove();
      deferredPrompt = null;
    }
  });
}

function renderInitialSkeleton() {
  const root = document.getElementById('app');
  if (!root) return;

  const origin = window.location.origin;

  const style = document.createElement('style');
  style.innerHTML = `
    .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: #0e1118; border-radius: 8px; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #232a39; border-radius: 8px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #2f394c; }
  `;
  document.head.appendChild(style);

  root.innerHTML = `
    <!-- Header -->
    <header class="flex flex-col gap-3 border-b border-line pb-3 mb-3">
      <div class="flex items-center justify-between">
        <a href="https://NyxAgent.dev" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 group cursor-pointer" title="NyxAgent.dev • Developer Studio">
          <div class="relative flex items-center justify-center w-9 h-9 rounded-xl bg-navy-800/90 border border-line-2 text-mint-400 shadow-[0_2px_10px_rgba(0,0,0,0.3)] shrink-0 group-hover:border-mint-400/80 group-hover:bg-mint-500/10 group-hover:shadow-[0_0_20px_rgba(0,245,155,0.25)] group-hover:scale-105 transition-all duration-300 ease-out">
            <span class="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-mint-400 opacity-60"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-mint-500 ring-2 ring-navy-900"></span>
            </span>
            <i class="fa-solid fa-network-wired text-sm group-hover:scale-110 transition-transform duration-300 ease-out"></i>
          </div>
          <div class="flex flex-col">
            <div class="flex items-center gap-1.5">
              <h1 class="text-sm font-bold tracking-tight text-white uppercase tracking-wider group-hover:text-mint-400 transition-colors duration-200">NyxProxy Tools</h1>
              <i class="fa-solid fa-arrow-up-right-from-square text-[9px] text-steel-500 opacity-0 group-hover:opacity-100 group-hover:text-mint-400 -translate-x-1 group-hover:translate-x-0 transition-all duration-200"></i>
            </div>
            <p class="text-[11px] text-steel-400 mt-0.5 group-hover:text-steel-300 transition-colors duration-200">Auto Proxy Scraper and RealTime Health Checker</p>
          </div>
        </a>
        <a href="https://github.com/Erfan-Fazeli" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 bg-navy-800/80 hover:bg-navy-700 border border-line hover:border-line-2 px-2.5 py-1.5 rounded-xl text-xs text-steel-400 hover:text-white transition shadow-sm active:scale-95 group" title="GitHub - Erfan Fazeli">
          <i class="fa-brands fa-github text-sm group-hover:scale-110 transition-transform"></i>
          <span class="text-[11px] font-mono font-medium">GitHub</span>
        </a>
      </div>

      <nav class="grid grid-cols-2 bg-navy-900/90 border border-line p-1 rounded-2xl gap-1 shadow-lg">
        <button id="tab-grid" class="py-2 text-xs font-bold rounded-xl uppercase tracking-wider transition flex items-center justify-center gap-1.5 ${state.activeTab === 'grid' ? 'bg-navy-800 text-white shadow-md border border-line-2' : 'text-steel-400 hover:text-zinc-200'}">
          <i class="fa-solid fa-list-check text-mint-400"></i> Alive Proxy List
        </button>
        <button id="tab-docs" class="py-2 text-xs font-bold rounded-xl uppercase tracking-wider transition flex items-center justify-center gap-1.5 ${state.activeTab === 'docs' ? 'bg-navy-800 text-white shadow-md border border-line-2' : 'text-steel-400 hover:text-zinc-200'}">
          <i class="fa-solid fa-book-bookmark text-cyan-400"></i> Api Document
        </button>
      </nav>
    </header>

    <!-- Main Grid View: Using flex-col and gap-3 for perfect consistent spacing -->
    <main id="view-grid" class="${state.activeTab === 'grid' ? '' : 'hidden'} flex flex-col gap-3">
      
      <!-- 1. Live Status & Telemetry Card -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line rounded-2xl p-3.5 shadow-xl">
        <div class="flex items-center justify-between mb-3 border-b border-line pb-2">
          <div class="flex items-center gap-2">
            <span class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
            </span>
            <h2 class="text-xs font-bold uppercase tracking-wider text-white">Live Status</h2>
          </div>
          <!-- Last Update -->
          <span class="text-[10px] text-steel-400 mono font-medium flex items-center gap-1.5">
            Last Update ProxyList: <span id="txt-last-harvest" class="text-mint-400 font-bold">Just now</span>
          </span>
        </div>

        <div class="flex flex-col gap-2">
          <div class="grid grid-cols-4 text-center">
            <div class="border-r border-line">
              <span class="text-[8.5px] sm:text-[9.5px] text-steel-400 block font-medium uppercase tracking-wider truncate"><i class="fa-solid fa-server mr-0.5 text-steel-500"></i> Alive Proxy</span>
              <span id="stat-total" class="text-sm font-extrabold text-mint-400 mono">0</span>
            </div>
            <div class="border-r border-line">
              <span class="text-[8.5px] sm:text-[9.5px] text-cyan-400 block font-medium uppercase tracking-wider truncate"><i class="fa-solid fa-cloud-arrow-down mr-0.5 text-cyan-400"></i> Source</span>
              <span id="stat-sources" class="text-sm font-extrabold text-cyan-300 mono">0</span>
            </div>
            <div class="border-r border-line">
              <span class="text-[8.5px] sm:text-[9.5px] text-steel-400 block font-medium uppercase tracking-wider truncate"><i class="fa-solid fa-globe mr-0.5 text-steel-400"></i> Country</span>
              <span id="stat-countries-count" class="text-sm font-extrabold text-steel-200 mono">0</span>
            </div>
            <div>
              <span class="text-[8.5px] sm:text-[9.5px] text-purple-400 block font-medium uppercase tracking-wider truncate"><i class="fa-solid fa-city mr-0.5 text-purple-400"></i> City</span>
              <span id="stat-cities-count" class="text-sm font-extrabold text-purple-300 mono">0</span>
            </div>
          </div>

          <div class="grid grid-cols-4 text-center pt-2 border-t border-line/60">
            <div class="border-r border-line">
              <span class="text-[9.5px] text-cyan-300 block font-medium uppercase tracking-wider"><i class="fa-solid fa-gem mr-0.5 text-cyan-400"></i> DIAMOND</span>
              <span id="stat-diamond" class="text-sm font-extrabold text-cyan-300 mono">0</span>
            </div>
            <div class="border-r border-line">
              <span class="text-[9.5px] text-brass-400 block font-medium uppercase tracking-wider"><i class="fa-solid fa-medal mr-0.5 text-brass-400"></i> GOLD</span>
              <span id="stat-gold" class="text-sm font-extrabold text-brass-400 mono">0</span>
            </div>
            <div class="border-r border-line">
              <span class="text-[9.5px] text-steel-300 block font-medium uppercase tracking-wider"><i class="fa-solid fa-award mr-0.5 text-steel-400"></i> SILVER</span>
              <span id="stat-silver" class="text-sm font-extrabold text-steel-200 mono">0</span>
            </div>
            <div>
              <span class="text-[9.5px] text-mint-400 block font-medium uppercase tracking-wider"><i class="fa-solid fa-shield-halved mr-0.5 text-mint-400"></i> CLEAN</span>
              <span id="stat-clean" class="text-sm font-extrabold text-mint-400 mono">0</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Filters Row (3 Columns) -->
      <div class="grid grid-cols-3 gap-2">
        <div class="relative min-w-0">
          <label class="block text-[9px] font-bold text-steel-400 uppercase tracking-wider mb-1 truncate flex items-center gap-1">
            <i class="fa-solid fa-earth-americas text-steel-500 text-[9px]"></i> Country
          </label>
          <button id="btn-country-dropdown" type="button" class="w-full bg-navy-800/90 border border-line hover:border-line-2 text-zinc-200 text-xs rounded-xl px-2 py-2 flex items-center justify-between focus:outline-none truncate transition shadow-sm">
            <span id="country-selected-display" class="flex items-center gap-1.5 truncate">
              ${getFlagImgHTML(state.selectedCountry)}
              <span class="font-medium truncate text-[11px]">${state.selectedCountry === 'ALL' ? 'All' : state.selectedCountry}</span>
            </span>
            <i class="fa-solid fa-chevron-down text-steel-500 text-[10px] shrink-0 ml-0.5"></i>
          </button>
          <div id="country-dropdown-menu" class="hidden absolute top-[calc(100%+4px)] left-0 w-[240px] z-[9999] bg-navy-900 border border-line-2 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] max-h-60 overflow-y-auto p-1 custom-scrollbar"></div>
        </div>

        <div class="min-w-0">
          <label class="block text-[9px] font-bold text-steel-400 uppercase tracking-wider mb-1 truncate flex items-center gap-1">
            <i class="fa-solid fa-city text-steel-500 text-[9px]"></i> City
          </label>
          <div class="relative">
            <select id="city-select" class="w-full bg-navy-800/90 border border-line hover:border-line-2 text-zinc-200 text-[11px] rounded-xl px-2 py-2 appearance-none focus:outline-none truncate pr-6 font-medium custom-scrollbar transition shadow-sm">
              <option value="ALL">All</option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-steel-500">
              <i class="fa-solid fa-chevron-down text-[10px]"></i>
            </div>
          </div>
        </div>

        <div class="min-w-0">
          <label class="block text-[9px] font-bold text-steel-400 uppercase tracking-wider mb-1 truncate flex items-center gap-1">
            <i class="fa-solid fa-ranking-star text-steel-500 text-[9px]"></i> Tier
          </label>
          <div class="relative">
            <select id="tier-select" class="w-full bg-navy-800/90 border border-line hover:border-line-2 text-zinc-200 text-[11px] rounded-xl px-2 py-2 appearance-none focus:outline-none truncate pr-6 font-medium transition shadow-sm">
              <option value="ALL">All Tiers</option>
              <option value="Diamond">Diamond</option>
              <option value="Gold">Gold</option>
              <option value="Silver">Silver</option>
              <option value="Bronze">Bronze</option>
              <option value="Iron">Iron</option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-steel-500">
              <i class="fa-solid fa-chevron-down text-[10px]"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Custom Target URL Probe -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line rounded-2xl p-3.5 shadow-xl flex flex-col gap-2.5">
        <div class="flex items-center justify-between border-b border-line pb-2">
          <div class="flex items-center gap-2">
            <span class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-mint-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-mint-500"></span>
            </span>
            <h2 class="text-xs font-bold uppercase tracking-wider text-white">Custom URL Checker</h2>
          </div>
          <div class="flex items-center gap-1.5 text-[10px] text-steel-400 font-mono tracking-wide">
            <span></span>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <div class="relative flex-1 min-w-0">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-steel-500">
              <i class="fa-solid fa-globe text-[11px]"></i>
            </div>
            <input 
              id="target-url-input" 
              type="text" 
              placeholder="https://example.com or http://..." 
              class="w-full h-9 bg-well border border-line text-zinc-100 placeholder-steel-500 text-[11px] rounded-xl pl-7 pr-2 focus:outline-none focus:border-mint-400/80 mono transition shadow-inner truncate"
            />
          </div>
          <!-- Proxy Count Limit Input (0 = Infinite / All) -->
          <div class="h-9 flex items-center bg-well border border-line rounded-xl px-2.5 focus-within:border-mint-400/80 transition shadow-inner shrink-0" title="Proxy Limit (0 = All)">
            <label for="target-limit-input" class="text-[11px] text-steel-400 font-mono font-medium select-none flex items-center gap-1 cursor-pointer">
              <i class="fa-solid fa-list-ol text-[10px] text-steel-500"></i>
              <span>Limit:</span>
            </label>
            <input 
              id="target-limit-input" 
              type="number" 
              min="0" 
              value="0" 
              placeholder="0" 
              class="w-10 bg-transparent text-zinc-100 font-mono text-[11px] font-bold text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ml-1"
            />
          </div>
          <button id="btn-test-url" type="button" class="h-9 bg-mint-500 hover:bg-mint-400 text-navy-900 font-bold px-3.5 rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition shadow-[0_0_15px_rgba(0,245,155,0.25)] shrink-0">
            <i class="fa-solid fa-play text-[9px]"></i>
            <span id="txt-btn-test">Test URL</span>
          </button>
          <button id="btn-clear-url-test" type="button" class="hidden h-9 bg-navy-800 hover:bg-navy-700 text-steel-400 hover:text-white border border-line px-2.5 rounded-xl text-xs active:scale-95 transition shrink-0" title="Clear test filter">
            <i class="fa-solid fa-xmark text-xs"></i>
          </button>
        </div>

        <!-- Live Progress Bar -->
        <div id="target-progress-box" class="hidden flex flex-col gap-1.5 px-2 py-1.5 bg-well/90 border border-line rounded-xl">
          <div class="flex items-center justify-between text-[10px] mono">
            <span class="text-steel-400 flex items-center gap-1.5">
              <i class="fa-solid fa-circle-notch fa-spin text-[9px] text-mint-400"></i>
              <span id="target-progress-label">Probing live targets...</span>
            </span>
            <span id="target-progress-counter" class="text-mint-300 font-bold">0 / 0</span>
          </div>
          <div class="w-full h-1.5 bg-navy-900 rounded-full overflow-hidden border border-line">
            <div id="target-progress-bar" class="h-full bg-gradient-to-r from-mint-500 via-teal-400 to-cyan-400 rounded-full transition-all duration-150" style="width: 0%;"></div>
          </div>
        </div>

        <div id="target-test-banner" class="hidden flex flex-col gap-2 p-2.5 rounded-xl bg-well border border-line shadow-md">
          <div id="target-test-msg" class="text-zinc-200 text-xs font-mono font-medium flex items-center justify-center gap-1.5 truncate"></div>
          
          <!-- Compact Sliding Segmented Pill (AlgoVault Dark & Mint Theme) -->
          <div class="relative flex items-center bg-navy-900 border border-line p-0.5 rounded-xl max-w-[290px] w-full mx-auto shadow-inner select-none h-7 overflow-hidden">
            <div id="segment-slider" class="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-lg bg-navy-800 border border-line-2 shadow-md transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] translate-x-0 pointer-events-none"></div>

            <button id="btn-filter-passed" type="button" class="relative z-10 flex-1 h-full px-1.5 text-[9px] font-mono tracking-tight font-bold rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-white active:scale-95 cursor-pointer whitespace-nowrap">
              <i id="icon-filter-passed" class="fa-solid fa-circle-check text-[9px] shrink-0 text-mint-400"></i>
              <span>Url Passed Only</span>
              <span id="badge-filter-passed" class="text-[8px] px-1 py-0.5 rounded bg-mint-500/20 text-mint-400 border border-mint-500/30 font-mono font-bold leading-none shrink-0 transition-colors duration-200">0</span>
            </button>

            <button id="btn-filter-all" type="button" class="relative z-10 flex-1 h-full px-1.5 text-[9px] font-mono tracking-tight font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-steel-400 hover:text-zinc-200 active:scale-95 cursor-pointer whitespace-nowrap">
              <i id="icon-filter-all" class="fa-solid fa-layer-group text-[9px] shrink-0 text-steel-500"></i>
              <span>All Alive Proxy</span>
              <span id="badge-filter-all" class="text-[8px] px-1 py-0.5 rounded bg-navy-800 text-steel-400 font-mono font-medium leading-none shrink-0 transition-colors duration-200">0</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 4. Search Bar -->
      <div class="relative">
        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-steel-500">
          <i class="fa-solid fa-magnifying-glass text-xs"></i>
        </div>
        <input 
          id="search-input" 
          type="text" 
          placeholder="Search IP, city, country, tier or port..." 
          class="w-full bg-navy-800/80 border border-line text-zinc-100 placeholder-steel-500 text-xs rounded-xl pl-8 pr-3 py-2.5 focus:outline-none focus:border-line-2 mono transition shadow-inner"
        />
      </div>

      <!-- 5. Protocol Switcher -->
      <div class="grid grid-cols-4 bg-navy-900/90 border border-line p-1 rounded-2xl gap-1 shadow-sm">
        <button id="btn-proto-all" data-type="all" class="btn-type py-2 text-[10px] font-bold rounded-xl uppercase tracking-wider transition bg-navy-800 text-white shadow-md border border-line-2 flex justify-center items-center gap-0.5">
          ALL <span class="opacity-70 font-mono font-normal text-[8.5px]">(0)</span>
        </button>
        <button id="btn-proto-http" data-type="http" class="btn-type py-2 text-[10px] font-bold rounded-xl uppercase tracking-wider transition text-steel-400 hover:text-zinc-200 flex justify-center items-center gap-0.5">
          HTTP <span class="opacity-70 font-mono font-normal text-[8.5px]">(0)</span>
        </button>
        <button id="btn-proto-socks5" data-type="socks5" class="btn-type py-2 text-[10px] font-bold rounded-xl uppercase tracking-wider transition text-steel-400 hover:text-zinc-200 flex justify-center items-center gap-0.5">
          SOCKS5 <span class="opacity-70 font-mono font-normal text-[8.5px]">(0)</span>
        </button>
        <button id="btn-proto-socks4" data-type="socks4" class="btn-type py-2 text-[10px] font-bold rounded-xl uppercase tracking-wider transition text-steel-400 hover:text-zinc-200 flex justify-center items-center gap-0.5">
          SOCKS4 <span class="opacity-70 font-mono font-normal text-[8.5px]">(0)</span>
        </button>
      </div>

      <!-- 6. Scrollable Proxy List -->
      <div class="max-h-[46vh] overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2" id="proxy-list"></div>

      <!-- 7. Action Buttons -->
      <div class="grid grid-cols-2 gap-2 pt-2 border-t border-line">
        <button id="btn-copy-all" class="bg-navy-800 hover:bg-navy-700 text-zinc-100 hover:text-white border border-line hover:border-line-2 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 active:scale-95 transition shadow-sm truncate">
          <i class="fa-regular fa-copy text-xs text-steel-400"></i>
          <span class="truncate">Copy All</span>
        </button>

        <button id="btn-download" class="bg-mint-500/10 hover:bg-mint-500/20 text-mint-400 hover:text-mint-300 border border-mint-500/30 hover:border-mint-500/50 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 active:scale-95 transition shadow-[0_0_15px_rgba(0,245,155,0.1)] truncate">
          <i class="fa-solid fa-arrow-down-to-bracket text-xs text-mint-400"></i>
          <span class="truncate">Download TXT</span>
        </button>
      </div>
    </main>

    <!-- Docs View (Comprehensive Enterprise REST API Specification) -->
    <main id="view-docs" class="${state.activeTab === 'docs' ? '' : 'hidden'} flex flex-col gap-3">
      
      <!-- API Header / Overview Card -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line p-3.5 rounded-2xl shadow-xl flex flex-col gap-2.5">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">REST API v1.0</span>
            <span class="text-[9.5px] text-mint-400 font-mono flex items-center gap-1"><i class="fa-solid fa-circle-check text-[9px]"></i> Public & CORS Enabled</span>
          </div>
          <span class="text-[9.5px] text-steel-400 font-mono">No API Key Required</span>
        </div>
        <p class="text-[11px] text-zinc-300 leading-relaxed">
          High-performance global proxy infrastructure API. Connect your scraping agents, bots, data extractors, and automated pipelines directly to our real-time validated pool.
        </p>
        <div class="bg-well border border-line rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs mono">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-steel-400 text-[10.5px] shrink-0 font-bold">BASE URL:</span>
            <span class="text-cyan-300 font-bold select-all truncate text-[11px]">${origin}</span>
          </div>
          <button class="btn-copy-code px-2.5 py-1 bg-navy-800 hover:bg-navy-700 text-steel-300 hover:text-white border border-line rounded text-[10px] active:scale-95 transition shrink-0" data-code="${origin}">Copy</button>
        </div>
      </div>

      <!-- Quality Tiers & Security Classification -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <i class="fa-solid fa-shield-halved text-cyan-400 text-[10px]"></i> Quality Tiers & Security Specification
          </h3>
          <span class="text-[9px] text-steel-400 font-mono">L1 / L2 / L3 Verification</span>
        </div>
        <p class="text-[10.5px] text-steel-400 leading-relaxed">
          Every proxy is scored through active multi-layer anonymity headers inspection and real-time blacklists validation:
        </p>

        <div class="grid grid-cols-2 gap-2 pt-1">
          <div class="col-span-2 p-2.5 rounded-xl bg-well/90 border border-cyan-500/40 shadow-sm shadow-cyan-950/50">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5"><i class="fa-solid fa-gem text-[10px]"></i> Diamond</span>
              <span class="text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 uppercase tracking-wider">Top Tier</span>
            </div>
            <p class="text-[10px] text-zinc-300 mono leading-relaxed">Elite L1 Anonymity • 0 Blacklists • Verified Ping &lt; 800ms</p>
          </div>

          <div class="p-2 rounded-xl bg-well/90 border border-brass-400/30 flex flex-col justify-between">
            <div class="text-[10.5px] font-bold text-brass-400 mb-0.5 flex items-center gap-1"><i class="fa-solid fa-medal text-[9.5px]"></i> Gold</div>
            <p class="text-[9.5px] text-steel-400 mono leading-relaxed">Elite L1 Anonymity • 0 Blacklists • Regular Latency</p>
          </div>

          <div class="p-2 rounded-xl bg-well/90 border border-line flex flex-col justify-between">
            <div class="text-[10.5px] font-bold text-zinc-200 mb-0.5 flex items-center gap-1"><i class="fa-solid fa-award text-[9.5px]"></i> Silver</div>
            <p class="text-[9.5px] text-steel-400 mono leading-relaxed">Anonymous L2 • 0 Blacklists • Origin IP Concealed</p>
          </div>

          <div class="p-2 rounded-xl bg-well/90 border border-amber-600/30 flex flex-col justify-between">
            <div class="text-[10.5px] font-bold text-amber-500 mb-0.5 flex items-center gap-1"><i class="fa-solid fa-shield text-[9.5px]"></i> Bronze</div>
            <p class="text-[9.5px] text-steel-400 mono leading-relaxed">Anonymous L2 • 1-2 Minor Blacklist Reports</p>
          </div>

          <div class="p-2 rounded-xl bg-well/90 border border-line flex flex-col justify-between">
            <div class="text-[10.5px] font-bold text-steel-500 mb-0.5 flex items-center gap-1"><i class="fa-solid fa-gear text-[9.5px]"></i> Iron</div>
            <p class="text-[9.5px] text-steel-500 mono leading-relaxed">Transparent L3 (Leaks IP) or &ge; 3 Blacklists</p>
          </div>
        </div>
      </div>

      <!-- Universal Query Parameters Reference Table -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <i class="fa-solid fa-sliders text-mint-400 text-[10px]"></i> Universal Filter Parameters
          </h3>
          <span class="text-[9px] text-steel-400 font-mono">Query String (?key=value)</span>
        </div>
        <p class="text-[10.5px] text-steel-400">
          Supported across <code class="text-cyan-300">/api/v1/raw</code>, <code class="text-cyan-300">/api/v1/proxies</code>, and <code class="text-cyan-300">/api/v1/test</code>:
        </p>

        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-left border-collapse text-[10px] font-mono">
            <thead>
              <tr class="border-b border-line text-steel-400 uppercase text-[8.5px]">
                <th class="py-1.5 px-1 font-bold">Param</th>
                <th class="py-1.5 px-1 font-bold">Type</th>
                <th class="py-1.5 px-1 font-bold">Default</th>
                <th class="py-1.5 px-1 font-bold">Description & Values</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line/60 text-zinc-300">
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">country</td>
                <td class="py-1.5 px-1 text-steel-400">string</td>
                <td class="py-1.5 px-1 text-steel-500">ALL</td>
                <td class="py-1.5 px-1">2-Letter ISO Country Code (e.g. <span class="text-zinc-100">US, DE, FR, GB</span>)</td>
              </tr>
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">city</td>
                <td class="py-1.5 px-1 text-steel-400">string</td>
                <td class="py-1.5 px-1 text-steel-500">ALL</td>
                <td class="py-1.5 px-1">City name (e.g. <span class="text-zinc-100">Dallas, Frankfurt, London</span>)</td>
              </tr>
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">type</td>
                <td class="py-1.5 px-1 text-steel-400">string</td>
                <td class="py-1.5 px-1 text-steel-500">all</td>
                <td class="py-1.5 px-1">Protocol: <span class="text-mint-400">http</span>, <span class="text-mint-400">socks5</span>, <span class="text-mint-400">socks4</span>, or <span class="text-mint-400">socks</span> (both 4 & 5)</td>
              </tr>
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">tier</td>
                <td class="py-1.5 px-1 text-steel-400">string</td>
                <td class="py-1.5 px-1 text-steel-500">ALL</td>
                <td class="py-1.5 px-1">Quality tier: <span class="text-cyan-300">Diamond</span>, <span class="text-brass-400">Gold</span>, <span class="text-zinc-200">Silver</span>, <span class="text-amber-500">Bronze</span>, <span class="text-steel-400">Iron</span></td>
              </tr>
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">anonymity</td>
                <td class="py-1.5 px-1 text-steel-400">string</td>
                <td class="py-1.5 px-1 text-steel-500">ALL</td>
                <td class="py-1.5 px-1">Anonymity: <span class="text-mint-400">Elite</span> (L1), <span class="text-steel-300">Anonymous</span> (L2), <span class="text-rose-400">Transparent</span> (L3)</td>
              </tr>
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">clean_only</td>
                <td class="py-1.5 px-1 text-steel-400">boolean</td>
                <td class="py-1.5 px-1 text-steel-500">false</td>
                <td class="py-1.5 px-1"><span class="text-mint-400">true</span> or <span class="text-mint-400">1</span>: Only proxies with 0 threat score (zero blacklist hits)</td>
              </tr>
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">https</td>
                <td class="py-1.5 px-1 text-steel-400">boolean</td>
                <td class="py-1.5 px-1 text-steel-500">false</td>
                <td class="py-1.5 px-1"><span class="text-mint-400">true</span> or <span class="text-mint-400">1</span>: Only proxies supporting secure SSL/TLS tunneling</td>
              </tr>
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">max_latency</td>
                <td class="py-1.5 px-1 text-steel-400">integer</td>
                <td class="py-1.5 px-1 text-steel-500">0</td>
                <td class="py-1.5 px-1">Maximum allowed latency in milliseconds (e.g. <span class="text-zinc-100">600</span>)</td>
              </tr>
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">timeout</td>
                <td class="py-1.5 px-1 text-steel-400">integer</td>
                <td class="py-1.5 px-1 text-steel-500">4500</td>
                <td class="py-1.5 px-1">Socket & TLS probe timeout in ms for /api/v1/test (e.g. <span class="text-zinc-100">6000</span>, max 15000)</td>
              </tr>
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">random</td>
                <td class="py-1.5 px-1 text-steel-400">boolean</td>
                <td class="py-1.5 px-1 text-steel-500">false</td>
                <td class="py-1.5 px-1"><span class="text-mint-400">true</span> or <span class="text-mint-400">1</span>: Randomizes proxy order (ideal for rotational scrapers)</td>
              </tr>
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">limit</td>
                <td class="py-1.5 px-1 text-steel-400">integer</td>
                <td class="py-1.5 px-1 text-steel-500">all</td>
                <td class="py-1.5 px-1">Max number of proxies to return (e.g. <span class="text-zinc-100">10, 50, 100</span>)</td>
              </tr>
              <tr>
                <td class="py-1.5 px-1 text-cyan-300 font-bold">download</td>
                <td class="py-1.5 px-1 text-steel-400">boolean</td>
                <td class="py-1.5 px-1 text-steel-500">false</td>
                <td class="py-1.5 px-1"><span class="text-mint-400">true</span>: Sets Content-Disposition header with descriptive filename</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Endpoint 1: /api/v1/raw -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line rounded-2xl p-3.5 flex flex-col gap-2 shadow-xl">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-mint-500/15 text-mint-400 border border-mint-500/30">GET</span>
            <span class="text-[10.5px] font-bold text-white mono select-all">/api/v1/raw</span>
          </div>
          <span class="text-[9px] text-steel-400 mono">text/plain • Plaintext Stream</span>
        </div>
        <p class="text-[10.5px] text-steel-400 leading-relaxed">
          Delivers newline-separated endpoints formatted as <code class="text-zinc-200">proto://ip:port</code>. Ideal for direct piping into cURL, Clash, V2Ray, requests, or CLI tools.
        </p>

        <!-- Multiple Parameter Examples for /raw -->
        <div class="flex flex-col gap-1.5 pt-1">
          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 1: Top Tier US SOCKS5 (Clean Only)</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/raw?tier=Diamond&country=US&type=socks5&clean_only=true&limit=10"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/raw?tier=Diamond&country=US&type=socks5&clean_only=true&limit=10"'>Copy</button>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 2: Low-Latency German HTTP with SSL (&lt; 500ms)</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/raw?country=DE&type=http&https=true&max_latency=500&limit=5"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/raw?country=DE&type=http&https=true&max_latency=500&limit=5"'>Copy</button>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 3: Random Rotational Proxies for Scrapers</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/raw?random=true&clean_only=true&max_latency=700&limit=25"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/raw?random=true&clean_only=true&max_latency=700&limit=25"'>Copy</button>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 4: Direct TXT Download with Meta-Filename</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl -O -J "${origin}/api/v1/raw?country=FR&type=socks5&tier=Gold&download=true"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl -O -J "${origin}/api/v1/raw?country=FR&type=socks5&tier=Gold&download=true"'>Copy</button>
            </div>
          </div>
        </div>

        <div class="p-2 rounded-xl bg-well/90 border border-line text-[9.5px] mono text-steel-300 flex flex-col gap-0.5">
          <span class="text-[8.5px] text-steel-500 uppercase tracking-wider font-bold">Sample Plaintext Output:</span>
          <div>socks5://67.207.92.87:1088<br>http://43.173.120.13:8899<br>socks5://198.51.100.23:1080</div>
        </div>
      </div>

      <!-- Endpoint 2: /api/v1/proxies -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line rounded-2xl p-3.5 flex flex-col gap-2 shadow-xl">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-mint-500/15 text-mint-400 border border-mint-500/30">GET</span>
            <span class="text-[10.5px] font-bold text-white mono select-all">/api/v1/proxies</span>
          </div>
          <span class="text-[9px] text-steel-400 mono">application/json • Rich Metadata</span>
        </div>
        <p class="text-[10.5px] text-steel-400 leading-relaxed">
          Comprehensive JSON payload detailing each proxy endpoint: Geolocation (Country, City), Anonymity (Elite/Anon/Trans), Blacklist Threat Score, Quality Tier, Protocol, SSL Support, and Latency.
        </p>

        <!-- Multiple Parameter Examples for /proxies -->
        <div class="flex flex-col gap-1.5 pt-1">
          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 1: Clean Gold Tier Proxies in Europe</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/proxies?country=DE&tier=Gold&clean_only=true"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/proxies?country=DE&tier=Gold&clean_only=true"'>Copy</button>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 2: Elite SOCKS5 Proxies with SSL Support</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/proxies?type=socks5&anonymity=Elite&https=true&limit=15"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/proxies?type=socks5&anonymity=Elite&https=true&limit=15"'>Copy</button>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 3: Low-Latency Proxies with Text Override</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/proxies?country=US&format=text&limit=10"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/proxies?country=US&format=text&limit=10"'>Copy</button>
            </div>
          </div>
        </div>

        <div class="p-2 rounded-xl bg-well/90 border border-line text-[9.5px] mono text-steel-300 flex flex-col gap-1 overflow-x-auto custom-scrollbar">
          <span class="text-[8.5px] text-steel-500 uppercase tracking-wider font-bold">Sample JSON Object:</span>
          <pre class="text-[9.5px] text-cyan-300 font-mono leading-tight">{
  "success": true,
  "count": 1,
  "proxies": [
    {
      "address": "43.173.120.13:8899",
      "protocol": "http",
      "country": "US",
      "city": "Santa Clara",
      "threat_score": 0,
      "anonymity": "Elite",
      "tier": "Gold",
      "latency": 320,
      "https": true,
      "last_checked": "2026-09-24T06:15:00Z"
    }
  ]
}</pre>
        </div>
      </div>

      <!-- Endpoint 3: /api/v1/test -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line rounded-2xl p-3.5 flex flex-col gap-2 shadow-xl">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">GET</span>
            <span class="text-[10.5px] font-bold text-white mono select-all">/api/v1/test</span>
          </div>
          <span class="text-[9px] text-cyan-400 mono">Active Live Probe & SSE</span>
        </div>
        <p class="text-[10.5px] text-steel-400 leading-relaxed">
          High-concurrency live connectivity probe against any custom URL target. Supports custom timeout, full filter parameters, automatic HTTPS proxy prioritization for HTTPS targets, and Server-Sent Events (SSE).
        </p>

        <!-- Multiple Parameter Examples for /test -->
        <div class="flex flex-col gap-1.5 pt-1">
          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 1: YouTube / Google Probe with SSL & 6s Timeout</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/test?url=https://youtube.com&https=true&clean_only=true&limit=10&timeout=6000"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/test?url=https://youtube.com&https=true&clean_only=true&limit=10&timeout=6000"'>Copy</button>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 2: Diamond Tier SOCKS5 on GitHub API</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/test?url=https://api.github.com&tier=Diamond&type=socks5&timeout=5000&limit=5"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/test?url=https://api.github.com&tier=Diamond&type=socks5&timeout=5000&limit=5"'>Copy</button>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 3: Realtime Server-Sent Events (SSE Stream)</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl -N "${origin}/api/v1/test?url=https://youtube.com&type=socks5&stream=true&timeout=6000"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl -N "${origin}/api/v1/test?url=https://youtube.com&type=socks5&stream=true&timeout=6000"'>Copy</button>
            </div>
          </div>
        </div>

        <div class="p-2 rounded-xl bg-well/90 border border-line text-[9.5px] mono text-steel-300 flex flex-col gap-0.5">
          <span class="text-[8.5px] text-steel-500 uppercase tracking-wider font-bold">Standardized Error Categorization:</span>
          <div class="text-steel-400 leading-relaxed flex flex-wrap gap-1 items-center">
            <code class="text-rose-400">ssl/tls handshake failed</code>,
            <code class="text-amber-400">proxy does not support https tunnel (bad request)</code>,
            <code class="text-orange-400">proxy gateway error (bad gateway)</code>,
            <code class="text-cyan-300">socks handshake failed</code>,
            <code class="text-emerald-400">connection reset by peer</code>,
            <code class="text-purple-400">dns resolution failed</code>,
            <code class="text-steel-300">timeout (exceeded deadline)</code>.
          </div>
        </div>
      </div>

      <!-- Endpoint 4: /api/v1/stats -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line rounded-2xl p-3.5 flex flex-col gap-2 shadow-xl">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">GET</span>
            <span class="text-[10.5px] font-bold text-white mono select-all">/api/v1/stats</span>
          </div>
          <span class="text-[9px] text-steel-400 mono">application/json • Telemetry</span>
        </div>
        <p class="text-[10.5px] text-steel-400 leading-relaxed">
          Real-time aggregated health telemetry: Total live pool count, protocol breakdowns (HTTP, SOCKS4, SOCKS5), clean proxy tally, active countries, cities, and scrapers source count.
        </p>

        <!-- Multiple Parameter Examples for /stats -->
        <div class="flex flex-col gap-1.5 pt-1">
          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 1: Full System Telemetry</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/stats"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/stats"'>Copy</button>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 2: Extract Live Counts with JQ</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl -s "${origin}/api/v1/stats" | jq '{total: .total_live, socks: .socks_live, http: .http_live}'</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl -s "${origin}/api/v1/stats" | jq "{total: .total_live, socks: .socks_live, http: .http_live}"'>Copy</button>
            </div>
          </div>
        </div>

        <div class="p-2 rounded-xl bg-well/90 border border-line text-[9.5px] mono text-steel-300 flex flex-col gap-0.5">
          <span class="text-[8.5px] text-steel-500 uppercase tracking-wider font-bold">Key Output Fields:</span>
          <div class="text-steel-300 leading-relaxed">
            <code class="text-mint-400">total_live</code>, <code class="text-cyan-300">http_live</code>, <code class="text-cyan-300">socks5_live</code>, <code class="text-mint-400">clean_live</code>, <code class="text-steel-200">total_countries</code>, <code class="text-steel-200">total_cities</code>, <code class="text-purple-400">total_sources</code>.
          </div>
        </div>
      </div>

      <!-- Endpoint 5: /api/v1/status -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line rounded-2xl p-3.5 flex flex-col gap-2 shadow-xl">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30">GET</span>
            <span class="text-[10.5px] font-bold text-white mono select-all">/api/v1/status</span>
          </div>
          <span class="text-[9px] text-steel-400 mono">application/json • Engine State</span>
        </div>
        <p class="text-[10.5px] text-steel-400 leading-relaxed">
          Monitors internal harvesting engine lifecycle: Engine state (<code class="text-mint-400">IDLE</code> / <code class="text-amber-400">RUNNING</code>), active subtask, candidate progress counter, last harvest timestamp, and next scheduled harvest.
        </p>

        <!-- Multiple Parameter Examples for /status -->
        <div class="flex flex-col gap-1.5 pt-1">
          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 1: Harvester Lifecycle State & Subtask</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/status"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/status"'>Copy</button>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-steel-400">Example 2: Extract Next Sync Timestamp & Progress</span>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl -s "${origin}/api/v1/status" | jq '.status | {state, current_task, next_sync: .next_harvest_time}'</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl -s "${origin}/api/v1/status" | jq ".status | {state, current_task, next_sync: .next_harvest_time}"'>Copy</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Endpoint 6, 7 & 8: /api/v1/countries, /api/v1/cities & /api/v1/tiers -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-xl">
        <h3 class="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
          <i class="fa-solid fa-earth-americas text-cyan-400 text-[10px]"></i> Geographic & Quality Metadata Endpoints
        </h3>

        <!-- Countries -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded bg-steel-500/15 text-steel-300 border border-steel-500/30">GET</span>
              <span class="text-[10.5px] font-bold text-white mono">/api/v1/countries</span>
            </div>
            <span class="text-[9px] text-steel-400 mono">Country Breakdown</span>
          </div>
          <p class="text-[10px] text-steel-400">Returns JSON map of all available 2-letter ISO country codes and active count in each.</p>
          
          <div class="flex flex-col gap-1 pt-0.5">
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/countries"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/countries"'>Copy</button>
            </div>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl -s "${origin}/api/v1/countries" | jq '.countries | to_entries | sort_by(.value) | reverse | .[:5]'</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl -s "${origin}/api/v1/countries" | jq ".countries | to_entries | sort_by(.value) | reverse | .[:5]"'>Copy Top 5</button>
            </div>
          </div>
        </div>

        <!-- Cities -->
        <div class="border-t border-line/60 pt-2 flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded bg-steel-500/15 text-steel-300 border border-steel-500/30">GET</span>
              <span class="text-[10.5px] font-bold text-white mono">/api/v1/cities</span>
            </div>
            <span class="text-[9px] text-steel-400 mono">City Breakdown</span>
          </div>
          <p class="text-[10px] text-steel-400">Returns list of cities with optional <code class="text-cyan-300">?country=ISO</code> filter.</p>
          
          <div class="flex flex-col gap-1 pt-0.5">
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/cities?country=US"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/cities?country=US"'>Copy US</button>
            </div>
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/cities?country=DE"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/cities?country=DE"'>Copy DE</button>
            </div>
          </div>
        </div>

        <!-- Tiers -->
        <div class="border-t border-line/60 pt-2 flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded bg-steel-500/15 text-steel-300 border border-steel-500/30">GET</span>
              <span class="text-[10.5px] font-bold text-white mono">/api/v1/tiers</span>
            </div>
            <span class="text-[9px] text-steel-400 mono">Quality Tier Breakdown</span>
          </div>
          <p class="text-[10px] text-steel-400">Returns live distribution map of active proxies grouped by quality tier (<code class="text-cyan-300">Diamond</code>, <code class="text-brass-400">Gold</code>, <code class="text-zinc-200">Silver</code>, <code class="text-amber-500">Bronze</code>, <code class="text-steel-400">Iron</code>).</p>
          
          <div class="flex flex-col gap-1 pt-0.5">
            <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
              <span class="truncate pr-2 select-all">curl "${origin}/api/v1/tiers"</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl "${origin}/api/v1/tiers"'>Copy</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Endpoint 9: /api/v1/health & Client Integrations -->
      <div class="bg-navy-700/60 backdrop-blur-md border border-line rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-xl">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded bg-steel-500/15 text-steel-300 border border-steel-500/30">GET</span>
            <span class="text-[10.5px] font-bold text-white mono">/api/v1/health</span>
          </div>
          <span class="text-[9px] text-mint-400 mono font-bold">Liveness & Readiness Probe</span>
        </div>
        <p class="text-[10px] text-steel-400">Microservice uptime check for Docker and Kubernetes clusters.</p>
        <div class="relative bg-well border border-line rounded-xl p-2 text-[10px] text-zinc-300 mono flex items-center justify-between">
          <span class="truncate pr-2 select-all">curl -f -s "${origin}/api/v1/health" || exit 1</span>
          <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code='curl -f -s "${origin}/api/v1/health" || exit 1'>Copy</button>
        </div>

        <!-- Code Examples -->
        <div class="border-t border-line/60 pt-2 flex flex-col gap-2">
          <h3 class="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <i class="fa-solid fa-code text-mint-400 text-[10px]"></i> Code Integration Quickstart
          </h3>

          <!-- Python Example -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <span class="text-[9.5px] font-bold text-steel-300 uppercase tracking-wider"><i class="fa-brands fa-python text-yellow-400 mr-1"></i> Python (Rotating Proxy)</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code="import requests

# Fetch 1 random elite US proxy
res = requests.get('${origin}/api/v1/raw?tier=Diamond&country=US&random=true&limit=1')
proxy_url = res.text.strip()

print(f'Routing through: {proxy_url}')
response = requests.get('https://httpbin.org/ip', proxies={'http': proxy_url, 'https': proxy_url}, timeout=5)
print(response.json())">Copy Python</button>
            </div>
            <pre class="bg-well border border-line rounded-xl p-2 text-[9px] text-zinc-300 font-mono overflow-x-auto custom-scrollbar leading-relaxed">import requests

res = requests.get('${origin}/api/v1/raw?tier=Diamond&country=US&random=true&limit=1')
proxy_url = res.text.strip()

response = requests.get('https://httpbin.org/ip', proxies={'http': proxy_url, 'https': proxy_url}, timeout=5)
print(response.json())</pre>
          </div>

          <!-- Node.js Example -->
          <div class="flex flex-col gap-1 border-t border-line/60 pt-1.5">
            <div class="flex items-center justify-between">
              <span class="text-[9.5px] font-bold text-steel-300 uppercase tracking-wider"><i class="fa-brands fa-node-js text-green-400 mr-1"></i> Node.js / TypeScript</span>
              <button class="btn-copy-code px-2 py-0.5 bg-navy-800 hover:bg-navy-700 border border-line text-steel-300 hover:text-white text-[9px] rounded active:scale-95 transition shrink-0" data-code="const res = await fetch('${origin}/api/v1/raw?type=socks5&clean_only=true&limit=5');
const proxies = (await res.text()).trim().split('\n');
console.log('Active proxies:', proxies);">Copy Node</button>
            </div>
            <pre class="bg-well border border-line rounded-xl p-2 text-[9px] text-zinc-300 font-mono overflow-x-auto custom-scrollbar leading-relaxed">const res = await fetch('${origin}/api/v1/raw?type=socks5&clean_only=true&limit=5');
const proxies = (await res.text()).trim().split('\n');
console.log('Active proxies:', proxies);</pre>
          </div>
        </div>
      </div>

    </main>

    <!-- Footer -->
    <footer class="mt-4 pt-3 pb-3 border-t border-line/60 flex items-center justify-center text-center text-[10.5px] text-steel-400 font-mono">
      <div class="flex items-center justify-center flex-wrap gap-1.5 leading-relaxed">
        <span class="flex items-center gap-1 text-steel-500">
          <i class="fa-regular fa-copyright text-[10px]"></i>
          <span>2026</span>
        </span>
        <span class="text-zinc-300 font-semibold">NyxProxy</span>
        <span class="text-steel-600">•</span>
        <span>Developed by</span>
        <a href="https://NyxAgent.dev" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-mint-400 hover:text-mint-300 font-semibold hover:underline transition">
          <span>NyxAgent.dev Developer Studio</span>
          <i class="fa-solid fa-arrow-up-right-from-square text-[8.5px] opacity-80"></i>
        </a>
      </div>
    </footer>
  `;

  attachPermanentEvents();
}

function attachPermanentEvents() {
  document.getElementById('tab-grid')?.addEventListener('click', () => {
    state.activeTab = 'grid';
    window.location.hash = '';
    document.getElementById('tab-grid').className = 'py-2 text-xs font-bold rounded-xl uppercase tracking-wider transition flex items-center justify-center gap-1.5 bg-navy-800 text-white shadow-md border border-line-2';
    document.getElementById('tab-docs').className = 'py-2 text-xs font-bold rounded-xl uppercase tracking-wider transition flex items-center justify-center gap-1.5 text-steel-400 hover:text-zinc-200';
    document.getElementById('view-grid').classList.remove('hidden');
    document.getElementById('view-docs').classList.add('hidden');
  });

  document.getElementById('tab-docs')?.addEventListener('click', () => {
    state.activeTab = 'docs';
    window.location.hash = 'docs';
    document.getElementById('tab-docs').className = 'py-2 text-xs font-bold rounded-xl uppercase tracking-wider transition flex items-center justify-center gap-1.5 bg-navy-800 text-white shadow-md border border-line-2';
    document.getElementById('tab-grid').className = 'py-2 text-xs font-bold rounded-xl uppercase tracking-wider transition flex items-center justify-center gap-1.5 text-steel-400 hover:text-zinc-200';
    document.getElementById('view-docs').classList.remove('hidden');
    document.getElementById('view-grid').classList.add('hidden');
  });

  document.querySelectorAll('.btn-copy-code').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const code = e.target.getAttribute('data-code');
      copyToClipboard(code).then(() => {
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        e.target.textContent = 'Copied!';
        setTimeout(() => e.target.textContent = 'Copy', 1200);
      });
    });
  });

  document.querySelectorAll('.btn-type').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const clickedBtn = e.target.closest('.btn-type');
      if (!clickedBtn) return;

      document.querySelectorAll('.btn-type').forEach(b => {
        b.className = 'btn-type py-2 text-[10px] font-bold rounded-xl uppercase tracking-wider transition text-steel-400 hover:text-zinc-200 flex justify-center items-center gap-0.5';
      });
      clickedBtn.className = 'btn-type py-2 text-[10px] font-bold rounded-xl uppercase tracking-wider transition bg-navy-800 text-white shadow-md border border-line-2 flex justify-center items-center gap-0.5';

      state.selectedType = clickedBtn.dataset.type;
      if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
      updateProxyListDOM();
    });
  });

  const countryBtn = document.getElementById('btn-country-dropdown');
  const countryMenu = document.getElementById('country-dropdown-menu');

  countryBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.isCountryMenuOpen = !state.isCountryMenuOpen;
    countryMenu.classList.toggle('hidden', !state.isCountryMenuOpen);
  });

  document.addEventListener('click', () => {
    if (state.isCountryMenuOpen) {
      state.isCountryMenuOpen = false;
      countryMenu?.classList.add('hidden');
    }
  });

  countryMenu?.addEventListener('click', (e) => {
    const item = e.target.closest('.country-option-item');
    if (!item) return;

    const code = item.getAttribute('data-country');
    state.selectedCountry = code;
    state.selectedCity = 'ALL';
    state.isCountryMenuOpen = false;
    countryMenu.classList.add('hidden');

    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();

    const displaySpan = document.getElementById('country-selected-display');
    if (displaySpan) {
      const count = code === 'ALL' ? (state.stats.total_countries || 0) : (state.stats.countries[code] || 0);
      const title = code === 'ALL' ? `All (${count})` : `${code} (${count})`;
      displaySpan.innerHTML = `${getFlagImgHTML(code)} <span class="font-medium truncate text-[11px]">${title}</span>`;
    }

    updateCityDropdown();
    updateLiveDOM();
    updateProxyListDOM();
  });

  document.getElementById('city-select')?.addEventListener('change', (e) => {
    state.selectedCity = e.target.value;
    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
    updateLiveDOM();
    updateProxyListDOM();
  });

  document.getElementById('tier-select')?.addEventListener('change', (e) => {
    state.selectedTier = e.target.value;
    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
    updateLiveDOM();
    updateProxyListDOM();
  });

  document.getElementById('search-input')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    updateLiveDOM();
    updateProxyListDOM();
  });

  // Custom Target URL Probe & Limit Events
  document.getElementById('target-url-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-test-url')?.click();
    }
  });

  document.getElementById('target-limit-input')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    state.proxyLimit = (!isNaN(val) && val > 0) ? val : 0;
    updateProxyListDOM();
  });

  document.getElementById('target-limit-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-test-url')?.click();
    }
  });

  document.getElementById('btn-test-url')?.addEventListener('click', async () => {
    const input = document.getElementById('target-url-input');
    let rawUrl = input ? input.value.trim() : '';
    if (!rawUrl) {
      input?.focus();
      return;
    }

    const limitInput = document.getElementById('target-limit-input');
    const limitVal = limitInput ? parseInt(limitInput.value) : 0;
    state.proxyLimit = (!isNaN(limitVal) && limitVal > 0) ? limitVal : 0;

    // Ensure URL has  prefix
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      rawUrl = 'https://' + rawUrl;
      if (input) input.value = rawUrl;
    }

    const btn = document.getElementById('btn-test-url');
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-[10px]"></i> Probing...';
    }

    state.urlTest.isRunning = true;
    state.urlTest.targetURL = rawUrl;
    state.urlTest.results = {};
    state.urlTest.testedCount = 0;
    state.urlTest.passedCount = 0;
    state.urlTest.filterPassedOnly = false;

    const progressBox = document.getElementById('target-progress-box');
    const progressBar = document.getElementById('target-progress-bar');
    const progressCounter = document.getElementById('target-progress-counter');
    const progressLabel = document.getElementById('target-progress-label');
    const banner = document.getElementById('target-test-banner');
    const msg = document.getElementById('target-test-msg');
    const clearBtn = document.getElementById('btn-clear-url-test');

    if (banner) banner.classList.add('hidden');
    if (progressBox) progressBox.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '0%';
    if (progressCounter) progressCounter.textContent = '0 / 0';
    if (progressLabel) progressLabel.textContent = 'Probing endpoints...';
    if (clearBtn) clearBtn.classList.remove('hidden');

    try {
      const p = new URLSearchParams({
        url: rawUrl,
        limit: state.proxyLimit.toString(), // 0 = test all matching proxies in the pool
        type: state.selectedType,
        country: state.selectedCountry,
        tier: state.selectedTier,
        stream: 'true'
      });

      const res = await fetch(`/api/v1/test?${p.toString()}`);
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep last incomplete piece

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonText = trimmed.slice(5).trim();
            if (!jsonText) continue;

            try {
              const packet = JSON.parse(jsonText);
              if (packet.type === 'progress') {
                const r = packet.result;
                state.urlTest.results[r.address] = r;
                state.urlTest.testedCount = packet.current;
                state.urlTest.passedCount = packet.passed_count;

                const total = packet.total || 40;
                const pct = Math.min(100, Math.round((packet.current / total) * 100));

                if (progressBar) progressBar.style.width = `${pct}%`;
                if (progressCounter) {
                  progressCounter.innerHTML = `<span class="text-cyan-400 font-bold">${packet.current}</span><span class="text-zinc-500">/${total}</span> <span class="text-emerald-400 font-bold ml-1">(${packet.passed_count} live)</span>`;
                }

                updateProxyListDOM();
              } else if (packet.type === 'done') {
                state.urlTest.testedCount = packet.total_tested;
                state.urlTest.passedCount = packet.passed_count;
                if (progressBar) progressBar.style.width = '100%';
              }
            } catch (err) {}
          }
        }
      }

      // Finish up transition from progress bar to summary banner
      setTimeout(() => {
        if (progressBox) progressBox.classList.add('hidden');
        if (banner && msg) {
          banner.classList.remove('hidden');
          msg.innerHTML = `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-circle-check mr-1.5"></i>${state.urlTest.passedCount}/${state.urlTest.testedCount}</span> reached <span class="text-cyan-300 font-semibold truncate">${rawUrl}</span>`;
        }

        const hasPassed = (state.urlTest.passedCount || 0) > 0;
        state.urlTest.filterPassedOnly = hasPassed;
        updateToggleSwitchVisuals(hasPassed);

        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred(hasPassed ? 'success' : 'warning');
        updateProxyListDOM();
      }, 350);

    } catch (err) {
      if (progressBox) progressBox.classList.add('hidden');
    } finally {
      state.urlTest.isRunning = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHTML;
      }
    }
  });

  function updateToggleSwitchVisuals(passedOnly) {
    const slider = document.getElementById('segment-slider');
    const btnPassed = document.getElementById('btn-filter-passed');
    const btnAll = document.getElementById('btn-filter-all');
    const badgePassed = document.getElementById('badge-filter-passed');
    const badgeAll = document.getElementById('badge-filter-all');

    if (badgePassed) badgePassed.textContent = state.urlTest.passedCount || 0;
    if (badgeAll) badgeAll.textContent = state.urlTest.testedCount || 0;

    const iconPassed = document.getElementById('icon-filter-passed');
    const iconAll = document.getElementById('icon-filter-all');

    if (slider) {
      slider.className = passedOnly
        ? 'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-lg bg-navy-800 border border-line-2 shadow-md transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] translate-x-0 pointer-events-none'
        : 'absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-lg bg-navy-800 border border-line-2 shadow-md transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] translate-x-full pointer-events-none';
    }

    if (btnPassed) {
      btnPassed.className = passedOnly
        ? 'relative z-10 flex-1 h-full px-1.5 text-[9px] font-mono tracking-tight font-bold rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-white active:scale-95 cursor-pointer whitespace-nowrap'
        : 'relative z-10 flex-1 h-full px-1.5 text-[9px] font-mono tracking-tight font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-steel-400 hover:text-zinc-200 active:scale-95 cursor-pointer whitespace-nowrap';
    }
    if (iconPassed) {
      iconPassed.className = passedOnly
        ? 'fa-solid fa-circle-check text-[9px] shrink-0 text-mint-400 transition-colors duration-200'
        : 'fa-solid fa-circle-check text-[9px] shrink-0 text-steel-500 transition-colors duration-200';
    }
    if (badgePassed) {
      badgePassed.className = passedOnly
        ? 'text-[8px] px-1 py-0.5 rounded bg-mint-500/20 text-mint-400 border border-mint-500/30 font-mono font-bold leading-none shrink-0 transition-colors duration-200'
        : 'text-[8px] px-1 py-0.5 rounded bg-navy-800 text-steel-400 font-mono font-medium leading-none shrink-0 transition-colors duration-200';
    }

    if (btnAll) {
      btnAll.className = !passedOnly
        ? 'relative z-10 flex-1 h-full px-1.5 text-[9px] font-mono tracking-tight font-bold rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-white active:scale-95 cursor-pointer whitespace-nowrap'
        : 'relative z-10 flex-1 h-full px-1.5 text-[9px] font-mono tracking-tight font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 text-steel-400 hover:text-zinc-200 active:scale-95 cursor-pointer whitespace-nowrap';
    }
    if (iconAll) {
      iconAll.className = !passedOnly
        ? 'fa-solid fa-layer-group text-[9px] shrink-0 text-cyan-400 transition-colors duration-200'
        : 'fa-solid fa-layer-group text-[9px] shrink-0 text-steel-500 transition-colors duration-200';
    }
    if (badgeAll) {
      badgeAll.className = !passedOnly
        ? 'text-[8px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono font-bold leading-none shrink-0 transition-colors duration-200'
        : 'text-[8px] px-1 py-0.5 rounded bg-navy-800 text-steel-400 font-mono font-medium leading-none shrink-0 transition-colors duration-200';
    }
  }

  document.getElementById('btn-filter-passed')?.addEventListener('click', () => {
    state.urlTest.filterPassedOnly = true;
    updateToggleSwitchVisuals(true);
    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
    updateProxyListDOM();
  });

  document.getElementById('btn-filter-all')?.addEventListener('click', () => {
    state.urlTest.filterPassedOnly = false;
    updateToggleSwitchVisuals(false);
    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
    updateProxyListDOM();
  });

  document.getElementById('btn-clear-url-test')?.addEventListener('click', () => {
    state.urlTest.targetURL = '';
    state.urlTest.results = {};
    state.urlTest.filterPassedOnly = false;
    const banner = document.getElementById('target-test-banner');
    const progressBox = document.getElementById('target-progress-box');
    const progressBar = document.getElementById('target-progress-bar');
    const clearBtn = document.getElementById('btn-clear-url-test');
    const input = document.getElementById('target-url-input');
    const limitInput = document.getElementById('target-limit-input');
    if (banner) banner.classList.add('hidden');
    if (progressBox) progressBox.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
    if (clearBtn) clearBtn.classList.add('hidden');
    if (input) input.value = '';
    if (limitInput) limitInput.value = '0';
    state.proxyLimit = 0;
    updateToggleSwitchVisuals(true);
    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
    updateProxyListDOM();
  });

  document.getElementById('btn-copy-all')?.addEventListener('click', () => {
    const filtered = getFilteredProxies();
    if (filtered.length === 0) return;
    const list = filtered.map(p => `${p.protocol}://${p.address}`).join('\n');
    const btn = document.getElementById('btn-copy-all');
    copyToClipboard(list).then(() => {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      if (btn) {
        const origHTML = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-check text-mint-400 text-xs"></i> <span class="text-mint-400 font-semibold truncate">Copied (${filtered.length})</span>`;
        btn.classList.add('border-mint-500/60');
        setTimeout(() => {
          btn.innerHTML = origHTML;
          btn.classList.remove('border-mint-500/60');
        }, 1500);
      }
    }).catch(() => {
      prompt("Copy manually:", list);
    });
  });

  function generateDownloadFileName() {
    const parts = ['nyx_proxies'];

    // 1. Protocol / Type (http, socks5, socks4, all)
    const proto = (state.selectedType || 'all').toLowerCase();
    parts.push(proto);

    // 2. Country
    const country = (state.selectedCountry || 'all').toLowerCase();
    parts.push(country);

    // 3. City
    const city = (state.selectedCity && state.selectedCity !== 'ALL')
      ? state.selectedCity.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
      : 'all';
    parts.push(city);

    // 4. Tier (diamond, gold, silver, etc.)
    const tier = (state.selectedTier && state.selectedTier !== 'ALL')
      ? state.selectedTier.toLowerCase()
      : 'all';
    parts.push(tier);

    // 5. Custom URL (if tested/active)
    if (state.urlTest.targetURL) {
      let cleanHost = '';
      try {
        cleanHost = new URL(state.urlTest.targetURL).hostname;
      } catch {
        cleanHost = state.urlTest.targetURL.replace(/^https?:\/\//i, '').split('/')[0];
      }
      cleanHost = cleanHost.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();
      if (state.urlTest.filterPassedOnly) {
        parts.push(`passed_${cleanHost}`);
      } else {
        parts.push(`tested_${cleanHost}`);
      }
    }

    // 6. Current Date
    const dateStr = new Date().toISOString().slice(0, 10);
    parts.push(dateStr);

    return `${parts.join('_')}.txt`;
  }

  document.getElementById('btn-download')?.addEventListener('click', () => {
    const filtered = getFilteredProxies();
    if (!filtered || filtered.length === 0) {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
      return;
    }

    const list = filtered.map(p => `${p.protocol}://${p.address}`).join('\n') + '\n';
    const blob = new Blob([list], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generateDownloadFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    const btn = document.getElementById('btn-download');
    if (btn) {
      const origHTML = btn.innerHTML;
      btn.innerHTML = `<i class="fa-solid fa-circle-check text-mint-400 text-xs"></i> <span class="text-mint-400 font-semibold truncate">Downloaded (${filtered.length})</span>`;
      btn.classList.add('border-mint-500/60');
      setTimeout(() => {
        btn.innerHTML = origHTML;
        btn.classList.remove('border-mint-500/60');
      }, 1500);
    }
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  });

  document.getElementById('proxy-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-copy-single');
    if (!btn) return;

    const val = btn.getAttribute('data-value');
    if (!val) return;

    copyToClipboard(val).then(() => {
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check text-mint-400"></i> Copied!';
      btn.classList.add('text-mint-400', 'border-mint-500/60');

      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.classList.remove('text-mint-400', 'border-mint-500/60');
      }, 1200);
    }).catch(() => {
      prompt("Copy proxy:", val);
    });
  });
}

function updateCityDropdown() {
  const citySelect = document.getElementById('city-select');
  if (!citySelect) return;

  const cityCounts = {};
  state.allProxies.forEach(p => {
    if (state.selectedCountry === 'ALL' || (p.country && p.country.toUpperCase() === state.selectedCountry.toUpperCase())) {
      const c = p.city && p.city.trim() !== '' && p.city !== 'Unknown' ? p.city.trim() : null;
      if (c) {
        cityCounts[c] = (cityCounts[c] || 0) + 1;
      }
    }
  });

  const sortedCities = Object.keys(cityCounts).sort((a, b) => cityCounts[b] - cityCounts[a]);

  citySelect.innerHTML = `
    <option value="ALL">All Cities (${sortedCities.length})</option>
    ${sortedCities.map(c => `
      <option value="${c}" ${state.selectedCity.toLowerCase() === c.toLowerCase() ? 'selected' : ''}>
        ${c} (${cityCounts[c]})
      </option>
    `).join('')}
  `;

  if (state.selectedCity !== 'ALL' && !cityCounts[state.selectedCity]) {
    state.selectedCity = 'ALL';
    citySelect.value = 'ALL';
  }
}

function updateCountryDropdownList() {
  const countryMenu = document.getElementById('country-dropdown-menu');
  if (!countryMenu) return;

  const countrySource = state.stats.countries || {};
  const validCountries = Object.keys(countrySource)
    .filter(c => c !== 'UNKNOWN' && c !== '')
    .sort((a, b) => countrySource[b] - countrySource[a]);

  const totalCountries = validCountries.length;

  countryMenu.innerHTML = `
    <div data-country="ALL" class="country-option-item flex items-center justify-between p-2 rounded-lg hover:bg-navy-800 cursor-pointer transition text-xs ${state.selectedCountry === 'ALL' ? 'bg-navy-800/90 text-mint-400 font-bold border border-line-2' : 'text-steel-300'}">
      <div class="flex items-center gap-2">
        ${getFlagImgHTML('ALL')}
        <span>All</span>
      </div>
      <span class="text-[10px] text-steel-500 font-mono">(${totalCountries})</span>
    </div>
    ${validCountries.map(c => `
      <div data-country="${c}" class="country-option-item flex items-center justify-between p-2 rounded-lg hover:bg-navy-800 cursor-pointer transition text-xs ${state.selectedCountry === c ? 'bg-navy-800/90 text-mint-400 font-bold border border-line-2' : 'text-steel-300'}">
        <div class="flex items-center gap-2">
          ${getFlagImgHTML(c)}
          <span class="font-medium">${c}</span>
        </div>
        <span class="text-[10px] text-steel-500 font-mono">(${countrySource[c]})</span>
      </div>
    `).join('')}
  `;

  const displaySpan = document.getElementById('country-selected-display');
  if (displaySpan) {
    const isAll = state.selectedCountry === 'ALL';
    const count = isAll ? totalCountries : (countrySource[state.selectedCountry] || 0);
    const title = isAll ? `All (${count})` : `${state.selectedCountry} (${count})`;
    displaySpan.innerHTML = `${getFlagImgHTML(state.selectedCountry)} <span class="font-medium truncate text-[11px]">${title}</span>`;
  }
}

function updateLiveDOM() {
  const totalEl = document.getElementById('stat-total');
  if (totalEl) totalEl.textContent = state.stats.total_live;
  
  const sourcesEl = document.getElementById('stat-sources');
  if (sourcesEl) sourcesEl.textContent = state.stats.total_sources || 0;

  const diamondEl = document.getElementById('stat-diamond');
  if (diamondEl) diamondEl.textContent = (state.stats.tiers && state.stats.tiers['Diamond']) || 0;
  const goldEl = document.getElementById('stat-gold');
  if (goldEl) goldEl.textContent = (state.stats.tiers && state.stats.tiers['Gold']) || 0;
  const silverEl = document.getElementById('stat-silver');
  if (silverEl) silverEl.textContent = (state.stats.tiers && state.stats.tiers['Silver']) || 0;

  const cleanEl = document.getElementById('stat-clean');
  if (cleanEl && state.allProxies.length > 0) {
    let cleanCount = 0;
    for (let i = 0; i < state.allProxies.length; i++) {
      if (state.allProxies[i].threat_score === 0) {
        cleanCount++;
      }
    }
    cleanEl.textContent = cleanCount;
  } else if (cleanEl) {
    cleanEl.textContent = state.stats.clean_live || 0;
  }

  const countrySource = state.stats.countries || {};
  const validCountries = Object.keys(countrySource).filter(c => c !== 'UNKNOWN' && c !== '');
  const accurateCountryCount = validCountries.length;

  const countriesCountEl = document.getElementById('stat-countries-count');
  if (countriesCountEl) {
    countriesCountEl.textContent = accurateCountryCount;
  }

  const citiesCountEl = document.getElementById('stat-cities-count');
  if (citiesCountEl) {
    const uniqueCities = new Set();
    state.allProxies.forEach(p => {
      if (p.city && p.city.trim() !== '' && p.city !== 'Unknown') {
        uniqueCities.add(p.city.trim().toLowerCase());
      }
    });
    citiesCountEl.textContent = uniqueCities.size || state.stats.total_cities || 0;
  }

  const protoCounts = getProtocolCounts();
  const btnProtoAll = document.getElementById('btn-proto-all');
  if (btnProtoAll) {
    btnProtoAll.innerHTML = `ALL <span class="opacity-70 font-mono font-normal text-[8.5px]">(${protoCounts.countAll})</span>`;
  }
  const btnProtoHttp = document.getElementById('btn-proto-http');
  if (btnProtoHttp) {
    btnProtoHttp.innerHTML = `HTTP <span class="opacity-70 font-mono font-normal text-[8.5px]">(${protoCounts.countHttp})</span>`;
  }
  const btnProtoSocks5 = document.getElementById('btn-proto-socks5');
  if (btnProtoSocks5) {
    btnProtoSocks5.innerHTML = `SOCKS5 <span class="opacity-70 font-mono font-normal text-[8.5px]">(${protoCounts.countSocks5})</span>`;
  }
  const btnProtoSocks4 = document.getElementById('btn-proto-socks4');
  if (btnProtoSocks4) {
    btnProtoSocks4.innerHTML = `SOCKS4 <span class="opacity-70 font-mono font-normal text-[8.5px]">(${protoCounts.countSocks4})</span>`;
  }

  updateCountryDropdownList();
  updateCityDropdown();

  const lastHarvestEl = document.getElementById('txt-last-harvest');
  if (lastHarvestEl) {
    lastHarvestEl.textContent = getLastUpdateFormatted(state.system.last_harvest_time);
  }

  updateProxyListDOM();
}

function updateProxyListDOM() {
  const listEl = document.getElementById('proxy-list');
  if (!listEl) return;

  const filtered = getFilteredProxies();

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="text-center py-8 bg-navy-900/40 border border-dashed border-line rounded-xl">
        <p class="text-xs text-steel-400">No active endpoints match your current filter.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.slice(0, 500).map(p => {
    const tierBadge = getTierStyle(p.tier);
    const anonBadge = getAnonymityStyle(p.anonymity);
    const isClean = p.threat_score === 0;
    const threatBadge = isClean 
      ? `<span class="bg-mint-500/15 text-mint-400 border border-mint-500/30 px-1.5 py-0.5 rounded text-[8px] font-mono"><i class="fa-solid fa-circle-check mr-0.5"></i> CLEAN</span>`
      : `<span class="bg-rose-500/15 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded text-[8px] font-mono"><i class="fa-solid fa-ban mr-0.5"></i> ${p.threat_score} BL</span>`;
    
    const latencyColor = (p.latency && p.latency < 500) 
      ? 'text-mint-400' 
      : (p.latency && p.latency < 1500) 
        ? 'text-brass-400' 
        : 'text-steel-500';

    const locationText = (p.city && p.city.trim() !== '' && p.city !== 'Unknown') ? `${p.city.trim()}, ${p.country}` : p.country;

    let protoBadgeClass = 'bg-mint-500/15 text-mint-400 border border-mint-500/30';
    if (p.protocol === 'http') {
      protoBadgeClass = 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30';
    } else if (p.protocol === 'socks4') {
      protoBadgeClass = 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
    }

    let targetBadges = '';
    if (p.https) {
      targetBadges += `<span title="HTTPS Supported" class="bg-mint-500/15 text-mint-300 border border-mint-500/30 px-1.5 py-0.5 rounded text-[8px] font-mono inline-flex items-center gap-1"><i class="fa-solid fa-lock text-[7.5px]"></i> SSL</span>`;
    }

    let customUrlBadge = '';
    const testResult = (state.urlTest && state.urlTest.results) ? state.urlTest.results[p.address] : null;
    if (testResult) {
      const cleanTarget = (state.urlTest.targetURL || 'URL').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
      if (testResult.passed) {
        customUrlBadge = `<span title="Target URL Reachable: ${state.urlTest.targetURL} (Status: ${testResult.status_code})" class="bg-cyan-500/15 text-cyan-300 border border-cyan-400/40 px-1.5 py-0.5 rounded text-[8px] font-mono inline-flex items-center gap-1 shadow-sm"><i class="fa-solid fa-circle-check text-[7.5px] text-cyan-400"></i> ${cleanTarget} (${testResult.latency}ms)</span>`;
      } else {
        const errDesc = testResult.error ? `: ${testResult.error}` : '';
        customUrlBadge = `<span title="Target URL Failed: ${testResult.error || 'Timeout'}" class="bg-rose-500/15 text-rose-400 border border-rose-500/40 px-1.5 py-0.5 rounded text-[8px] font-mono inline-flex items-center gap-1"><i class="fa-solid fa-circle-xmark text-[7.5px]"></i> ${cleanTarget}${errDesc}</span>`;
      }
    } else if (state.urlTest.isRunning && state.urlTest.targetURL) {
      const cleanTarget = state.urlTest.targetURL.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
      customUrlBadge = `<span class="bg-navy-800/80 text-steel-400 border border-line px-1.5 py-0.5 rounded text-[8px] font-mono inline-flex items-center gap-1"><i class="fa-solid fa-circle-notch fa-spin text-[7.5px] text-cyan-400"></i> ${cleanTarget}</span>`;
    }

    return `
      <div class="bg-navy-700/40 hover:bg-navy-700/70 border border-line hover:border-line-2 rounded-xl p-3 transition backdrop-blur-sm">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2 overflow-hidden">
            ${getFlagImgHTML(p.country)}
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-xs font-semibold text-zinc-100 mono select-all truncate">${p.address}</span>
              <span class="text-[10.5px] text-steel-400 font-medium truncate shrink-0">(${locationText})</span>
            </div>
          </div>
          <button class="btn-copy-single px-3 py-1 bg-navy-800 hover:bg-navy-700 text-steel-300 hover:text-white text-xs rounded-lg border border-line active:scale-90 transition mono text-[11px] flex items-center gap-1" data-value="${p.protocol}://${p.address}">
            <i class="fa-regular fa-copy text-[10px]"></i> Copy
          </button>
        </div>

        <div class="flex items-center justify-between text-[10px] text-steel-400 pt-1.5 border-t border-line/60 gap-2">
          <div class="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
            <span class="font-bold uppercase tracking-wider px-2 py-0.5 rounded text-[8.5px] ${tierBadge.class}">
              ${tierBadge.icon} ${tierBadge.label}
            </span>
            <span class="font-semibold uppercase px-1.5 py-0.5 rounded text-[8px] ${anonBadge.class}">
              ${anonBadge.label}
            </span>
            ${threatBadge}
            ${targetBadges}
            ${customUrlBadge}
          </div>
          
          <div class="flex items-center gap-1.5 shrink-0 mono">
            <span class="font-bold uppercase px-1.5 py-0.5 rounded text-[8.5px] ${protoBadgeClass}">${p.protocol}</span>
            <span class="${latencyColor} font-semibold text-[10px]">${p.latency || '<300'}ms</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function fetchSystem() {
  try {
    const res = await fetch('/api/v1/status');
    if (res.ok) {
      const data = await res.json();
      state.system = data.status || data;
    }
  } catch (err) {}
}

async function fetchStats() {
  try {
    const res = await fetch('/api/v1/stats');
    if (res.ok) {
      const data = await res.json();
      state.stats = data;
      const sourcesEl = document.getElementById('stat-sources');
      if (sourcesEl && data.total_sources !== undefined) {
        sourcesEl.textContent = data.total_sources;
      }
    }
  } catch (err) {}
}

async function fetchProxies() {
  try {
    const res = await fetch('/api/proxies');
    if (res.ok) {
      state.allProxies = await res.json();
    }
  } catch (err) {}
}

async function fetchAllLive() {
  await Promise.all([fetchSystem(), fetchStats(), fetchProxies()]);
  updateLiveDOM();
}

renderInitialSkeleton();
fetchAllLive();

setInterval(() => {
  fetchAllLive();
}, 5000);

setInterval(() => {
  const nextEl = document.getElementById('txt-next-harvest');
  if (nextEl) {
    const isRunning = state.system.state === 'RUNNING';
    nextEl.textContent = getNextUpdateFormatted(state.system.next_harvest_time, isRunning);
  }
}, 1000);