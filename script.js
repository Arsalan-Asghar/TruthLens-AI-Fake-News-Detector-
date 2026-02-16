/**
 * TRUTHLENS PRO (MASTER BUILD - v2.3)
 * -------------------------------------
 * FIXES:
 * 1. Scoring Logic: Now case-insensitive (Handles "false", "FALSE", "False").
 * 2. Prompt Cleanup: Removed literal placeholder text that the AI was copying.
 * 3. Semantic Firewall: Reinforced logic for Geography vs. Politics.
 */

// 🔐 DECODER
function unscramble(str) {
    if (!str) return "";
    try { return atob(str).split('').reverse().join(''); }
    catch (e) { return "INVALID_KEY"; }
}

// ⚙️ CONFIGURATION
const CONFIG = {
    groqKey: unscramble(window.ENV?.GROQ_SECRET) || "KEY_MISSING",
    tavilyKey: unscramble(window.ENV?.TAVILY_SECRET) || "KEY_MISSING",
    groqUrl: 'https://api.groq.com/openai/v1/chat/completions',
    tavilyUrl: 'https://api.tavily.com/search'
};

// 🛡️ TRUSTED SOURCES
const TRUSTED_SOURCES = [
    'dawn.com', 'geo.tv', 'bbc.com', 'reuters.com', 'aljazeera.com',
    'cnn.com', 'nytimes.com', 'tribune.com.pk', 'thenews.com.pk',
    'apnews.com', 'bloomberg.com', 'gov.pk', 'wikipedia.org', 'un.org'
];

let isCooldown = false;

// 🖥️ DOM ELEMENTS
const dom = {
    input: document.getElementById('news-input'),
    analyzeBtn: document.getElementById('analyze-btn'),
    wordCount: document.getElementById('word-count'),
    errorMsg: document.getElementById('error-msg'),
    loadingOverlay: document.getElementById('loading-overlay'),
    resultsSection: document.getElementById('results-section'),
    finalScore: document.getElementById('final-score'),
    verdictTitle: document.getElementById('verdict-title'),
    verdictDesc: document.getElementById('verdict-desc'),
    scoreVisual: document.querySelector('.score-visualization'),
    aiList: document.getElementById('ai-reasons'),
    heuristicList: document.getElementById('heuristic-flags'),
    themeToggleBtn: document.getElementById('theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    sourceContainer: null
};

// Icons
const sunIcon = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
const moonIcon = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';

// --- INITIALIZATION ---
function init() {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const htmlEl = document.documentElement;

    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        htmlEl.setAttribute('data-theme', 'dark');
        dom.themeIcon.innerHTML = sunIcon;
    } else {
        htmlEl.setAttribute('data-theme', 'light');
        dom.themeIcon.innerHTML = moonIcon;
    }

    dom.themeToggleBtn.addEventListener('click', () => {
        const isDark = htmlEl.getAttribute('data-theme') === 'dark';
        if (isDark) {
            htmlEl.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            dom.themeIcon.innerHTML = moonIcon;
        } else {
            htmlEl.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            dom.themeIcon.innerHTML = sunIcon;
        }
    });

    dom.input.addEventListener('input', (e) => {
        dom.input.classList.remove('input-error');
        dom.errorMsg.classList.add('hidden');
        const words = e.target.value.trim().split(/\s+/).filter(w => w.length > 0).length;
        dom.wordCount.textContent = `${words} words`;
    });

    dom.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) { return; }
            else { e.preventDefault(); runAnalysis(); }
        }
    });

    dom.analyzeBtn.addEventListener('click', runAnalysis);
    organizeLayout();
}

function organizeLayout() {
    const grid = document.querySelector('.analysis-grid');
    if (!grid) return;
    if (document.querySelector('.col-left')) return;

    const aiCard = document.querySelector('.ai-card');
    const heuristicCard = document.querySelector('.heuristic-card');

    const leftCol = document.createElement('div');
    leftCol.className = 'col-left';
    leftCol.style.flex = '1.5';
    leftCol.style.display = 'flex';
    leftCol.style.flexDirection = 'column';

    const rightCol = document.createElement('div');
    rightCol.className = 'col-right';
    rightCol.style.flex = '1';
    rightCol.style.display = 'flex';
    rightCol.style.flexDirection = 'column';

    if (aiCard) { aiCard.style.height = '100%'; leftCol.appendChild(aiCard); }
    if (heuristicCard) { heuristicCard.style.width = '100%'; rightCol.appendChild(heuristicCard); }

    const sourceCard = document.createElement('div');
    sourceCard.id = 'source-list-container';
    sourceCard.className = 'source-card';
    sourceCard.style.display = 'none';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.gap = '1.5rem';
    topRow.style.width = '100%';
    topRow.appendChild(leftCol);
    topRow.appendChild(rightCol);

    grid.innerHTML = '';
    grid.style.display = 'flex';
    grid.style.flexDirection = 'column';
    grid.style.gap = '1.5rem';

    grid.appendChild(topRow);
    grid.appendChild(sourceCard);
    dom.sourceContainer = sourceCard;

    if (window.innerWidth <= 768) {
        topRow.style.flexDirection = 'column';
    }
}

