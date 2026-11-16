// server/src/services/retriever.js
// Small, dependency-free TF-IDF retriever with cosine similarity and synonym
// normalisation. It underpins evidence-grounded claim checking and runs fully
// locally, so restricted facts never leave the server.

const STOP_WORDS = new Set(
  `a an and are as at be been being but by can could did do does for from had has have he her here hers him his how i if in into is it its just me more most my no nor not of on or our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which who why will with would you your yours`.split(
    /\s+/
  )
);

const SYNONYMS = {
  fastest: ['quickest', 'speediest', 'fast', 'fastest'],
  quickest: ['fastest', 'speediest', 'fast'],
  cheapest: ['lowest', 'most affordable', 'affordable', 'cheap'],
  affordable: ['cheap', 'low cost', 'cheapest'],
  best: ['leading', 'top', 'finest', 'number one'],
  leading: ['best', 'top', 'number one'],
  largest: ['biggest', 'most', 'huge'],
  biggest: ['largest', 'most', 'huge'],
  increase: ['grow', 'rise', 'up', 'grew', 'increased'],
  grow: ['increase', 'rise', 'grew'],
  decrease: ['reduce', 'fall', 'drop', 'lower', 'decreased'],
  reduce: ['decrease', 'cut', 'lower'],
  customers: ['clients', 'users', 'members'],
  clients: ['customers', 'users', 'members'],
  users: ['customers', 'clients', 'members'],
  employees: ['staff', 'team', 'people'],
  staff: ['employees', 'team', 'people'],
  certified: ['accredited', 'certification', 'certificate'],
  secure: ['safe', 'security', 'protected'],
  guaranteed: ['guarantee', 'guarantees', 'promise'],
  free: ['no cost', 'complimentary', 'zero cost'],
  launch: ['launched', 'released', 'release', 'introduced'],
  founded: ['established', 'started', 'founded in'],
  revenue: ['turnover', 'sales', 'income'],
  worldwide: ['global', 'internationally', 'around the world'],
  global: ['worldwide', 'international'],
};

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1000000,
  billion: 1000000000,
};

export function normaliseText(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9%$€£.,\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenise(text = '') {
  const normalised = normaliseText(text);
  const tokens = normalised
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOP_WORDS.has(t));
  const expanded = [];
  for (const token of tokens) {
    expanded.push(token);
    for (const syn of SYNONYMS[token] || []) {
      expanded.push(normaliseText(syn).replace(/\s+/g, '_'));
    }
  }
  return expanded;
}

export function extractNumbers(text = '') {
  const numbers = new Set();
  const raw = String(text).toLowerCase();

  for (const match of raw.matchAll(/\$?\s?(\d+(?:[.,]\d+)?)\s?(%|percent|million|billion|k)?/g)) {
    const value = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    let scaled = value;
    if (match[2] === 'million') scaled = value * 1_000_000;
    else if (match[2] === 'billion') scaled = value * 1_000_000_000;
    else if (match[2] === 'k') scaled = value * 1_000;
    numbers.add(Math.round(scaled * 1000) / 1000);
    numbers.add(Math.round(value * 1000) / 1000);
    if (match[2] === '%' || match[2] === 'percent') numbers.add(`pct:${value}`);
  }

  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    const re = new RegExp(`\\b${word}\\b`, 'g');
    if (re.test(raw)) numbers.add(value);
  }

  for (const match of raw.matchAll(/\b(19|20)\d{2}\b/g)) {
    numbers.add(Number(match[0]));
  }
  return [...numbers];
}

export class Retriever {
  constructor(documents = []) {
    this.docs = documents;
    this.buildIndex();
  }

  buildIndex() {
    this.N = this.docs.length;
    this.df = new Map();
    this.docTerms = [];
    this.docLengths = [];

    for (const doc of this.docs) {
      const tokens = tokenise(`${doc.statement || ''} ${(doc.tags || []).join(' ')}`);
      const termFreq = new Map();
      for (const token of tokens) termFreq.set(token, (termFreq.get(token) || 0) + 1);
      this.docTerms.push(termFreq);
      this.docLengths.push(tokens.length || 1);
      for (const term of new Set(tokens)) this.df.set(term, (this.df.get(term) || 0) + 1);
    }

    this.avgLength =
      this.docLengths.reduce((sum, n) => sum + n, 0) / Math.max(1, this.docLengths.length) || 1;
    this.idf = new Map();
    for (const [term, df] of this.df) {
      this.idf.set(term, Math.log(1 + (this.N - df + 0.5) / (df + 0.5)));
    }
  }

  bm25Weight(term, tf, docLength) {
    const k1 = 1.5;
    const b = 0.75;
    const idf = this.idf.get(term) || 0;
    return idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / this.avgLength))));
  }

  scoreDocument(queryTokens, index) {
    const tf = this.docTerms[index];
    let dot = 0;
    let qNorm = 0;
    let dNorm = 0;
    const seen = new Set();
    for (const token of queryTokens) {
      if (seen.has(token)) continue;
      seen.add(token);
      const idf = this.idf.get(token) || 0.0001;
      const qWeight = idf;
      const dWeight = this.bm25Weight(token, tf.get(token) || 0, this.docLengths[index]);
      dot += qWeight * dWeight;
      qNorm += qWeight * qWeight;
      dNorm += dWeight * dWeight;
    }
    if (!qNorm || !dNorm) return 0;
    return dot / (Math.sqrt(qNorm) * Math.sqrt(dNorm));
  }

  search(query, k = 4) {
    const queryTokens = tokenise(query);
    if (!queryTokens.length || !this.N) return [];
    return this.docs
      .map((doc, index) => ({
        doc,
        score: this.scoreDocument(queryTokens, index),
        index,
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