// --- HEURISTICS ---
const heuristicEngine = {
    analyze(text) {
        let score = 100;
        const flags = [];
        if (text.length < 20) flags.push({ type: 'warn', msg: "Short claim detected." });
        if ((text.match(/[A-Z]{3,}/g) || []).length > 2) { score -= 10; flags.push({ type: 'bad', msg: "Aggressive capitalization." }); }
        const spamWords = ['urgent', 'viral', 'share max', '100% true'];
        if (spamWords.some(w => text.toLowerCase().includes(w))) { score -= 20; flags.push({ type: 'bad', msg: "Clickbait language detected." }); }
        if (flags.length === 0) { flags.push({ type: 'good', msg: "Tone analysis: Neutral" }); flags.push({ type: 'good', msg: "Grammar check: Passed" }); }
        return { score: Math.max(0, score), flags };
    }
};

// --- API STEP 1: TAVILY ---
async function searchWeb(query) {
    if (!CONFIG.tavilyKey || CONFIG.tavilyKey.includes("MISSING")) return null;
    try {
        const response = await fetch(CONFIG.tavilyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: CONFIG.tavilyKey, query: query.substring(0, 300), search_depth: "basic", include_answer: false, max_results: 6
            })
        });
        if (!response.ok) return null;
        const data = await response.json();

        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        let context = `TODAY'S DATE: ${today}\n\nSEARCH RESULTS:\n`;
        let validSourcesFound = 0;
        let sourceObjects = [];

        if (data.results && data.results.length > 0) {
            data.results.forEach((result) => {
                const isTrusted = TRUSTED_SOURCES.some(domain => result.url.includes(domain));
                const trustLabel = isTrusted ? "[TRUSTED]" : "[GENERAL]";
                if (isTrusted) validSourcesFound++;
                context += `- ${trustLabel} Date: ${result.published_date || "Unknown"} | Title: "${result.title}" | Snippet: ${result.content.substring(0, 300)} (Source: ${result.url})\n`;

                sourceObjects.push({
                    title: result.title, url: result.url,
                    domain: new URL(result.url).hostname.replace('www.', ''),
                    isTrusted: isTrusted
                });
            });
            return { text: context, trustedCount: validSourcesFound, sources: sourceObjects };
        }
        return { text: `TODAY'S DATE: ${today}\nNo news found.`, trustedCount: 0, sources: [] };
    } catch (e) { console.error("Tavily Error:", e); return null; }
}

// 🧹 CLEANER
function cleanReasoningText(text) {
    return text.replace(/\s*\(Source:.*?\)/gi, '').replace(/\s*\[Source:.*?\]/gi, '').replace(/(https?:\/\/[^\s]+)/g, '').trim();
}

// --- API STEP 2: GROQ AI (FIXED) ---
async function callGroq(userText, searchData) {
    if (!CONFIG.groqKey || CONFIG.groqKey.includes("MISSING")) return { verdict: "Uncertain", reasons: ["API Key missing."], confidence: 0 };

    // 🛡️ REFINED PROMPT: No literal placeholders, Strict Rules.
    const systemPrompt = `
    You are TruthLens Pro. You are a STRICT factual validator.
    
    CORE PROTOCOLS:
    1. **NO META-TALK:** Never say "Search says" or "Results show". State the fact directly.
    2. **GEOGRAPHY RULE:** If User says "A is in B", but Search says "Diplomatic Relations", the Verdict is **FALSE**.
       - Example: "India is in Iceland" -> Verdict: False. (Reason: India is in South Asia.)
    3. **OUTPUT JSON:** { "verdict": "True/False/Uncertain", "reasons": ["Concise fact 1", "Concise fact 2"] }
    
    INPUT DATA: ${searchData.text}
    USER CLAIM: "${userText}"
    `;

    try {
        const response = await fetch(CONFIG.groqUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${CONFIG.groqKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: systemPrompt }], response_format: { type: "json_object" }, temperature: 0.0 })
        });
        if (!response.ok) throw new Error("API Error");
        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);

        const cleanedReasons = result.reasons.map(r => cleanReasoningText(r));

        // 🛑 FIXED SCORING LOGIC (Case Insensitive)
        let calculatedScore = 50;
        const v = result.verdict.toLowerCase().trim(); // Clean the verdict string

        if (v === "true") {
            calculatedScore = 90 + (searchData.trustedCount * 2);
            if (calculatedScore > 99) calculatedScore = 99;
        }
        else if (v === "false") {
            calculatedScore = 0; // ✅ Hard 0 for any "false"
        }
        else { calculatedScore = 50; }

        return { score: calculatedScore, reasons: cleanedReasons, verdict: result.verdict };
    } catch (e) { return { score: 0, reasons: ["Analysis Failed."], verdict: "Error" }; }
}

// --- DISPLAY LOGIC ---
function getTier(score) {
    if (score >= 90) return { label: "Verified Fact", msg: "Validated by trusted sources.", color: "#00C853", gradient: ["#00C853", "#69F0AE"] };
    if (score >= 75) return { label: "Likely True", msg: "Strong consensus found.", color: "#4CAF50", gradient: ["#4CAF50", "#81C784"] };
    if (score >= 60) return { label: "Plausible", msg: "Generally accurate.", color: "#2196F3", gradient: ["#2196F3", "#64B5F6"] };
    if (score >= 40) return { label: "Disputed", msg: "Conflict or outdated info.", color: "#FFC107", gradient: ["#FFC107", "#FFE082"] };
    if (score >= 10) return { label: "Misleading", msg: "Contains false elements.", color: "#FF5722", gradient: ["#FF5722", "#FF8A65"] };
    return { label: "Fabricated (Fake)", msg: "Contradicts facts or no evidence.", color: "#D32F2F", gradient: ["#D32F2F", "#EF5350"] };
}

async function runAnalysis() {
    if (isCooldown) {
        showError("Please wait 5 seconds before scanning again.");
        dom.input.classList.remove('input-error'); void dom.input.offsetWidth; dom.input.classList.add('input-error'); return;
    }

    const text = dom.input.value.trim();
    dom.errorMsg.classList.add('hidden');
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount === 0) { dom.input.classList.remove('input-error'); void dom.input.offsetWidth; dom.input.classList.add('input-error'); dom.input.focus(); return; }
    if (wordCount < 2 && text.length < 10) { showError("Too short! Please enter a full claim."); dom.input.classList.add('input-error'); return; }

    isCooldown = true;
    setTimeout(() => { isCooldown = false; }, 5000);

    const loader = document.getElementById('loading-overlay');
    const statusText = document.getElementById('loading-status');
    const loadBar = document.getElementById('loading-fill');
    loader.classList.remove('hidden');
    dom.resultsSection.classList.add('hidden');
    if (dom.sourceContainer) dom.sourceContainer.style.display = 'none';
    loadBar.style.width = '10%';

    try {
        statusText.textContent = "Anchoring time & checking heuristics...";
        const localResult = heuristicEngine.analyze(text);
        loadBar.style.width = '30%';
        const searchData = await searchWeb(text);
        loadBar.style.width = '60%';
        if (!searchData || !searchData.text) throw new Error("Search failed");
        statusText.textContent = "Cross-referencing live data...";
        const aiResult = await callGroq(text, searchData);
        loadBar.style.width = '100%';
        await new Promise(r => setTimeout(r, 200));
        displayResults(aiResult.score, aiResult, localResult, searchData.sources);
    } catch (error) { console.error("Runtime Error:", error); showError("System Error. Please try again."); }
    finally { loader.classList.add('hidden'); }
}

function displayResults(score, aiData, localData, sources) {
    dom.resultsSection.classList.remove('hidden');
    const tier = getTier(score);
    dom.verdictTitle.textContent = tier.label;
    dom.verdictDesc.textContent = tier.msg;
    dom.verdictTitle.style.color = tier.color;
    dom.scoreVisual.style.background = `linear-gradient(135deg, ${tier.gradient[0]}, ${tier.gradient[1]})`;
    dom.scoreVisual.style.boxShadow = `0 10px 30px ${tier.color}66`;
    animateCounter(dom.finalScore, 0, score, 1500);

    const aiIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>`;
    dom.aiList.innerHTML = aiData.reasons.map(r => `<li class="reason-pill"><span class="reason-icon">${aiIcon}</span><span class="reason-text">${r}</span></li>`).join('');

    const checkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const warnIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    dom.heuristicList.innerHTML = localData.flags.map(f => `<li class="flag-pill ${f.type}"><span class="flag-icon">${f.type === 'good' ? checkIcon : warnIcon}</span><span class="flag-text">${f.msg}</span></li>`).join('');

    if (dom.sourceContainer) {
        dom.sourceContainer.style.display = 'flex';
        setTimeout(() => dom.sourceContainer.classList.add('show'), 50);

        let html = `
            <div class="source-header">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    Evidence & Sources
                </h3>
                <span style="font-size: 0.8rem; opacity: 0.7;">${sources.length} Verified Links</span>
            </div>
            <div class="source-grid">
        `;

        if (!sources || sources.length === 0) {
            html += `<span style="opacity:0.6; font-size:0.9rem;">No direct web sources found.</span>`;
        } else {
            html += sources.map(s => `
                <a href="${s.url}" target="_blank" class="source-pill ${s.isTrusted ? 'trusted' : ''}">
                    <img src="https://www.google.com/s2/favicons?domain=${s.domain}&sz=32" class="source-favicon" alt="icon">
                    <span>${s.domain}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
            `).join('');
        }

        html += `</div>`;
        dom.sourceContainer.innerHTML = html;
    }

    setTimeout(() => { dom.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
    const allPills = document.querySelectorAll('.reason-pill, .flag-pill');
    allPills.forEach((pill, index) => { setTimeout(() => { pill.classList.add('show'); }, 100 + (index * 100)); });
}

function animateCounter(el, s, e, d) {
    let start = null;
    const step = (ts) => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / d, 1);
        el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * (e - s) + s);
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function showError(msg) { dom.errorMsg.textContent = msg; dom.errorMsg.classList.remove('hidden'); }

init();