/* Hand evaluation: high hands (standard + short deck), 8-or-better lows,
   Omaha "exactly two" rules, readable names and showdown explanations. */
(function (PK) {
  'use strict';
  const RANKS = '23456789TJQKA';
  const SUITS = 'cdhs';
  const RNAME = [, , 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  const RPLUR = [, , 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

  // card string 'As' <-> int (rank<<2 | suit), rank 2..14
  function toInt(c) { return ((RANKS.indexOf(c[0]) + 2) << 2) | SUITS.indexOf(c[1]); }
  function toStr(i) { return RANKS[(i >> 2) - 2] + SUITS[i & 3]; }
  const rankOf = (i) => i >> 2;
  const suitOf = (i) => i & 3;

  // Category ids are semantic; ORDER maps them to strength per mode.
  const CAT = { HIGH: 0, PAIR: 1, TWO: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL: 6, QUADS: 7, SF: 8 };
  const CAT_NAME = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
  const ORDER_STD = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  // Short deck: flush beats full house, three of a kind beats straight.
  const ORDER_SHORT = [0, 1, 2, 4, 3, 6, 5, 7, 8];

  // Evaluate exactly five int cards. Returns numeric score (higher wins).
  // Encodes: strength*15^5 + tiebreak ranks. cat id kept in low bits via table lookups by callers.
  function eval5(a, b, c, d, e, short) {
    const r = [a >> 2, b >> 2, c >> 2, d >> 2, e >> 2];
    const flush = ((a & 3) === (b & 3)) && ((a & 3) === (c & 3)) && ((a & 3) === (d & 3)) && ((a & 3) === (e & 3));
    r.sort((x, y) => y - x);
    // counts
    let cat, tb;
    const uniq = r[0] !== r[1] && r[1] !== r[2] && r[2] !== r[3] && r[3] !== r[4];
    if (uniq) {
      let straightHigh = 0;
      if (r[0] - r[4] === 4) straightHigh = r[0];
      else if (!short && r[0] === 14 && r[1] === 5 && r[4] === 2) straightHigh = 5; // wheel A2345
      else if (short && r[0] === 14 && r[1] === 9 && r[4] === 6) straightHigh = 9; // A6789
      if (straightHigh && flush) { cat = CAT.SF; tb = [straightHigh, 0, 0, 0, 0]; }
      else if (flush) { cat = CAT.FLUSH; tb = r; }
      else if (straightHigh) { cat = CAT.STRAIGHT; tb = [straightHigh, 0, 0, 0, 0]; }
      else { cat = CAT.HIGH; tb = r; }
    } else {
      // group by count desc, then rank desc
      const m = new Map();
      for (const x of r) m.set(x, (m.get(x) || 0) + 1);
      const g = [...m.entries()].sort((p, q) => q[1] - p[1] || q[0] - p[0]);
      if (g[0][1] === 4) { cat = CAT.QUADS; tb = [g[0][0], g[1][0], 0, 0, 0]; }
      else if (g[0][1] === 3 && g[1][1] === 2) { cat = CAT.FULL; tb = [g[0][0], g[1][0], 0, 0, 0]; }
      else if (g[0][1] === 3) { cat = flush ? CAT.FLUSH : CAT.TRIPS; tb = flush ? r : [g[0][0], g[1][0], g[2][0], 0, 0]; }
      else if (g[0][1] === 2 && g[1][1] === 2) { cat = flush ? CAT.FLUSH : CAT.TWO; tb = flush ? r : [g[0][0], g[1][0], g[2][0], 0, 0]; }
      else { cat = flush ? CAT.FLUSH : CAT.PAIR; tb = flush ? r : [g[0][0], g[1][0], g[2][0], g[3][0], 0]; }
    }
    const strength = (short ? ORDER_SHORT : ORDER_STD)[cat];
    return ((((strength * 15 + tb[0]) * 15 + tb[1]) * 15 + tb[2]) * 15 + tb[3]) * 15 + tb[4] + cat / 10;
  }
  // score layout: integer part = comparable value; fractional .x = category id (for naming)
  const catOfScore = (s) => Math.round((s - Math.floor(s)) * 10);

  const COMB = {};
  function combos(n, k) {
    const key = n + ',' + k;
    if (COMB[key]) return COMB[key];
    const out = [];
    const cur = [];
    (function rec(start) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = start; i < n; i++) { cur.push(i); rec(i + 1); cur.pop(); }
    })(0);
    return (COMB[key] = out);
  }

  // Best high hand. mode: 'any' (best 5 of all) or 'omaha' (exactly 2 hole + 3 board)
  function bestHigh(hole, board, mode, short) {
    let best = -1, bestSet = null;
    if (mode === 'omaha') {
      if (board.length < 3) return null;
      const hc = combos(hole.length, 2), bc = combos(board.length, 3);
      for (const h of hc) for (const b of bc) {
        const s = eval5(hole[h[0]], hole[h[1]], board[b[0]], board[b[1]], board[b[2]], short);
        if (s > best) { best = s; bestSet = [hole[h[0]], hole[h[1]], board[b[0]], board[b[1]], board[b[2]]]; }
      }
    } else {
      const all = hole.concat(board);
      if (all.length < 5) return null;
      for (const c of combos(all.length, 5)) {
        const s = eval5(all[c[0]], all[c[1]], all[c[2]], all[c[3]], all[c[4]], short);
        if (s > best) { best = s; bestSet = c.map((i) => all[i]); }
      }
    }
    return { score: best, cards: bestSet };
  }

  // Fast score only (bots / equity)
  function scoreHigh(hole, board, mode, short) {
    let best = -1;
    if (mode === 'omaha') {
      const hc = combos(hole.length, 2), bc = combos(board.length, 3);
      for (const h of hc) for (const b of bc) {
        const s = eval5(hole[h[0]], hole[h[1]], board[b[0]], board[b[1]], board[b[2]], short);
        if (s > best) best = s;
      }
    } else {
      const all = hole.concat(board);
      const cs = combos(all.length, 5);
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        const s = eval5(all[c[0]], all[c[1]], all[c[2]], all[c[3]], all[c[4]], short);
        if (s > best) best = s;
      }
    }
    return Math.floor(best);
  }

  // 8-or-better low, Omaha rules. Returns {score, ranks, cards} with LOWER score better, or null.
  function bestLow(hole, board) {
    if (board.length < 3) return null;
    let best = null;
    const hc = combos(hole.length, 2), bc = combos(board.length, 3);
    for (const h of hc) for (const b of bc) {
      const cards = [hole[h[0]], hole[h[1]], board[b[0]], board[b[1]], board[b[2]]];
      const rs = cards.map((c) => { const r = c >> 2; return r === 14 ? 1 : r; });
      if (rs.some((x) => x > 8)) continue;
      if (new Set(rs).size !== 5) continue;
      rs.sort((x, y) => y - x);
      const score = (((rs[0] * 9 + rs[1]) * 9 + rs[2]) * 9 + rs[3]) * 9 + rs[4];
      if (!best || score < best.score) best = { score, ranks: rs, cards };
    }
    return best;
  }

  function tiebreakOf(score) {
    let v = Math.floor(score);
    const tb = [];
    for (let i = 0; i < 5; i++) { tb.unshift(v % 15); v = Math.floor(v / 15); }
    return tb; // [t0..t4]
  }

  function nameHigh(score) {
    const cat = catOfScore(score);
    const t = tiebreakOf(score);
    switch (cat) {
      case CAT.SF: return t[0] === 14 ? 'Royal flush' : 'Straight flush, ' + RNAME[t[0]] + ' high';
      case CAT.QUADS: return 'Four of a kind, ' + RPLUR[t[0]];
      case CAT.FULL: return 'Full house, ' + RPLUR[t[0]] + ' full of ' + RPLUR[t[1]];
      case CAT.FLUSH: return 'Flush, ' + RNAME[t[0]] + ' high';
      case CAT.STRAIGHT: return 'Straight, ' + RNAME[t[0]] + ' high';
      case CAT.TRIPS: return 'Three of a kind, ' + RPLUR[t[0]];
      case CAT.TWO: return 'Two pair, ' + RPLUR[t[0]] + ' and ' + RPLUR[t[1]];
      case CAT.PAIR: return 'Pair of ' + RPLUR[t[0]];
      default: return 'High card, ' + RNAME[t[0]];
    }
  }
  function nameLow(low) {
    if (!low) return 'No qualifying low';
    const n = low.ranks.map((r) => (r === 1 ? 'A' : String(r)));
    return n.join('-') + ' low';
  }

  // Explain why hand A (winner) beats hand B. Returns a sentence fragment.
  function explainHigh(sa, sb) {
    const ca = catOfScore(sa), cb = catOfScore(sb);
    if (Math.floor(sa) === Math.floor(sb)) return 'Exactly the same five-card strength, so the pot is split.';
    if (ca !== cb) return CAT_NAME[ca] + ' beats ' + CAT_NAME[cb].toLowerCase() + '.';
    const ta = tiebreakOf(sa), tb = tiebreakOf(sb);
    let i = 0;
    while (i < 5 && ta[i] === tb[i]) i++;
    const A = RNAME[ta[i]], B = RNAME[tb[i]];
    const both = 'Both have ' + nameHigh(sb).replace(/^(\w)/, (m) => m.toLowerCase()).replace(/^royal/, 'a royal');
    switch (ca) {
      case CAT.PAIR: return i === 0 ? 'Higher pair: ' + RPLUR[ta[0]] + ' beat ' + RPLUR[tb[0]] + '.' : 'Same pair; kicker decides: ' + A + ' beats ' + B + '.';
      case CAT.TWO: return i === 0 ? 'Higher top pair: ' + RPLUR[ta[0]] + ' beat ' + RPLUR[tb[0]] + '.' : i === 1 ? 'Same top pair; second pair decides: ' + RPLUR[ta[1]] + ' beat ' + RPLUR[tb[1]] + '.' : 'Same two pair; kicker decides: ' + A + ' beats ' + B + '.';
      case CAT.TRIPS: return i === 0 ? 'Higher three of a kind: ' + RPLUR[ta[0]] + ' beat ' + RPLUR[tb[0]] + '.' : 'Same trips; kicker decides: ' + A + ' beats ' + B + '.';
      case CAT.QUADS: return i === 0 ? 'Higher quads.' : 'Same quads; kicker decides: ' + A + ' beats ' + B + '.';
      case CAT.FULL: return i === 0 ? 'Higher full house: three ' + RPLUR[ta[0]] + ' beat three ' + RPLUR[tb[0]] + '.' : 'Same three of a kind in the full house; the pair decides: ' + RPLUR[ta[1]] + ' beat ' + RPLUR[tb[1]] + '.';
      case CAT.STRAIGHT: case CAT.SF: return 'Higher straight: ' + A + ' high beats ' + B + ' high.';
      case CAT.FLUSH: case CAT.HIGH: return (i === 0 ? 'Higher top card: ' : 'Top cards match; card #' + (i + 1) + ' decides: ') + A + ' beats ' + B + '.';
    }
    return both;
  }

  function sortCardsForShow(cards) { return cards.slice().sort((a, b) => (b >> 2) - (a >> 2)); }

  PK.RANKS = RANKS; PK.SUITS = SUITS; PK.RNAME = RNAME; PK.RPLUR = RPLUR;
  PK.toInt = toInt; PK.toStr = toStr; PK.rankOf = rankOf; PK.suitOf = suitOf;
  PK.CAT = CAT; PK.CAT_NAME = CAT_NAME; PK.catOfScore = catOfScore;
  PK.eval5 = eval5; PK.bestHigh = bestHigh; PK.scoreHigh = scoreHigh; PK.bestLow = bestLow;
  PK.nameHigh = nameHigh; PK.nameLow = nameLow; PK.explainHigh = explainHigh; PK.combos = combos;
  PK.sortCardsForShow = sortCardsForShow; PK.tiebreakOf = tiebreakOf;
})(typeof window !== 'undefined' ? (window.PK = window.PK || {}) : (globalThis.PK = globalThis.PK || {}));

/* Game engine: pure, deterministic given a deck. Runs on the dealer (host) device.
   Handles all community-card variants, NL/PL/FL betting, blinds, antes, straddles,
   bomb pots, side pots, run it twice, double board, hi-lo splits, 7-2 bounty, rabbit hunt. */
(function (PK) {
  'use strict';
  const VARIANTS = {
    nlhe: { id: 'nlhe', name: "Texas Hold'em", short: "Hold'em", hole: 2, mode: 'any', deck: 'full', lim: 'nl' },
    plo: { id: 'plo', name: 'Omaha', short: 'Omaha', hole: 4, mode: 'omaha', deck: 'full', lim: 'pl' },
    plo5: { id: 'plo5', name: '5-Card Omaha', short: 'PLO5', hole: 5, mode: 'omaha', deck: 'full', lim: 'pl' },
    plo8: { id: 'plo8', name: 'Omaha Hi-Lo', short: 'O8', hole: 4, mode: 'omaha', deck: 'full', lim: 'pl', hilo: true },
    short: { id: 'short', name: 'Short Deck', short: '6+', hole: 2, mode: 'any', deck: 'short', lim: 'nl' },
    pine: { id: 'pine', name: 'Crazy Pineapple', short: 'Pineapple', hole: 3, mode: 'any', deck: 'full', lim: 'nl', discard: true },
  };
  const LIMIT_NAME = { nl: 'No-Limit', pl: 'Pot-Limit', fl: 'Limit' };

  function makeDeck(kind) {
    const out = [];
    for (const s of PK.SUITS) for (const r of PK.RANKS) {
      if (kind === 'short' && '2345'.includes(r)) continue;
      out.push(r + s);
    }
    return out;
  }

  // Split an integer amount into n parts; remainder goes to the first parts.
  function splitInt(amount, n) {
    const base = Math.floor(amount / n), rem = amount - base * n;
    const out = [];
    for (let i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }

  class Game {
    constructor(cfg) {
      this.cfg = cfg;
      this.seats = new Array(cfg.seats).fill(null);
      this.button = -1;
      this.handNo = 0;
      this.h = null;
      this.evs = [];
      this.evId = 0;
    }

    ev(k, data) {
      const e = Object.assign({ i: ++this.evId, k }, data || {});
      this.evs.push(e);
      if (this.evs.length > 80) this.evs.shift();
      return e;
    }

    eligible(i) {
      const s = this.seats[i];
      return !!(s && s.stack > 0 && !s.sitOut && !s.leaving);
    }
    eligibleSeats() {
      const out = [];
      for (let i = 0; i < this.seats.length; i++) if (this.eligible(i)) out.push(i);
      return out;
    }
    canStart() { return this.eligibleSeats().length >= 2; }

    nextSeat(from, pred) {
      const n = this.seats.length;
      for (let k = 1; k <= n; k++) {
        const i = (((from + k) % n) + n) % n;
        if (pred(i)) return i;
      }
      return -1;
    }

    // ---------- hand lifecycle ----------
    startHand(deck, opts) {
      opts = opts || {};
      const cfg = this.cfg;
      const elig = this.eligibleSeats();
      if (elig.length < 2) throw new Error('Need at least two players with chips');
      this.handNo++;
      if (this.button < 0 || opts.button != null) this.button = opts.button != null ? opts.button : elig[0];
      else if (elig.length === 2 && (this.prevCount || 0) > 2 && this.lastBB != null && this.eligible(this.lastBB)) this.button = this.lastBB;
      else this.button = this.nextSeat(this.button, (i) => this.eligible(i));

      const game = opts.game || cfg.game;
      const V = VARIANTS[game] || VARIANTS.nlhe;
      const lim = opts.lim || cfg.lim || V.lim;
      const sb = opts.sb != null ? opts.sb : cfg.sb;
      const bb = opts.bb != null ? opts.bb : cfg.bb;
      const ante = opts.ante != null ? opts.ante : cfg.ante;
      const deckLen = makeDeck(V.deck).length;
      const double = !!cfg.double && !V.discard && elig.length * V.hole + 10 <= deckLen;
      const order = [];
      let cur = this.button;
      for (let k = 0; k < elig.length; k++) { cur = this.nextSeat(cur, (i) => this.eligible(i)); order.push(cur); }

      const h = this.h = {
        no: this.handNo, game, V, lim, sb, bb, ante, deck, pos: 0,
        pl: {}, order, boards: double ? [[], []] : [[]], double,
        street: 'pre', phase: 'bet', toAct: -1, turnId: 0, cur: 0, lastRaise: bb,
        fullRaises: 0, betsCount: 0, bomb: !!opts.bomb, runs: 1, ritDecided: false,
        startStacks: {}, shown: {}, results: null, expl: [], discarded: false,
        lastAggressor: -1, streetAggressor: -1, uncontested: -1, bountyPaid: false, dead: 0,
        log: [], sbSeat: -1, bbSeat: -1, strSeat: -1, burned: [],
      };
      for (const s of order) {
        h.pl[s] = { s, hole: [], folded: false, allin: false, bet: 0, total: 0, acted: false, lastFR: -1, vpip: false, pfr: false, discard: null, last: '' };
        h.startStacks[s] = this.seats[s].stack;
        this.seats[s].last = '';
      }
      this.ev('hand', { no: h.no, btn: this.button, game, lim });

      // ---- forced bets
      if (h.bomb) {
        const amt = opts.bombAmt || cfg.bombAmt || bb * 2;
        for (const s of order) this.post(s, amt, 'bomb', true);
      } else {
        if (ante > 0 && !cfg.bbAnte) for (const s of order) this.post(s, ante, 'ante', true);
        const heads = order.length === 2;
        const sbSeat = heads ? this.button : order[0];
        const bbSeat = heads ? order[0] : order[1];
        h.sbSeat = sbSeat; h.bbSeat = bbSeat;
        this.post(sbSeat, sb, 'sb');
        this.post(bbSeat, bb, 'bb');
        // big blind ante: posted after the blind (the blind has priority) as dead money for the main pot
        if (ante > 0 && cfg.bbAnte) this.postDead(bbSeat, ante * order.length);
        h.cur = bb; h.lastRaise = bb; h.betsCount = 1;
        if (cfg.straddle && order.length >= 4) {
          const st = this.nextInHand(bbSeat);
          h.strSeat = st;
          this.post(st, bb * 2, 'straddle');
          h.cur = bb * 2; h.lastRaise = lim === 'fl' ? bb : bb * 2; h.betsCount = 2;
        }
      }

      this.prevCount = order.length; this.lastBB = h.bbSeat >= 0 ? h.bbSeat : null;
      // ---- deal hole cards one at a time, starting left of the button
      for (let r = 0; r < V.hole; r++) for (const s of order) h.pl[s].hole.push(deck[h.pos++]);
      this.ev('deal', { n: V.hole, order: order.slice() });

      if (h.bomb) {
        // no preflop betting: straight to the flop
        this.dealStreet('flop');
        h.street = 'flop';
        this.beginBetting();
      } else {
        const after = h.strSeat >= 0 ? h.strSeat : h.bbSeat;
        h.toAct = order.length === 2 ? h.sbSeat : this.nextInHand(after);
        if (!this.needsAction(h.pl[h.toAct])) {
          const n = this.findNext(h.toAct, true);
          if (n < 0) return this.endStreet();
          h.toAct = n;
        }
        h.turnId++;
      }
      return h;
    }

    post(s, amt, what, dead) {
      const h = this.h, seat = this.seats[s], p = h.pl[s];
      const a = Math.min(amt, seat.stack);
      seat.stack -= a;
      if (!dead) p.bet += a;
      p.total += a;
      if (seat.stack === 0) p.allin = true;
      this.ev('post', { s, a, what });
      return a;
    }

    postDead(s, amt) {
      const h = this.h, seat = this.seats[s];
      const a = Math.min(amt, seat.stack);
      seat.stack -= a; h.dead += a;
      if (seat.stack === 0) h.pl[s].allin = true;
      this.ev('post', { s, a, what: 'ante' });
      return a;
    }

    nextInHand(from) {
      const h = this.h;
      return this.nextSeat(from, (i) => !!h.pl[i]);
    }

    livePlayers() { return Object.values(this.h.pl).filter((p) => !p.folded); }

    // Max bet among other non-folded players
    othersState(p) {
      let canAct = false, maxBet = 0;
      for (const o of Object.values(this.h.pl)) {
        if (o === p || o.folded) continue;
        if (!o.allin) canAct = true;
        if (o.bet > maxBet) maxBet = o.bet;
      }
      return { canAct, maxBet };
    }

    needsAction(p) {
      if (!p || p.folded || p.allin) return false;
      const o = this.othersState(p);
      if (!o.canAct) return p.bet < o.maxBet;
      return !p.acted || p.bet < this.h.cur;
    }

    findNext(from, includeFrom) {
      const h = this.h;
      const n = this.seats.length;
      for (let k = includeFrom ? 0 : 1; k <= n; k++) {
        const i = (from + k) % n;
        if (h.pl[i] && this.needsAction(h.pl[i])) return i;
      }
      return -1;
    }

    potTotal() { let t = this.h.dead || 0; for (const p of Object.values(this.h.pl)) t += p.total; return t; }
    betsTotal() { let t = 0; for (const p of Object.values(this.h.pl)) t += p.bet; return t; }

    legal(s) {
      const h = this.h;
      if (!h || h.phase !== 'bet' || h.toAct !== s) return null;
      const p = h.pl[s], seat = this.seats[s];
      const o = this.othersState(p);
      const effCur = o.canAct ? h.cur : Math.min(h.cur, o.maxBet);
      const toCall = Math.max(0, effCur - p.bet);
      const stack = seat.stack;
      const call = Math.min(toCall, stack);
      const check = toCall === 0;
      // A player may raise unless they already acted and only an incomplete (short all-in) raise has happened since.
      let raise = stack > toCall && o.canAct && (p.lastFR < h.fullRaises || h.cur - (p.facedCur || 0) >= h.lastRaise);
      const live = this.livePlayers().length;
      if (h.lim === 'fl' && h.betsCount >= 4 && live > 2) raise = false;
      let minTo = 0, maxTo = 0;
      if (raise) {
        const allInTo = p.bet + stack;
        if (h.lim === 'fl') {
          const size = (h.street === 'pre' || h.street === 'flop') ? h.bb : h.bb * 2;
          minTo = maxTo = Math.min(h.cur + size, allInTo);
        } else {
          minTo = h.cur === 0 ? h.bb : h.cur + Math.max(h.lastRaise, h.bb);
          maxTo = allInTo;
          if (h.lim === 'pl') maxTo = Math.min(maxTo, h.cur + this.potTotal() + toCall);
          minTo = Math.min(minTo, allInTo);
          if (maxTo < minTo) maxTo = minTo;
        }
      }
      return { s, toCall, call, check, callAllIn: call > 0 && call >= stack, raise, minTo, maxTo, isBet: h.cur === 0, stack, bet: p.bet, cur: h.cur, pot: this.potTotal() };
    }

    act(s, k, to) {
      const h = this.h;
      if (!h || h.phase !== 'bet') throw new Error('No betting right now');
      if (h.toAct !== s) throw new Error('Not your turn');
      const L = this.legal(s);
      const p = h.pl[s], seat = this.seats[s];
      if (k === 'allin') {
        // "All-in" in pot-limit / limit means the biggest raise allowed
        const allTo = Math.min(p.bet + seat.stack, L.raise ? L.maxTo : 0);
        if (L.raise && allTo > h.cur) { k = 'raise'; to = allTo; }
        else k = L.check ? 'check' : 'call';
      }
      if (k === 'call' && L.check) k = 'check';
      if (k === 'check' && !L.check) throw new Error('You cannot check, there is a bet to you');
      const pre = h.street === 'pre';
      let label = '', amount = 0;
      if (k === 'fold') {
        p.folded = true; label = 'Fold';
      } else if (k === 'check') {
        label = 'Check';
      } else if (k === 'call') {
        const a = L.call;
        seat.stack -= a; p.bet += a; p.total += a; amount = p.bet;
        if (seat.stack === 0) p.allin = true;
        label = p.allin ? 'All-in' : 'Call';
        if (pre) p.vpip = true;
      } else if (k === 'bet' || k === 'raise') {
        if (!L.raise) throw new Error('Raising is not allowed here');
        to = Math.floor(Number(to));
        const allTo = p.bet + seat.stack;
        if (!(to > h.cur)) throw new Error('Raise must be more than the current bet');
        if (to > allTo) throw new Error('Not enough chips');
        if (to !== allTo && (to < L.minTo || to > L.maxTo)) throw new Error('Raise must be between ' + L.minTo + ' and ' + L.maxTo);
        if (to === allTo && to > L.maxTo) throw new Error('Pot-limit maximum is ' + L.maxTo);
        const add = to - p.bet;
        seat.stack -= add; p.bet = to; p.total += add; amount = to;
        const size = to - h.cur;
        if (size >= h.lastRaise) {
          h.lastRaise = size; h.fullRaises++;
          if (h.lim === 'fl') h.betsCount++;
        }
        const wasBet = h.cur === 0;
        h.cur = to;
        for (const o of Object.values(h.pl)) if (o !== p && !o.folded && !o.allin) o.acted = false;
        if (seat.stack === 0) p.allin = true;
        label = p.allin ? 'All-in' : wasBet ? 'Bet' : 'Raise';
        h.lastAggressor = s; h.streetAggressor = s;
        if (pre) { p.vpip = true; p.pfr = true; }
      } else throw new Error('Unknown action');
      p.acted = true; p.lastFR = h.fullRaises; p.facedCur = h.cur;
      p.last = label; seat.last = label;
      this.ev('act', { s, t: k === 'fold' ? 'fold' : label.toLowerCase(), a: amount, st: h.street });
      h.log.push({ s, t: label, a: amount, st: h.street });
      this.afterAction(s);
      return true;
    }

    afterAction(s) {
      const h = this.h;
      if (this.livePlayers().length === 1) return this.finishUncontested();
      const nxt = this.findNext(s, false);
      if (nxt >= 0) { h.toAct = nxt; h.turnId++; return; }
      this.endStreet();
    }

    refundUncalled() {
      const h = this.h;
      const ps = Object.values(h.pl);
      let top = null, topBet = -1, second = 0;
      for (const p of ps) { if (p.bet > topBet) { second = Math.max(second, topBet); topBet = p.bet; top = p; } else if (p.bet > second) second = p.bet; }
      if (top && topBet > second) {
        const x = topBet - second;
        top.bet -= x; top.total -= x; this.seats[top.s].stack += x;
        if (this.seats[top.s].stack > 0) top.allin = false;
        this.ev('refund', { s: top.s, a: x });
      }
    }

    collectBets() {
      const h = this.h;
      let any = false;
      for (const p of Object.values(h.pl)) if (p.bet) { any = true; p.bet = 0; }
      if (any) this.ev('collect', { pot: this.potTotal() });
    }

    endStreet() {
      const h = this.h;
      this.refundUncalled();
      this.collectBets();
      h.toAct = -1;
      this.proceed();
    }

    // Decide what happens after a betting round, a discard round, or a run-it-twice decision.
    proceed() {
      const h = this.h;
      const live = this.livePlayers();
      if (live.length === 1) return this.finishUncontested();
      if (h.V.discard && h.boards[0].length >= 3 && !h.discarded && h.phase !== 'discard') {
        h.phase = 'discard'; h.toAct = -1;
        this.ev('discardStart', {});
        return;
      }
      const canAct = live.filter((p) => !p.allin).length;
      if (h.deckShort || h.boards.every((b) => b.length >= 5)) return this.showdown();
      if (canAct <= 1) {
        if (!h.ritDecided && this.ritEligible()) { h.phase = 'rit'; h.toAct = -1; return; }
        h.phase = 'runout'; h.toAct = -1;
        return;
      }
      const nextStreet = { pre: 'flop', flop: 'turn', turn: 'river' }[h.street];
      this.dealStreet(nextStreet);
      h.street = nextStreet;
      this.beginBetting();
    }

    ritEligible() {
      const h = this.h;
      const missing = 5 - h.boards[0].length;
      const enough = h.deck.length - h.pos >= missing * 2;
      return this.cfg.rit && this.cfg.rit !== 'off' && !h.double && !h.V.discard && missing > 0 && enough && this.livePlayers().length >= 2;
    }

    // Run it twice decision: runs = 1 or 2
    setRuns(n) {
      const h = this.h;
      if (h.phase !== 'rit') return;
      h.ritDecided = true;
      h.runs = n === 2 ? 2 : 1;
      if (h.runs === 2) h.boards.push(h.boards[0].slice());
      this.ev('rit', { runs: h.runs });
      h.phase = 'runout';
    }

    // Deal one more street during an all-in runout. Returns true when finished.
    runoutStep() {
      const h = this.h;
      if (h.phase !== 'runout') return false;
      const bi = h.deckShort ? -1 : h.boards.findIndex((b) => b.length < 5);
      if (bi < 0) { this.showdown(); return true; }
      const b = h.boards[bi];
      const street = b.length === 0 ? 'flop' : b.length === 3 ? 'turn' : 'river';
      this.dealOne(bi, street);
      if (bi === 0) h.street = street;
      if (h.V.discard && h.boards[0].length >= 3 && !h.discarded) { h.phase = 'discard'; this.ev('discardStart', {}); return false; }
      if (h.deckShort || h.boards.every((x) => x.length >= 5)) { this.showdown(); return true; }
      return false;
    }

    dealOne(bi, street) {
      const h = this.h;
      const n = street === 'flop' ? 3 : 1;
      // Burn only when the deck can spare it; if the deck runs dry, deal from the burn cards (standard house rule).
      if (h.deck.length - h.pos >= n + 1) h.burned.push(h.deck[h.pos++]);
      const cards = h.deck.slice(h.pos, h.pos + n);
      h.pos += cards.length;
      while (cards.length < n && h.burned.length) cards.push(h.burned.pop());
      if (cards.length < n) h.deckShort = true;
      h.boards[bi].push(...cards);
      this.ev('board', { b: bi, cards, street });
    }

    dealStreet(street) {
      const h = this.h;
      for (let bi = 0; bi < h.boards.length; bi++) this.dealOne(bi, street);
    }

    beginBetting() {
      const h = this.h;
      h.phase = 'bet';
      h.cur = 0; h.lastRaise = h.bb; h.fullRaises++; h.betsCount = 0; h.streetAggressor = -1;
      for (const p of Object.values(h.pl)) { p.acted = false; p.bet = 0; p.facedCur = 0; if (!p.folded && !p.allin) p.last = ''; }
      for (const s of h.order) if (this.seats[s] && !h.pl[s].folded && !h.pl[s].allin) this.seats[s].last = '';
      const first = this.findNext(this.button, false);
      if (first < 0) { h.toAct = -1; return this.proceed(); }
      h.toAct = first; h.turnId++;
    }

    discard(s, idx) {
      const h = this.h;
      if (h.phase !== 'discard') throw new Error('Not discarding now');
      const p = h.pl[s];
      if (!p || p.folded || p.hole.length !== 3) return false;
      idx = Math.max(0, Math.min(2, idx | 0));
      p.discard = p.hole[idx];
      p.hole = p.hole.filter((_, i) => i !== idx);
      this.ev('discard', { s });
      if (this.livePlayers().every((q) => q.hole.length === 2)) {
        h.discarded = true;
        const wasRunout = this.livePlayers().filter((q) => !q.allin).length <= 1;
        h.phase = wasRunout ? 'runout' : 'bet';
        if (wasRunout) return true;
        h.phase = 'between';
        this.proceed();
      }
      return true;
    }

    pendingDiscards() {
      const h = this.h;
      if (!h || h.phase !== 'discard') return [];
      return this.livePlayers().filter((p) => p.hole.length === 3).map((p) => p.s);
    }

    // ---------- pots and showdown ----------
    buildPots() {
      const h = this.h;
      const ps = Object.values(h.pl);
      const levels = [...new Set(ps.filter((p) => !p.folded).map((p) => p.total))].sort((a, b) => a - b);
      const pots = [];
      let prev = 0;
      for (const lvl of levels) {
        let amt = 0;
        for (const p of ps) amt += Math.min(p.total, lvl) - Math.min(p.total, prev);
        const elig = ps.filter((p) => !p.folded && p.total >= lvl).map((p) => p.s);
        if (amt > 0) {
          const last = pots[pots.length - 1];
          if (last && last.elig.join() === elig.join()) last.amount += amt;
          else pots.push({ amount: amt, elig });
        }
        prev = lvl;
      }
      if (pots.length && h.dead) pots[0].amount += h.dead;
      const sum = pots.reduce((a, p) => a + p.amount, 0);
      const total = this.potTotal();
      if (pots.length && total > sum) pots[pots.length - 1].amount += total - sum;
      return pots;
    }

    // Winners first in seat order starting left of the button (gets odd chips)
    orderFromButton(seats) {
      const n = this.seats.length, b = this.button;
      return seats.slice().sort((x, y) => ((x - b - 1 + n) % n) - ((y - b - 1 + n) % n));
    }

    evalSeat(s, board) {
      const h = this.h;
      const hole = h.pl[s].hole.map(PK.toInt);
      const bd = board.map(PK.toInt);
      const hi = PK.bestHigh(hole, bd, h.V.mode, h.V.deck === 'short');
      const lo = h.V.hilo ? PK.bestLow(hole, bd) : null;
      return { hi, lo };
    }

    showdown() {
      const h = this.h;
      h.phase = 'showdown'; h.toAct = -1;
      const live = this.livePlayers();
      // show order: last aggressor first, then clockwise
      const ag = h.streetAggressor;
      const first = ag >= 0 && h.pl[ag] && !h.pl[ag].folded ? ag : this.nextSeat(this.button, (i) => h.pl[i] && !h.pl[i].folded);
      const showOrder = [];
      let c = first;
      for (let k = 0; k < live.length; k++) { showOrder.push(c); c = this.nextSeat(c, (i) => h.pl[i] && !h.pl[i].folded); }
      for (const s of showOrder) { h.shown[s] = h.pl[s].hole.slice(); this.ev('show', { s, cards: h.shown[s] }); }

      const pots = this.buildPots();
      const nb = h.boards.length;
      const evals = h.boards.map((bd) => { const m = {}; for (const p of live) m[p.s] = this.evalSeat(p.s, bd); return m; });
      const pay = {};
      const results = [];
      const add = (s, a) => { pay[s] = (pay[s] || 0) + a; };
      pots.forEach((pot, pi) => {
        if (pot.elig.length === 1) {
          add(pot.elig[0], pot.amount);
          results.push({ pot: pi, board: -1, type: 'hi', winners: [pot.elig[0]], each: pot.amount, amount: pot.amount, name: 'Uncalled side pot', cards: [] });
          return;
        }
        const shares = splitInt(pot.amount, nb);
        for (let bi = 0; bi < nb; bi++) {
          const E = evals[bi];
          let hiAmt = shares[bi], loAmt = 0, lowWinners = null, bestLo = null;
          if (h.V.hilo) {
            for (const s of pot.elig) { const lo = E[s].lo; if (lo && (!bestLo || lo.score < bestLo.score)) bestLo = lo; }
            if (bestLo) {
              lowWinners = this.orderFromButton(pot.elig.filter((s) => E[s].lo && E[s].lo.score === bestLo.score));
              hiAmt = Math.ceil(shares[bi] / 2); loAmt = shares[bi] - hiAmt;
            }
          }
          let best = -1;
          for (const s of pot.elig) if (E[s].hi.score > best) best = E[s].hi.score;
          const hiWinners = this.orderFromButton(pot.elig.filter((s) => Math.floor(E[s].hi.score) === Math.floor(best)));
          const hiSplit = splitInt(hiAmt, hiWinners.length);
          hiWinners.forEach((s, i) => add(s, hiSplit[i]));
          // runner-up for explanation
          let runner = null;
          for (const s of pot.elig) if (!hiWinners.includes(s) && (!runner || E[s].hi.score > E[runner].hi.score)) runner = s;
          results.push({
            pot: pi, board: bi, type: 'hi', winners: hiWinners, each: hiSplit[0], amount: hiAmt,
            name: PK.nameHigh(best), cards: E[hiWinners[0]].hi.cards.map(PK.toStr),
            why: runner != null ? PK.explainHigh(best, E[runner].hi.score) : '', runner, runnerName: runner != null ? PK.nameHigh(E[runner].hi.score) : '',
          });
          if (lowWinners) {
            const loSplit = splitInt(loAmt, lowWinners.length);
            lowWinners.forEach((s, i) => add(s, loSplit[i]));
            results.push({ pot: pi, board: bi, type: 'lo', winners: lowWinners, each: loSplit[0], amount: loAmt, name: PK.nameLow(bestLo), cards: bestLo.cards.map(PK.toStr), why: 'Lowest five unpaired cards eight or under wins the low half.' });
          }
        }
      });
      for (const s in pay) { this.seats[s].stack += pay[s]; this.ev('win', { s: +s, a: pay[s] }); }
      h.results = results; h.pay = pay;
      h.handNames = {};
      for (const p of live) h.handNames[p.s] = h.boards.map((bd, bi) => {
        const E = evals[bi][p.s];
        let n = PK.nameHigh(E.hi.score);
        if (h.V.hilo) n += E.lo ? ' / ' + PK.nameLow(E.lo) : ' / no low';
        return n;
      });
      // 7-2 bounty: main pot high winner on board 0 holding 7-2
      const main = results.find((r) => r.pot === 0 && r.type === 'hi');
      if (main) for (const w of main.winners) this.tryBounty(w);
      this.finishHand();
    }

    finishUncontested() {
      const h = this.h;
      this.refundUncalled();
      this.collectBets();
      const w = this.livePlayers()[0].s;
      const amt = this.potTotal();
      this.seats[w].stack += amt;
      h.uncontested = w;
      h.pay = { [w]: amt };
      h.results = [{ pot: 0, board: -1, type: 'hi', winners: [w], each: amt, amount: amt, name: 'Everyone else folded', cards: [] }];
      this.ev('win', { s: w, a: amt });
      this.finishHand();
    }

    finishHand() {
      const h = this.h;
      h.phase = 'done'; h.toAct = -1;
      // rabbit hunt cards (what would have come) for board 0
      if (h.boards[0].length < 5) {
        const r = [];
        let pos = h.pos, len = h.boards[0].length;
        while (len < 5 && pos < h.deck.length) {
          pos++; // burn
          const n = len === 0 ? 3 : 1;
          r.push(...h.deck.slice(pos, pos + n)); pos += n; len += n;
        }
        h.rabbit = r;
      }
      this.ev('done', { no: h.no });
    }

    is72(s) {
      const h = this.h;
      if (!h || h.V.id === 'short' || h.V.hole !== 2) return false;
      const r = h.pl[s].hole.map((c) => c[0]).sort().join('');
      return r === '27';
    }

    tryBounty(s) {
      const h = this.h, amt = this.cfg.bounty72 | 0;
      if (!amt || h.bountyPaid || !this.is72(s) || !h.shown[s]) return 0;
      h.bountyPaid = true;
      let got = 0;
      for (const p of Object.values(h.pl)) {
        if (p.s === s) continue;
        const seat = this.seats[p.s];
        if (!seat) continue;
        const a = Math.min(amt, seat.stack);
        seat.stack -= a; got += a;
      }
      this.seats[s].stack += got;
      h.bounty = { s, a: got };
      this.ev('bounty', { s, a: got });
      return got;
    }

    // Voluntary show after the hand (or the uncontested winner showing for the bounty)
    showCards(s) {
      const h = this.h;
      if (!h || !h.pl[s] || h.shown[s]) return false;
      if (h.phase !== 'done') return false;
      h.shown[s] = h.pl[s].hole.slice();
      this.ev('show', { s, cards: h.shown[s], voluntary: true });
      if (h.uncontested === s) this.tryBounty(s);
      return true;
    }

    voidHand() {
      const h = this.h;
      if (!h || h.phase === 'done') return false;
      for (const s in h.startStacks) if (this.seats[s]) this.seats[s].stack = h.startStacks[s];
      h.phase = 'void'; h.toAct = -1;
      this.ev('void', { no: h.no });
      return true;
    }

    // Seat utilities
    inHand(s) { return !!(this.h && this.h.pl[s] && this.h.phase !== 'done' && this.h.phase !== 'void'); }
    handLive() { return !!(this.h && this.h.phase !== 'done' && this.h.phase !== 'void'); }
  }

  PK.VARIANTS = VARIANTS; PK.LIMIT_NAME = LIMIT_NAME; PK.makeDeck = makeDeck; PK.splitInt = splitInt; PK.Game = Game;
})(typeof window !== 'undefined' ? (window.PK = window.PK || {}) : (globalThis.PK = globalThis.PK || {}));

/* Fairness + privacy: provably-fair shuffle (host commit + player entropy),
   deterministic seeded shuffle, and ECDH/AES-GCM encryption of hole cards. */
(function (PK) {
  'use strict';
  const C = globalThis.crypto;
  const enc = new TextEncoder(), dec = new TextDecoder();

  function b64(buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }
  function unb64(str) {
    const s = atob(str);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  function randHex(nBytes) {
    const u = new Uint8Array(nBytes);
    C.getRandomValues(u);
    return [...u].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function sha256hex(str) {
    const d = await C.subtle.digest('SHA-256', enc.encode(str));
    return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  // sfc32 PRNG seeded from 128 bits of a hex digest
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return t >>> 0;
    };
  }
  function seededShuffle(arr, hex) {
    const w = [0, 8, 16, 24].map((i) => parseInt(hex.slice(i, i + 8), 16));
    const rng = sfc32(w[0], w[1], w[2], w[3]);
    for (let i = 0; i < 12; i++) rng(); // warm up
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      // unbiased integer in [0, i]
      const range = i + 1, limit = Math.floor(0x100000000 / range) * range;
      let x;
      do { x = rng(); } while (x >= limit);
      const j = x % range;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // The deck for a hand: depends on the host's committed secret AND every seated player's entropy,
  // so neither the dealer device alone nor any player alone can choose the cards.
  async function deckFor(kind, hostSecret, seeds) {
    const mix = await sha256hex(hostSecret + '|' + seeds.join(','));
    return { deck: seededShuffle(PK.makeDeck(kind), mix), mix };
  }

  // Verify an audited hand: commit matches secret, and the recomputed deck matches what was seen.
  async function verifyHand(rec) {
    const out = { commitOk: false, deckOk: null, deck: null, problems: [] };
    if (!rec || !rec.secret || !rec.commit) { out.problems.push('No reveal available for this hand.'); return out; }
    out.commitOk = (await sha256hex(rec.secret)) === rec.commit;
    if (!out.commitOk) out.problems.push('The revealed secret does not match the commitment published before the deal.');
    const { deck } = await deckFor(rec.deckKind, rec.secret, rec.seeds || []);
    out.deck = deck;
    // Rebuild the deal order and compare what this viewer saw
    const holeCount = rec.hole, order = rec.order || [];
    const dealt = {};
    let pos = 0;
    for (let r = 0; r < holeCount; r++) for (const s of order) { (dealt[s] = dealt[s] || []).push(deck[pos++]); }
    out.dealt = dealt;
    let good = true;
    for (const s in (rec.seen || {})) {
      const seen = rec.seen[s].slice().sort().join(), exp = (dealt[s] || []).slice().sort().join();
      if (rec.seen[s].length && !(rec.discardVariant ? rec.seen[s].every((c) => (dealt[s] || []).includes(c)) : seen === exp)) { good = false; out.problems.push('Seat ' + (+s + 1) + ' cards do not match the shuffle.'); }
    }
    const rest = deck.slice(pos);
    if (rec.boardSeq && rec.boardSeq.length) {
      // replay the deal exactly: burn one card before each street when the deck can spare it
      let ptr = pos;
      for (const cards of rec.boardSeq) {
        const n = cards.length;
        if (deck.length - ptr >= n + 1) ptr++;
        const expect = deck.slice(ptr, ptr + n);
        ptr += n;
        if (expect.join() !== cards.join()) { good = false; out.problems.push('Board cards ' + cards.join(' ') + ' are not the cards the shuffle puts in that position (expected ' + expect.join(' ') + ').'); }
      }
      const dealtBoard = new Set([].concat(...rec.boardSeq));
      for (const b of rec.boards || []) for (const c of b) if (!dealtBoard.has(c) && !rest.includes(c)) { good = false; out.problems.push('Board card ' + c + ' was not in the undealt deck.'); }
    } else {
      for (const b of rec.boards || []) for (const c of b) if (!rest.includes(c)) { good = false; out.problems.push('Board card ' + c + ' was not in the undealt deck.'); }
      out.partial = true;
    }
    if (rec.mySeed && !(rec.seeds || []).includes(rec.mySeed)) out.warnings = ['Your device\u2019s random number was not mixed into this shuffle. It may have arrived after the deal started; if it keeps happening, ask the host why.'];
    if (rec.shuffleCommit && rec.shuffleCommit !== rec.commit) { good = false; out.problems.push('The dealer changed its commitment after players sent their random numbers.'); }
    out.deckOk = good;
    return out;
  }

  // ---- ECDH key agreement + AES-GCM for private hole cards
  async function newKeyPair() {
    const kp = await C.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
    const raw = await C.subtle.exportKey('raw', kp.publicKey);
    return { priv: kp.privateKey, pub: b64(raw) };
  }
  const keyCaches = new WeakMap();
  async function sharedKey(priv, theirPub) {
    const k = theirPub;
    let keyCache = keyCaches.get(priv);
    if (!keyCache) { keyCache = new Map(); keyCaches.set(priv, keyCache); }
    if (keyCache.has(k)) return keyCache.get(k);
    const p = (async () => {
      const pub = await C.subtle.importKey('raw', unb64(theirPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      return C.subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    })();
    keyCache.set(k, p);
    try { return await p; } catch (e) { keyCache.delete(k); throw e; }
  }
  async function seal(key, text, aad) {
    const iv = new Uint8Array(12);
    C.getRandomValues(iv);
    const ct = await C.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(text));
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv, 0); out.set(new Uint8Array(ct), 12);
    return b64(out);
  }
  async function open(key, b64str, aad) {
    const u = unb64(b64str);
    const pt = await C.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12), additionalData: enc.encode(aad) }, key, u.slice(12));
    return dec.decode(pt);
  }

  PK.fair = { b64, unb64, randHex, sha256hex, seededShuffle, deckFor, verifyHand, newKeyPair, sharedKey, seal, open };
})(typeof window !== 'undefined' ? (window.PK = window.PK || {}) : (globalThis.PK = globalThis.PK || {}));

/* Equity calculator (all-in percentages, bot brains) and bot decision making. */
(function (PK) {
  'use strict';

  function remainingDeck(kind, known) {
    const k = new Set(known);
    return PK.makeDeck(kind).filter((c) => !k.has(c)).map(PK.toInt);
  }
  let seed = 0x9e3779b9;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296); }

  // Exact or Monte Carlo pot share for each seat with known hole cards.
  // holes: {seat: ['As','Kd',...]}, board: [...]. Returns {seat: share 0..1}
  function equity(holes, board, variantId, iters) {
    const V = PK.VARIANTS[variantId] || PK.VARIANTS.nlhe;
    const seats = Object.keys(holes);
    const H = seats.map((s) => holes[s].map(PK.toInt));
    const B = board.map(PK.toInt);
    const known = [].concat(...seats.map((s) => holes[s]), board);
    const rest = remainingDeck(V.deck, known);
    const need = 5 - B.length;
    const short = V.deck === 'short';
    const share = new Array(seats.length).fill(0);
    let trials = 0;
    const score = (bd) => {
      const hs = H.map((h) => PK.scoreHigh(h, bd, V.mode, short));
      let best = -1; for (const x of hs) if (x > best) best = x;
      const hw = []; hs.forEach((x, i) => { if (x === best) hw.push(i); });
      let lw = [];
      if (V.hilo) {
        let bl = Infinity;
        const ls = H.map((h) => { const l = PK.bestLow(h, bd); return l ? l.score : Infinity; });
        for (const x of ls) if (x < bl) bl = x;
        if (bl < Infinity) ls.forEach((x, i) => { if (x === bl) lw.push(i); });
      }
      if (lw.length) { for (const i of hw) share[i] += 0.5 / hw.length; for (const i of lw) share[i] += 0.5 / lw.length; }
      else for (const i of hw) share[i] += 1 / hw.length;
      trials++;
    };
    if (need === 0) score(B);
    else if (need <= 2 && rest.length <= 50) {
      if (need === 1) for (const c of rest) score(B.concat([c]));
      else for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) score(B.concat([rest[i], rest[j]]));
    } else {
      const n = iters || (V.mode === 'omaha' ? 600 : 1500);
      const r = rest.slice();
      for (let t = 0; t < n; t++) {
        for (let i = 0; i < need; i++) { const j = i + Math.floor(rnd() * (r.length - i)); const x = r[i]; r[i] = r[j]; r[j] = x; }
        score(B.concat(r.slice(0, need)));
      }
    }
    const out = {};
    seats.forEach((s, i) => { out[s] = share[i] / trials; });
    return out;
  }

  // Equity of one hand vs N random opponents
  function equityVsRandom(hole, board, variantId, nOpp, iters) {
    const V = PK.VARIANTS[variantId] || PK.VARIANTS.nlhe;
    const short = V.deck === 'short';
    const me = hole.map(PK.toInt), B = board.map(PK.toInt);
    const rest = remainingDeck(V.deck, hole.concat(board));
    const need = 5 - B.length;
    let total = 0;
    const n = iters || 200;
    const r = rest.slice();
    nOpp = Math.max(1, Math.min(nOpp, 5));
    for (let t = 0; t < n; t++) {
      const take = need + nOpp * V.hole;
      for (let i = 0; i < take; i++) { const j = i + Math.floor(rnd() * (r.length - i)); const x = r[i]; r[i] = r[j]; r[j] = x; }
      const bd = B.concat(r.slice(0, need));
      const mine = PK.scoreHigh(me, bd, V.mode, short);
      let best = mine, ties = 1, beaten = false;
      for (let o = 0; o < nOpp; o++) {
        const oh = r.slice(need + o * V.hole, need + (o + 1) * V.hole);
        const sc = PK.scoreHigh(oh, bd, V.mode, short);
        if (sc > best) { beaten = true; break; }
        if (sc === best) ties++;
      }
      let s = beaten ? 0 : 1 / ties;
      if (V.hilo) {
        const ml = PK.bestLow(me, bd);
        let lowShare = 0;
        if (ml) {
          lowShare = 1;
          for (let o = 0; o < nOpp; o++) {
            const ol = PK.bestLow(r.slice(need + o * V.hole, need + (o + 1) * V.hole), bd);
            if (ol && ol.score < ml.score) { lowShare = 0; break; }
            if (ol && ol.score === ml.score) lowShare = 0.5;
          }
          s = s * 0.5 + lowShare * 0.5;
        }
      }
      total += s;
    }
    return total / n;
  }

  const PERSONAS = {
    rock: { label: 'Rock', tight: 0.8, aggr: 0.25, bluff: 0.02, note: 'Plays few hands, bets when strong' },
    shark: { label: 'Shark', tight: 0.5, aggr: 0.65, bluff: 0.08, note: 'Solid and aggressive' },
    maniac: { label: 'Maniac', tight: 0.1, aggr: 0.9, bluff: 0.22, note: 'Raises everything' },
    station: { label: 'Station', tight: 0.15, aggr: 0.1, bluff: 0.01, note: 'Calls far too much' },
  };
  const BOT_NAMES = ['Rook', 'Vega', 'Otto', 'Juno', 'Pike', 'Nell', 'Moss', 'Ivo', 'Zara', 'Bram', 'Cleo', 'Dax'];

  // view: {hole, board, variant, L (legal), pot, nOpp, street, bb, persona}
  function decide(view) {
    const P = PERSONAS[view.persona] || PERSONAS.shark;
    const L = view.L;
    const V = PK.VARIANTS[view.variant];
    const iters = V.mode === 'omaha' ? (V.hole === 5 ? 90 : 120) : 220;
    let eq = equityVsRandom(view.hole, view.board, view.variant, view.nOpp, iters);
    // preflop: random hands overstate weak holdings in multiway pots; tighten by persona
    eq += (rnd() - 0.5) * 0.08;
    const pot = view.pot;
    const fair = 1 / (view.nOpp + 1);
    const strength = eq / fair; // >1 = better than average
    const sizeTo = (frac) => {
      if (!L.raise) return 0;
      const base = L.cur + Math.round((pot + L.toCall) * frac);
      return Math.max(L.minTo, Math.min(L.maxTo, base));
    };
    if (L.check) {
      const betBar = 1.25 + P.tight * 0.35 - P.aggr * 0.4;
      if (L.raise && (strength > betBar || rnd() < P.bluff)) {
        const to = sizeTo(0.45 + rnd() * 0.4 + (strength > 1.8 ? 0.25 : 0));
        return { k: L.isBet ? 'bet' : 'raise', a: to };
      }
      return { k: 'check' };
    }
    const potOdds = L.toCall / (pot + L.toCall);
    const commit = L.toCall >= view.stack * 0.4;
    const raiseBar = 1.6 + P.tight * 0.3 - P.aggr * 0.45;
    if (L.raise && (strength > raiseBar || (rnd() < P.bluff * 0.5 && !commit))) {
      const to = sizeTo(0.6 + rnd() * 0.5 + (strength > 2.2 ? 0.4 : 0));
      if (to > L.cur) return { k: 'raise', a: to };
    }
    const margin = (P.tight - 0.4) * 0.12 + (commit ? 0.06 : 0) - (view.persona === 'station' ? 0.12 : 0);
    if (eq > potOdds + margin) return { k: 'call' };
    if (view.street === 'pre' && L.toCall <= view.bb && P.tight < 0.3 && rnd() < 0.5) return { k: 'call' };
    return { k: 'fold' };
  }

  function chooseDiscard(hole, board, variant) {
    let best = 0, bestEq = -1;
    for (let i = 0; i < hole.length; i++) {
      const keep = hole.filter((_, j) => j !== i);
      const e = equityVsRandom(keep, board, 'nlhe', 2, 70);
      if (e > bestEq) { bestEq = e; best = i; }
    }
    return best;
  }

  PK.equity = equity; PK.equityVsRandom = equityVsRandom; PK.PERSONAS = PERSONAS; PK.BOT_NAMES = BOT_NAMES;
  PK.botDecide = decide; PK.botDiscard = chooseDiscard;
})(typeof window !== 'undefined' ? (window.PK = window.PK || {}) : (globalThis.PK = globalThis.PK || {}));

/* Multiplayer: presence-based protocol over the artifact "room".
   One device (the host) runs the dealer. Everyone else sends intents in their presence.
   Host election + migration, encrypted hole cards, provably-fair shuffles, ledger, stats, chat. */
(function (PK) {
  'use strict';
  const F = { IN: 1, FOLD: 2, ALLIN: 4, OUT: 8, DISC: 16, BOT: 32, WIN: 64, LEAVE: 128, BUST: 256, AWAY: 512 };
  PK.F = F;
  const DEFAULTS = {
    name: 'Back Room', seats: 9, mode: 'cash', game: 'nlhe', gl: ['nlhe', 'plo', 'short'], lim: '',
    sb: 10, bb: 20, ante: 0, bbAnte: false, straddle: false, stack: 2000, minBuy: 800, maxBuy: 4000,
    timer: 30, timeBank: 60, rit: 'ask', double: false, bombEvery: 0, bombAmt: 40, bounty72: 0,
    rabbit: true, lvlMin: 8, autoReveal: false, autoRebuy: true,
  };
  PK.DEFAULTS = DEFAULTS;
  const ms = (x) => x * (PK.speed || 1); // test hook to run timers faster
  const BLIND_MULT = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 100, 150, 200];

  const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').trim().slice(0, n);
  PK.clean = clean;
  const int = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(x) || 0)));
  function normCfg(c) {
    const o = Object.assign({}, DEFAULTS, c || {});
    o.name = clean(o.name, 28) || DEFAULTS.name;
    o.seats = int(o.seats, 2, 9);
    o.mode = o.mode === 'sng' ? 'sng' : 'cash';
    o.game = PK.VARIANTS[o.game] || o.game === 'dealers' ? o.game : 'nlhe';
    o.gl = (Array.isArray(o.gl) ? o.gl : []).filter((g) => PK.VARIANTS[g]).slice(0, 6);
    if (!o.gl.length) o.gl = ['nlhe', 'plo'];
    o.lim = ['nl', 'pl', 'fl'].includes(o.lim) ? o.lim : '';
    o.bb = int(o.bb, 2, 1e7); o.sb = int(o.sb, 1, o.bb);
    o.ante = int(o.ante, 0, o.bb); o.stack = int(o.stack, o.bb * 5, 1e9);
    o.minBuy = int(o.minBuy, o.bb * 5, o.stack); o.maxBuy = int(o.maxBuy, o.stack, 1e9);
    o.timer = int(o.timer, 0, 300); o.timeBank = int(o.timeBank, 0, 600);
    o.rit = ['off', 'ask', 'always'].includes(o.rit) ? o.rit : 'ask';
    o.bombEvery = int(o.bombEvery, 0, 50); o.bombAmt = int(o.bombAmt, 1, 1e8);
    o.bounty72 = int(o.bounty72, 0, 1e8); o.lvlMin = int(o.lvlMin, 1, 60);
    for (const k of ['bbAnte', 'straddle', 'double', 'rabbit', 'autoReveal', 'autoRebuy']) o[k] = !!o[k];
    return o;
  }
  PK.normCfg = normCfg;

  // ---------------- heartbeat ----------------
  // Browsers throttle timers in background tabs to once a second (or once a minute after five minutes).
  // A Web Worker's timer keeps ticking, and its messages wake this page, so the dealer never stalls
  // when the host switches tabs.
  function heartbeat(ms, fn) {
    let worker = null;
    try {
      if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
        const src = 'let t=null;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data);};';
        worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        worker.onmessage = () => fn();
        worker.postMessage(ms);
        return () => { worker.postMessage(0); worker.terminate(); };
      }
    } catch (e) { worker = null; }
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
  PK.heartbeat = heartbeat;

  // ---------------- transport ----------------
  // Wraps the platform room (or a local stand-in for offline practice).
  class LocalRoom {
    constructor() { this.me = { peer: 'local', by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: {}, updatedAt: Date.now() }; this.hs = []; }
    presence(p) {
      const n = Object.assign({}, this.me.presence);
      for (const k in p) { if (p[k] === null) delete n[k]; else n[k] = p[k]; }
      this.me = Object.assign({}, this.me, { presence: n, updatedAt: Date.now() });
      queueMicrotask(() => this.hs.forEach((h) => h({ peers: this.peers(), joined: [], left: [], updated: [this.me] })));
      return Promise.resolve();
    }
    peers() { return [this.me]; }
    onPeers(h) { this.hs.push(h); queueMicrotask(() => h({ peers: this.peers(), joined: [this.me], left: [], updated: [] })); return () => {}; }
    connected() { return true; }
    onConnection(h) { queueMicrotask(() => h(true)); return () => {}; }
    join() { return Promise.resolve(new LocalRoom()); }
  }
  PK.LocalRoom = LocalRoom;

  // ---------------- host (dealer device) ----------------
  class Host {
    constructor(client, cfg, from) {
      this.c = client;
      this.cfg = normCfg(cfg || (from && from.cfg));
      this.g = new PK.Game(this.cfg);
      this.id = (from && from.id) || PK.fair.randHex(5);
      this.ep = from ? (from.ep || 0) + 1 : 1;
      this.born = (from && from.born) || Date.now();
      this.sv = 0;
      this.ledger = {}; this.stats = {}; this.fairRec = {}; this.nonce = {};
      this.tbank = {}; this.timeouts = {}; this.encFor = {}; this.cipher = {};
      this.phase = 'wait'; this.nextAt = 0; this.dl = 0; this.tbu = false; this.turnSeen = -1;
      this.vote = null; this.msg = null; this.paused = false; this.pauseLeft = 0;
      this.sng = { started: false, level: 0, endAt: 0, places: [], over: false };
      this.botAt = 0; this.bombNext = false; this.reveal = null; this.rabbit = null; this.eq = null;
      this.runoutAt = 0; this.ritVotes = {}; this.ritEnd = 0; this.discEnd = 0;
      this.rot = { idx: 0, count: 0, per: 0 };
      this.busy = false; this.dirty = true; this.msgId = 0;
      this.pending = null; // settings to apply next hand
      this.lastEv = 0; this.events = [];
      if (from) this.restore(from);
    }

    restore(from) {
      const T = from.T;
      const live = ['shuffle', 'bet', 'rit', 'runout', 'discard', 'showdown'].includes(T.hp);
      (T.S || []).forEach((e, i) => {
        if (!e || i >= this.g.seats.length) return;
        const stack = live && T.ss && T.ss[i] != null ? T.ss[i] : e[3];
        this.g.seats[i] = { id: e[0], name: e[1], color: e[2], stack, bot: !!(e[5] & F.BOT), persona: e[9] || null, sitOut: !!(e[5] & F.OUT), last: '' };
      });
      this.g.button = T.btn == null ? -1 : T.btn;
      this.g.handNo = T.hn || 0;
      const M = from.M || {};
      for (const r of M.L || []) this.ledger[r[0]] = { nm: r[1], buy: r[2], out: r[4] ? 0 : r[3], on: !!r[4] };
      (T.S || []).forEach((e) => { if (e && !(e[5] & F.BOT)) this.tbank[e[0]] = e[8] || 0; });
      for (const r of M.X || []) this.stats[r[0]] = { h: r[1], v: r[2], p: r[3], w: r[4], big: r[5], sd: r[6] || 0, sdw: r[7] || 0 };
      if (T.lvl) this.sng = { started: !!T.lvl[5], level: T.lvl[0], endAt: Date.now() + Math.max(0, (T.lvl[4] || 0) - (T.now || Date.now())), places: (T.pl || []).slice(), over: T.ph === 'over' };
      const oldHost = from.hostName || 'The dealer device';
      this.say(live ? oldHost + ' left mid-hand, so hand #' + T.hn + ' was cancelled and every stack was put back to where it started.' : oldHost + ' left. This device is now dealing.');
      this.phase = this.sng.over ? 'over' : 'next';
      this.nextAt = Date.now() + ms(2500);
      this.primed = false;
    }

    // After taking over, treat requests already sitting in presence as handled (no double rebuys).
    primeNonces() {
      for (const p of this.c.peerList()) {
        const pid = this.c.pidOf(p), rq = (p.presence || {}).rq || {};
        if (!pid) continue;
        const n = this.nonce[pid] || (this.nonce[pid] = {});
        if (Array.isArray(rq.sit)) n.sit = rq.sit[2];
        if (rq.lv != null) n.lv = rq.lv;
        if (Array.isArray(rq.rb)) n.rb = rq.rb[1];
        if (Array.isArray(rq.nv)) n.nv = rq.nv[0];
        if (Array.isArray(rq.vt)) n.vt = rq.vt[2];
        if (rq.au != null) n.au = rq.au;
        if (rq.rh != null) n.rh = rq.rh;
        const a = (p.presence || {}).a;
        if (Array.isArray(a)) n.act = a.join(':');
      }
      this.primed = true;
    }

    say(text) { this.msg = [++this.msgId + this.ep * 1000, clean(text, 220)]; this.dirty = true; }

    start() { this.stopBeat = heartbeat(150, () => this.tick()); this.tick(); }
    stop() { if (this.stopBeat) this.stopBeat(); this.stopBeat = null; this.stopped = true; }

    // ---- helpers
    seatOf(pid) { return this.g.seats.findIndex((s) => s && s.id === pid); }
    peerFor(pid) { return this.c.peerByPid(pid); }
    humanSeats() { const out = []; this.g.seats.forEach((s, i) => { if (s && !s.bot) out.push(i); }); return out; }
    led(pid, nm) { return this.ledger[pid] || (this.ledger[pid] = { nm, buy: 0, out: 0, on: true }); }
    st(pid) { return this.stats[pid] || (this.stats[pid] = { h: 0, v: 0, p: 0, w: 0, big: 0, sd: 0, sdw: 0 }); }
    blinds() {
      if (this.cfg.mode !== 'sng') return { sb: this.cfg.sb, bb: this.cfg.bb, ante: this.cfg.ante };
      const m = BLIND_MULT[Math.min(this.sng.level, BLIND_MULT.length - 1)];
      const r = (x) => Math.max(1, Math.round(x));
      return { sb: r(this.cfg.sb * m), bb: r(this.cfg.bb * m), ante: this.cfg.ante ? r(this.cfg.ante * m) : 0 };
    }

    // ---- public API used by the host's own UI
    sitPlayer(pid, nm, color, seat, buy, bot, persona) {
      const g = this.g;
      if (this.seatOf(pid) >= 0) return 'Already seated';
      // two friends tapping "Sit down" at the same moment both ask for the same seat: give the later one the next free seat
      if (seat == null || seat < 0 || seat >= g.seats.length || g.seats[seat]) seat = g.seats.findIndex((s) => !s);
      if (seat < 0) return 'The table is full';
      if (this.cfg.mode === 'sng' && this.sng.started) return 'The tournament has started. You can watch until it ends.';
      buy = this.cfg.mode === 'sng' ? this.cfg.stack : int(buy || this.cfg.stack, this.cfg.minBuy, this.cfg.maxBuy);
      g.seats[seat] = { id: pid, name: clean(nm, 16) || 'Player', color: color | 0, stack: buy, bot: !!bot, persona: persona || null, sitOut: false, last: '' };
      const L = this.led(pid, nm); L.nm = clean(nm, 16); L.buy += buy; L.on = true;
      this.tbank[pid] = this.cfg.timeBank;
      this.timeouts[pid] = 0;
      this.event('sit', seat, buy);
      this.dirty = true;
      return null;
    }
    addBot(persona) {
      const used = new Set(this.g.seats.filter(Boolean).map((s) => s.name));
      const name = PK.BOT_NAMES.find((n) => !used.has(n)) || 'Bot';
      const ps = Object.keys(PK.PERSONAS);
      persona = persona || ps[Math.floor(Math.random() * ps.length)];
      return this.sitPlayer('bot-' + PK.fair.randHex(3), name, Math.floor(Math.random() * 12), -1, this.cfg.stack, true, persona);
    }
    removeSeat(seat, why) {
      const g = this.g, s = g.seats[seat];
      if (!s) return;
      if (g.inHand(seat)) { s.leaving = true; this.dirty = true; return; }
      const L = this.led(s.id, s.name); L.out += s.stack; L.on = false;
      g.seats[seat] = null;
      this.event('leave', seat, 0);
      if (why) this.say(why);
      this.dirty = true;
    }
    setStack(seat, amount, reason) {
      const s = this.g.seats[seat];
      if (!s || this.g.inHand(seat)) return 'Change stacks between hands';
      amount = int(amount, 0, 1e9);
      const L = this.led(s.id, s.name); L.buy += amount - s.stack;
      this.say('Host set ' + s.name + "'s stack from " + s.stack + ' to ' + amount + (reason ? ' (' + clean(reason, 80) + ')' : '') + '.');
      s.stack = amount; this.dirty = true; return null;
    }
    voidHand(reason) {
      if (!this.g.handLive()) return 'No hand in progress';
      this.g.voidHand();
      this.say('Hand #' + this.g.h.no + ' cancelled' + (reason ? ': ' + clean(reason, 80) : '') + '. Stacks returned to the start of the hand.');
      this.onHandDone(); this.dirty = true; return null;
    }
    setPaused(p) {
      if (p === this.paused) return;
      this.paused = p;
      if (p) { this.pauseLeft = Math.max(0, this.dl - Date.now()); this.pauseNext = Math.max(0, this.nextAt - Date.now()); this.say('Game paused.'); }
      else { this.dl = Date.now() + this.pauseLeft; this.nextAt = Date.now() + Math.max(this.pauseNext || 0, 1500); if (this.sng.started) this.sng.endAt += 0; this.say('Game resumed.'); }
      this.dirty = true;
    }
    updateCfg(c) {
      // stakes/rules apply from the next hand
      const n = normCfg(Object.assign({}, this.cfg, c));
      if (n.seats < this.g.seats.length && this.g.seats.slice(n.seats).some(Boolean)) n.seats = this.g.seats.length;
      this.pending = n; this.dirty = true;
      if (!this.g.handLive()) this.applyPending();
    }
    applyPending() {
      if (!this.pending) return;
      const n = this.pending; this.pending = null;
      this.cfg = n; this.g.cfg = n;
      if (n.seats !== this.g.seats.length) {
        const s = this.g.seats.slice(0, n.seats);
        while (s.length < n.seats) s.push(null);
        this.g.seats = s;
      }
      this.say('Table settings updated.');
    }
    startTournament() {
      if (this.cfg.mode !== 'sng') return;
      for (const s of this.g.seats) if (s) { s.stack = this.cfg.stack; s.sitOut = false; }
      this.sng = { started: true, level: 0, endAt: Date.now() + this.cfg.lvlMin * 60000, places: [], over: false };
      this.say('Tournament started. Blinds go up every ' + this.cfg.lvlMin + ' minutes.');
      this.phase = 'next'; this.nextAt = Date.now() + ms(1500); this.dirty = true;
    }
    resetTournament() {
      for (const s of this.g.seats) if (s) { s.stack = this.cfg.stack; s.sitOut = false; }
      this.sng = { started: false, level: 0, endAt: 0, places: [], over: false };
      this.phase = 'wait'; this.dirty = true;
    }
    proposeVote(pid, k) {
      if (this.vote && Date.now() < this.vote.end) return 'A vote is already running';
      const nm = (this.g.seats[this.seatOf(pid)] || {}).name || 'Someone';
      const q = { bomb: 'Bomb pot next hand?', pause: 'Pause the game?', resume: 'Resume the game?', void: 'Cancel this hand and return the chips?', double: 'Double board next hand?' }[k];
      if (!q) return 'Unknown vote';
      this.vote = { id: ++this.msgId, k, q, by: nm, y: new Set([pid]), n: new Set(), end: Date.now() + 30000 };
      this.dirty = true; this.checkVote(); return null;
    }
    castVote(pid, id, yes) {
      const v = this.vote;
      if (!v || v.id !== id || this.seatOf(pid) < 0) return;
      v.y.delete(pid); v.n.delete(pid); (yes ? v.y : v.n).add(pid);
      this.dirty = true; this.checkVote();
    }
    voters() { return this.humanSeats().map((i) => this.g.seats[i].id).filter((pid) => pid === this.c.pid || this.peerFor(pid)); }
    checkVote() {
      const v = this.vote; if (!v) return;
      const n = this.voters().length, need = Math.floor(n / 2) + 1;
      v.need = need;
      if (v.y.size >= need) {
        this.vote = null;
        if (v.k === 'bomb') { this.bombNext = true; this.say('Vote passed: the next hand is a bomb pot.'); }
        else if (v.k === 'pause') this.setPaused(true);
        else if (v.k === 'resume') this.setPaused(false);
        else if (v.k === 'void') this.voidHand('table vote');
        else if (v.k === 'double') { this.doubleNext = true; this.say('Vote passed: double board next hand.'); }
      } else if (v.n.size > n - need || Date.now() > v.end) { this.vote = null; this.say('Vote failed: ' + v.q.replace('?', '') + '.'); }
      this.dirty = true;
    }

    event(k, s, a, x) { this.g.ev(k, { s: s == null ? -1 : s, a: a || 0, x: x == null ? '' : x }); }

    // ---- intent processing from presence
    processIntents() {
      const g = this.g;
      if (this.primed === false) this.primeNonces();
      for (const p of this.c.peerList()) {
        const pr = p.presence || {};
        const pid = this.c.pidOf(p);
        if (!pid || pid === this.c.pid) continue;
        const rq = pr.rq || {};
        const seen = this.nonce[pid] || (this.nonce[pid] = {});
        let seat = this.seatOf(pid);
        if (Array.isArray(rq.sit) && rq.sit[2] !== seen.sit) {
          seen.sit = rq.sit[2];
          if (seat < 0) {
            const err = this.sitPlayer(pid, pr.nm, pr.cl, int(rq.sit[0], -1, 8), rq.sit[1]);
            if (err) this.say((clean(pr.nm, 16) || 'Someone') + ': ' + err);
            seat = this.seatOf(pid);
          }
        }
        if (rq.lv != null && rq.lv !== seen.lv) { seen.lv = rq.lv; if (seat >= 0) this.removeSeat(seat); }
        seat = this.seatOf(pid);
        if (seat >= 0 && g.seats[seat]) {
          const s = g.seats[seat];
          if (s.name !== clean(pr.nm, 16) && pr.nm) { s.name = clean(pr.nm, 16); this.dirty = true; }
          const out = !!rq.so;
          if (out !== !!s.sitOut && rq.so != null) { s.sitOut = out; if (!out) { this.timeouts[pid] = 0; s.away = false; } this.dirty = true; }
          if (Array.isArray(rq.rb) && rq.rb[1] !== seen.rb) { seen.rb = rq.rb[1]; this.rebuy(seat, rq.rb[0]); }
          const h = g.h;
          if (h && rq.sh === h.no && !h.shown[seat] && g.showCards(seat)) this.dirty = true;
          if (h && Array.isArray(rq.rt) && rq.rt[0] === h.no && h.phase === 'rit' && this.ritVotes[seat] == null) { this.ritVotes[seat] = !!rq.rt[1]; this.dirty = true; }
          if (h && Array.isArray(rq.dc) && rq.dc[0] === h.no && h.phase === 'discard' && h.pl[seat] && h.pl[seat].hole.length === 3) { g.discard(seat, rq.dc[1]); this.afterDiscard(seat); }
          if (Array.isArray(rq.vt) && this.vote && rq.vt[0] === this.vote.id && rq.vt[2] !== seen.vt) { seen.vt = rq.vt[2]; this.castVote(pid, rq.vt[0], !!rq.vt[1]); }
          if (Array.isArray(rq.nv) && rq.nv[0] !== seen.nv) { seen.nv = rq.nv[0]; const e = this.proposeVote(pid, rq.nv[1]); if (e) this.say(e); }
          // betting action bound to the current turn
          // bound to this hand and this turn; a nonce lets a player retry after a rejected action
          if (h && h.phase === 'bet' && h.toAct === seat && Array.isArray(pr.a) && pr.a[0] === h.no && pr.a[1] === h.turnId) {
            const key = pr.a.join(':');
            if (seen.act !== key) { seen.act = key; this.applyAction(seat, pr.a[2], pr.a[3], pid); }
          }
        }
        if (rq.au != null && rq.au !== seen.au) { seen.au = rq.au; this.doReveal(rq.au, pr.nm); }
        if (rq.rh != null && rq.rh !== seen.rh) { seen.rh = rq.rh; this.doRabbit(rq.rh); }
      }
    }

    // ---- host's own requests (the host is also a player)
    selfRequest(kind, arg) {
      const pid = this.c.pid, seat = this.seatOf(pid), g = this.g, h = g.h;
      switch (kind) {
        case 'sit': return this.sitPlayer(pid, this.c.nick, this.c.color, arg.seat, arg.buy);
        case 'leave': if (seat >= 0) this.removeSeat(seat); return null;
        case 'sitout': if (seat >= 0) { g.seats[seat].sitOut = !!arg; if (!arg) { this.timeouts[pid] = 0; g.seats[seat].away = false; } this.dirty = true; } return null;
        case 'rebuy': if (seat >= 0) return this.rebuy(seat, arg); return null;
        case 'show': if (seat >= 0 && h && g.showCards(seat)) this.dirty = true; return null;
        case 'rit': if (seat >= 0 && h && h.phase === 'rit') { this.ritVotes[seat] = !!arg; this.dirty = true; } return null;
        case 'discard': if (seat >= 0 && h && h.phase === 'discard') { g.discard(seat, arg); this.afterDiscard(seat); } return null;
        case 'act': if (seat >= 0) return this.applyAction(seat, arg.k, arg.a, pid); return null;
        case 'audit': this.doReveal(arg, this.c.nick); return null;
        case 'rabbit': this.doRabbit(arg); return null;
        case 'propose': return this.proposeVote(pid, arg);
        case 'vote': this.castVote(pid, arg.id, arg.yes); return null;
      }
      return null;
    }

    rebuy(seat, amt) {
      const s = this.g.seats[seat];
      if (this.cfg.mode === 'sng') return 'No rebuys in a tournament';
      if (this.g.inHand(seat)) { s.pendingRebuy = int(amt, 0, this.cfg.maxBuy); return null; }
      const add = Math.max(0, Math.min(int(amt, 0, this.cfg.maxBuy), this.cfg.maxBuy - s.stack));
      if (!add) return 'You are already at the maximum buy-in';
      s.stack += add; s.busted = false;
      const L = this.led(s.id, s.name); L.buy += add;
      this.event('rebuy', seat, add);
      this.dirty = true; return null;
    }

    applyAction(seat, k, a, pid) {
      const g = this.g;
      if (!['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(k)) return 'Unknown action';
      // time bank: spend what was used this turn
      const actor = g.seats[seat];
      if (this.tbu && actor && g.h && g.h.toAct === seat) {
        this.tbank[actor.id] = Math.max(0, (this.tbank[actor.id] || 0) - (Date.now() - this.tbStart) / 1000);
        this.tbu = false;
      }
      try { g.act(seat, k, a); }
      catch (e) { if (pid !== this.c.pid) this.say((g.seats[seat] || {}).name + ': ' + e.message); return e.message; }
      if (pid) { this.timeouts[pid] = 0; const s = g.seats[seat]; if (s) s.away = false; }
      this.afterEngine();
      return null;
    }

    afterDiscard(seat) { if (this.c.pid !== (this.g.seats[seat] || {}).id) this.encFor[seat] = null; this.afterEngine(); }

    afterEngine() {
      const h = this.g.h;
      this.dirty = true;
      if (!h) return;
      if ((h.phase === 'rit' || h.phase === 'runout') && !h.tabled) {
        // All action complete with someone all-in: hands are tabled (TDA rule), so equities are public.
        h.tabled = true;
        for (const p of this.g.livePlayers()) if (!h.shown[p.s]) h.shown[p.s] = p.hole.slice();
        this.computeEquity();
        this.runoutAt = Date.now() + ms(1300);
        if (h.phase === 'rit') { this.ritVotes = {}; this.ritEnd = Date.now() + ms(8000); }
      }
      if (h.phase === 'discard' && !this.discEnd) this.discEnd = Date.now() + ms(15000);
      if (h.phase !== 'discard') this.discEnd = 0;
      if (h.phase === 'done' || h.phase === 'void') this.onHandDone();
    }

    computeEquity() {
      const h = this.g.h;
      const live = this.g.livePlayers();
      if (live.length < 2) { this.eq = null; return; }
      const holes = {};
      for (const p of live) holes[p.s] = p.hole;
      // equity across boards: average
      const eqs = h.boards.map((b) => PK.equity(holes, b, h.game, h.V.mode === 'omaha' ? 500 : 1200));
      const out = {};
      for (const p of live) out[p.s] = Math.round(100 * eqs.reduce((a, e) => a + e[p.s], 0) / eqs.length);
      this.eq = out;
    }

    onHandDone() {
      const g = this.g, h = g.h;
      if (h.counted) return;
      h.counted = true;
      if (h.phase === 'done') {
        // time banks refill slowly: +5 seconds every 10 hands
        if (h.no % 10 === 0) for (const id in this.tbank) this.tbank[id] = Math.min(this.cfg.timeBank, this.tbank[id] + 5);
        // stats
        for (const p of Object.values(h.pl)) {
          const s = g.seats[p.s]; if (!s) continue;
          const S = this.st(s.id);
          S.h++; if (p.vpip) S.v++; if (p.pfr) S.p++;
          const won = (h.pay && h.pay[p.s]) || 0;
          if (won) { S.w++; S.big = Math.max(S.big, won); }
          if (h.shown[p.s] && h.phase === 'done' && h.uncontested < 0 && !p.folded) { S.sd++; if (won) S.sdw++; }
        }
        // record the fairness proof for audits
        const rec = this.fairRec[h.no];
        if (rec && this.cfg.autoReveal) this.reveal = [h.no, rec.secret, rec.seeds, rec.kind, rec.order, rec.hole];
        this.eq = h.boards.length && this.eq ? this.eq : null;
      }
      // leaving players, busts, pending rebuys
      if (this.cfg.mode === 'sng' && this.sng.started) {
        const busts = [];
        g.seats.forEach((s, i) => { if (s && s.stack <= 0) busts.push(i); });
        const alive = g.seats.filter((x) => x && x.stack > 0).length;
        busts.sort((a, b) => ((h.startStacks || {})[b] || 0) - ((h.startStacks || {})[a] || 0));
        busts.forEach((i, k) => {
          const s = g.seats[i];
          this.sng.places.push([s.id, s.name, alive + 1 + k]);
          this.say(s.name + ' finishes in place ' + (alive + 1 + k) + '.');
          const L = this.led(s.id, s.name); L.on = false;
          g.seats[i] = null;
        });
      }
      g.seats.forEach((s, i) => {
        if (!s) return;
        if (s.pendingRebuy) { const a = s.pendingRebuy; s.pendingRebuy = 0; this.rebuy(i, a); }
        if (s.leaving) { s.leaving = false; this.removeSeat(i); return; }
        if (s.stack <= 0) {
          if (this.cfg.mode === 'sng' && this.sng.started) return;
          else if (s.bot) this.rebuy(i, this.cfg.stack);
          else s.busted = true;
        }
      });
      if (this.cfg.mode === 'sng' && this.sng.started) {
        const alive = g.seats.filter((x) => x && x.stack > 0);
        if (alive.length === 1) {
          this.sng.places.push([alive[0].id, alive[0].name, 1]);
          this.sng.over = true; this.sng.started = false;
          this.say(alive[0].name + ' wins the tournament!');
          this.phase = 'over'; this.dirty = true; return;
        }
      }
      // a real table pauses after a hand: time to see who won and with what
      const extra = h.phase === 'void' ? 0 : h.uncontested >= 0 ? 600 : 3600 + (h.boards.length - 1) * 1500;
      this.phase = 'next';
      this.nextAt = Date.now() + ms(2800 + extra);
      this.dirty = true;
    }

    doReveal(hn, who) {
      hn = int(hn, 0, 1e9);
      const h = this.g.h;
      if (h && h.no === hn && this.g.handLive()) { this.say('Hand #' + hn + ' is still being played. You can audit it once it ends.'); return; }
      const rec = this.fairRec[hn];
      if (!rec) { this.say('No shuffle record for hand #' + hn + ' on this dealer device (it may have changed hosts).'); return; }
      this.reveal = [hn, rec.secret, rec.seeds, rec.kind, rec.order, rec.hole]; this.revealAt = Date.now();
      this.say((clean(who, 16) || 'Someone') + ' requested an audit of hand #' + hn + '. The shuffle secret is now public.');
    }
    doRabbit(hn) {
      const h = this.g.h;
      if (!this.cfg.rabbit || !h || h.no !== int(hn, 0, 1e9) || h.phase !== 'done' || !h.rabbit) return;
      this.rabbit = [h.no, h.rabbit];
      this.dirty = true;
    }

    // ---- hand start: commit, gather entropy, deal
    async beginShuffle() {
      const g = this.g;
      this.applyPending();
      if (!g.canStart()) { this.phase = 'wait'; this.dirty = true; return; }
      if (this.cfg.mode === 'sng' && !this.sng.started) { this.phase = 'wait'; this.dirty = true; return; }
      this.busy = true;
      try {
        const secret = PK.fair.randHex(16);
        const commit = await PK.fair.sha256hex(secret);
        this.shuffle = { no: g.handNo + 1, secret, commit, until: Date.now() + ms(2600) }; // time to watch the shuffle
        this.phase = 'shuffle';
        if (this.reveal && !this.cfg.autoReveal && Date.now() - (this.revealAt || 0) > 20000) this.reveal = null;
        this.rabbit = null; this.eq = null;
        this.event('shuffle', -1, g.handNo + 1);
        this.dirty = true;
      } finally { this.busy = false; }
    }

    seedsReady() {
      const no = this.shuffle.no;
      for (const i of this.humanSeats()) {
        const s = this.g.seats[i];
        if (!this.g.eligible(i) || s.id === this.c.pid) continue;
        const p = this.peerFor(s.id);
        if (!p) continue;
        const sd = (p.presence || {}).sd;
        if (!Array.isArray(sd) || sd[0] !== no) return false;
      }
      return true;
    }

    async deal() {
      const g = this.g;
      this.busy = true;
      try {
        if (!g.canStart()) { this.phase = 'wait'; this.dirty = true; return; }
        const no = this.shuffle.no;
        const seeds = [];
        for (const i of this.humanSeats()) {
          if (!g.eligible(i)) continue;
          const s = g.seats[i];
          let hex = null;
          if (s.id === this.c.pid) hex = this.c.seedFor(no);
          else { const p = this.peerFor(s.id); const sd = p && (p.presence || {}).sd; if (Array.isArray(sd) && sd[0] === no) hex = clean(sd[1], 16).replace(/[^0-9a-f]/g, ''); }
          if (hex) seeds.push(i + ':' + hex);
        }
        // game for this hand
        let game = this.cfg.game;
        if (game === 'dealers') {
          const n = g.eligibleSeats().length;
          if (!this.rot.per) this.rot.per = n;
          if (this.rot.count >= this.rot.per) { this.rot.idx = (this.rot.idx + 1) % this.cfg.gl.length; this.rot.count = 0; this.rot.per = n; }
          game = this.cfg.gl[this.rot.idx % this.cfg.gl.length];
          this.rot.count++;
        }
        const V = PK.VARIANTS[game];
        const lim = this.cfg.lim || V.lim;
        // tournament level
        if (this.cfg.mode === 'sng' && this.sng.started && Date.now() >= this.sng.endAt) {
          this.sng.level = Math.min(this.sng.level + 1, BLIND_MULT.length - 1);
          this.sng.endAt = Date.now() + this.cfg.lvlMin * 60000;
          const b = this.blinds();
          this.say('Blinds are now ' + b.sb + '/' + b.bb + '.');
        }
        const bl = this.blinds();
        const bomb = this.bombNext || (this.cfg.bombEvery > 0 && (g.handNo + 1) % this.cfg.bombEvery === 0);
        this.bombNext = false;
        if (this.doubleNext) { g.cfg = Object.assign({}, this.cfg, { double: true }); }
        const { deck } = await PK.fair.deckFor(V.deck, this.shuffle.secret, seeds);
        const firstButton = g.button < 0 ? (() => { const e = g.eligibleSeats(); return e[Math.floor(Math.random() * e.length)]; })() : null;
        g.startHand(deck, { game, lim, sb: bl.sb, bb: bl.bb, ante: bl.ante, bomb, bombAmt: this.cfg.bombAmt, button: firstButton });
        if (this.doubleNext) { this.doubleNext = false; g.cfg = this.cfg; }
        const h = g.h;
        this.fairRec[h.no] = { secret: this.shuffle.secret, commit: this.shuffle.commit, seeds, kind: V.deck, order: h.order.slice(), hole: V.hole };
        const old = Object.keys(this.fairRec).map(Number).filter((x) => x < h.no - 60);
        for (const k of old) delete this.fairRec[k];
        this.seedsUsed = seeds;
        this.cipher = {}; this.encFor = {};
        this.phase = 'hand';
        this.turnSeen = -1;
        this.ritVotes = {};
        await this.encryptAll();
        this.afterEngine();
      } catch (e) {
        console.error(e);
        this.say('Could not deal: ' + e.message);
        this.phase = 'next'; this.nextAt = Date.now() + 3000;
      } finally { this.busy = false; this.dirty = true; }
    }

    async encryptAll() {
      const g = this.g, h = g.h;
      if (!h) return;
      const jobs = [];
      const no = h.no;
      for (const k in h.pl) {
        const s = g.seats[k];
        if (!s || s.bot || s.id === this.c.pid) continue;
        const p = this.peerFor(s.id);
        const pk = p && (p.presence || {}).pk;
        if (!pk || this.encFor[k] === pk + '|' + h.pl[k].hole.join('')) continue;
        const hole = h.pl[k].hole.join('');
        jobs.push((async () => {
          try {
            const key = await PK.fair.sharedKey(this.c.keys.priv, pk);
            const ct = await PK.fair.seal(key, hole, this.id + '|' + no + '|' + k);
            if (!this.g.h || this.g.h.no !== no) return; // a new hand started meanwhile
            this.cipher[k] = ct;
            this.encFor[k] = pk + '|' + hole;
          } catch (e) { console.warn('encrypt failed', e); }
        })());
      }
      await Promise.all(jobs);
      if (jobs.length) this.dirty = true;
    }

    // ---- connection bookkeeping
    syncConnections() {
      const g = this.g;
      g.seats.forEach((s) => {
        if (!s || s.bot) return;
        const conn = s.id === this.c.pid || !!this.peerFor(s.id);
        if (conn !== !s.disc) { s.disc = !conn; this.dirty = true; }
      });
    }

    // ---- timers
    tick() {
      if (this.busy || this.stopped || this.inTick) return;
      this.inTick = true;
      try { this.tickInner(); } finally { this.inTick = false; }
    }
    tickInner() {
      const now = Date.now();
      this.syncConnections();
      this.processIntents();
      if (this.vote) this.checkVote();
      if (!this.paused) this.advance(now);
      // re-encrypt hole cards for anyone whose key changed (page reload) or who just discarded
      const h = this.g.h;
      if (h && this.g.handLive() && !this.encrypting) {
        let needs = false;
        for (const k in h.pl) {
          const s = this.g.seats[k];
          if (!s || s.bot || s.id === this.c.pid) continue;
          const p = this.peerFor(s.id), pk = p && (p.presence || {}).pk;
          if (pk && this.encFor[k] !== pk + '|' + h.pl[k].hole.join('')) needs = true;
        }
        if (needs) { this.encrypting = true; this.encryptAll().finally(() => { this.encrypting = false; }); }
      }
      if (this.dirty) this.publish();
    }

    advance(now) {
      const g = this.g;
      switch (this.phase) {
        case 'wait':
          if (g.canStart() && (this.cfg.mode === 'cash' || this.sng.started)) this.beginShuffle();
          return;
        case 'next':
          if (now >= this.nextAt) this.beginShuffle();
          return;
        case 'shuffle':
          if (now >= this.shuffle.until || (now >= this.shuffle.until - ms(500) && this.seedsReady())) this.deal();
          return;
        case 'hand': return this.advanceHand(now);
      }
    }

    advanceHand(now) {
      const g = this.g, h = g.h;
      if (!h) return;
      if (h.phase === 'done' || h.phase === 'void') return this.onHandDone();
      if (h.phase === 'bet') {
        const s = h.toAct, seat = g.seats[s];
        if (this.turnSeen !== h.turnId) {
          this.turnSeen = h.turnId;
          const t = this.cfg.timer;
          this.dl = t ? now + t * 1000 : 0; this.tbu = false;
          if (seat && seat.disc) this.dl = now + Math.min(t || 15, 10) * 1000;
          // dealer's pause when a new street is dealt (chips go in, cards come out), then a human-like think time for bots
          const newStreet = this.lastStreetKey !== h.no + ':' + h.street;
          this.lastStreetKey = h.no + ':' + h.street;
          const streetPause = newStreet && h.street > 0 ? 1300 : 0;
          if (streetPause && this.dl) this.dl += streetPause;
          if (seat && seat.bot) {
            const L = g.legal(s), facing = L && !L.check, big = facing && L.call > (L.pot || 0) * 0.4;
            this.botAt = now + ms(streetPause + 1200 + Math.random() * 1600 + (facing ? 700 : 0) + (big ? 1200 + Math.random() * 1500 : 0));
          }
          this.dirty = true;
        }
        if (!seat) return;
        if (seat.leaving || seat.sitOut) return this.autoAct(s, false);
        if (seat.bot) { if (now >= this.botAt) this.botAct(s); return; }
        if (this.dl && now >= this.dl) {
          const bank = this.tbank[seat.id] || 0;
          if (!this.tbu && bank > 0 && !seat.disc) {
            this.tbu = true; this.tbStart = now; this.dl = now + bank * 1000;
            this.dirty = true; return;
          }
          if (this.tbu) this.tbank[seat.id] = 0;
          this.autoAct(s, true);
        }
        return;
      }
      if (h.phase === 'rit') {
        const live = g.livePlayers();
        let all = true, allYes = true;
        for (const p of live) {
          const st = g.seats[p.s];
          let v = this.ritVotes[p.s];
          if (st.bot) v = true;
          if (this.cfg.rit === 'always') v = true;
          if (v == null) { all = false; allYes = false; } else if (!v) allYes = false;
        }
        if ((all || now >= this.ritEnd) && now >= this.runoutAt - ms(600)) {
          g.setRuns(all && allYes ? 2 : 1);
          if (g.h.runs === 2) this.say('Running it twice.');
          this.runoutAt = now + ms(900);
          this.dirty = true;
        }
        return;
      }
      if (h.phase === 'runout') {
        if (now >= this.runoutAt) {
          g.runoutStep();
          this.runoutAt = now + ms(1350);
          if (g.h.phase === 'runout') this.computeEquity();
          this.afterEngine();
        }
        return;
      }
      if (h.phase === 'discard') {
        for (const p of g.livePlayers()) {
          const st = g.seats[p.s];
          if (p.hole.length === 3 && (st.bot || st.sitOut || st.disc || now >= this.discEnd)) {
            g.discard(p.s, PK.botDiscard(p.hole, h.boards[0], h.game));
            this.afterDiscard(p.s);
            if (g.h.phase !== 'discard') break;
          }
        }
        return;
      }
    }

    autoAct(s, timedOut) {
      const g = this.g, L = g.legal(s);
      if (!L) return;
      const seat = g.seats[s];
      if (timedOut && seat) {
        const n = (this.timeouts[seat.id] = (this.timeouts[seat.id] || 0) + 1);
        if (n >= 2 && !seat.sitOut) { seat.sitOut = true; seat.away = true; this.say(seat.name + ' timed out twice and is now sitting out.'); }
      }
      g.act(s, L.check ? 'check' : 'fold');
      this.afterEngine();
    }

    botAct(s) {
      const g = this.g, h = g.h, L = g.legal(s);
      if (!L) return;
      const seat = g.seats[s];
      let d;
      try {
        d = PK.botDecide({ hole: h.pl[s].hole, board: h.boards[0], variant: h.game, L, pot: L.pot, nOpp: g.livePlayers().length - 1, street: h.street, bb: h.bb, stack: seat.stack, persona: seat.persona });
        g.act(s, d.k, d.a);
      } catch (e) { g.act(s, L.check ? 'check' : 'fold'); }
      this.afterEngine();
    }

    // ---- publishing
    buildT() {
      const g = this.g, h = g.h, live = g.handLive();
      const c = this.cfg;
      const S = g.seats.map((s, i) => {
        if (!s) return null;
        let f = 0;
        const p = h && h.pl[i];
        if (p && h.phase !== 'void') { f |= F.IN; if (p.folded) f |= F.FOLD; if (p.allin) f |= F.ALLIN; }
        if (s.sitOut) f |= F.OUT;
        if (s.disc) f |= F.DISC;
        if (s.bot) f |= F.BOT;
        if (h && h.pay && h.pay[i] && (h.phase === 'done')) f |= F.WIN;
        if (s.leaving) f |= F.LEAVE;
        if (s.busted || s.stack <= 0) f |= F.BUST;
        if (s.away) f |= F.AWAY;
        return [s.id, s.name, s.color | 0, s.stack, p && live ? p.bet : 0, f, (p && s.last) || '', p ? p.hole.length : 0, s.bot ? 0 : Math.round(this.tbank[s.id] || 0), s.persona || 0];
      });
      const T = {
        v: 1, id: this.id, ep: this.ep, born: this.born, sv: ++this.sv, now: Date.now(),
        c: { n: c.name, s: c.seats, m: c.mode, g: c.game, gl: c.gl, l: c.lim, sb: c.sb, bb: c.bb, an: c.ante, ba: c.bbAnte ? 1 : 0, st: c.straddle ? 1 : 0, bi: c.stack, mn: c.minBuy, mx: c.maxBuy, tm: c.timer, tb: c.timeBank, rt: c.rit, db: c.double ? 1 : 0, be: c.bombEvery, bm: c.bombAmt, b72: c.bounty72, rh: c.rabbit ? 1 : 0, lv: c.lvlMin, ar: c.autoReveal ? 1 : 0 },
        ph: this.paused ? 'paused' : this.phase,
        hn: g.handNo, btn: g.button, S,
        ev: this.g.evs.slice(-16).map((e) => [e.i, e.k, e.s == null ? -1 : e.s, e.a || 0, e.t || (e.cards ? e.cards.join('') : '') || e.what || e.street || (e.x != null ? String(e.x) : '') || (e.runs ? String(e.runs) : '')]),
        host: [this.c.pid, this.c.nick],
      };
      if (this.msg) T.msg = this.msg;
      if (this.phase === 'shuffle' && this.shuffle) { T.hp = 'shuffle'; T.cm = this.shuffle.commit; T.nh = this.shuffle.no; }
      if (h && this.phase !== 'shuffle') {
        T.hp = h.phase; T.g = h.game; T.l = h.lim; T.bl = [h.sb, h.bb, h.ante]; T.bomb = h.bomb ? 1 : 0;
        T.bd = h.boards; T.pot = h.phase === 'done' || h.phase === 'void' ? 0 : g.potTotal() - g.betsTotal();
        T.od = h.order; T.cm = (this.fairRec[h.no] || {}).commit; T.sd = (this.fairRec[h.no] || {}).seeds;
        if (live) T.ss = h.order.reduce((o, s) => { o[s] = h.startStacks[s]; return o; }, new Array(g.seats.length).fill(null));
        T.hc = this.cipher;
        const sh = {};
        for (const s in h.shown) sh[s] = h.shown[s].join('');
        T.sh = sh;
        if (h.phase === 'bet') {
          T.ta = h.toAct; T.tn = h.turnId; T.dl = this.dl; T.tbu = this.tbu ? 1 : 0;
          const L = g.legal(h.toAct);
          if (L) T.la = [L.toCall, L.call, L.check ? 1 : 0, L.raise ? 1 : 0, L.minTo, L.maxTo, L.isBet ? 1 : 0, L.stack + L.bet];
        }
        if (h.phase === 'rit') { T.rv2 = Object.keys(this.ritVotes).map(Number); T.dl = this.ritEnd; }
        if (h.phase === 'discard') { T.dc = g.pendingDiscards(); T.dl = this.discEnd; }
        if (this.eq && (h.phase === 'rit' || h.phase === 'runout' || h.phase === 'done')) T.eq = this.eq;
        if (h.results && h.phase === 'done') {
          T.res = h.results.map((r) => [r.pot, r.board, r.type === 'lo' ? 1 : 0, r.winners, r.amount, r.name, (r.cards || []).join(''), r.why || '', r.runner == null ? -1 : r.runner]);
          T.hnm = h.handNames || {};
          if (h.bounty) T.bty = [h.bounty.s, h.bounty.a];
          T.unc = h.uncontested;
          if (h.rabbit && this.cfg.rabbit) T.rb = 1;
        }
        if (h.phase === 'void') T.hp = 'void';
      }
      if (this.phase === 'next' || this.phase === 'wait') T.nx = this.nextAt;
      if (this.paused) T.pd = 1;
      if (this.rabbit) T.rab = this.rabbit;
      if (this.reveal) T.rv = this.reveal;
      if (this.vote) T.vt = [this.vote.id, this.vote.k, this.vote.q, this.vote.by, [...this.vote.y].map((pid) => this.seatOf(pid)), [...this.vote.n].map((pid) => this.seatOf(pid)), this.vote.need || 1, this.vote.end];
      if (c.mode === 'sng') {
        const b = this.blinds();
        T.lvl = [this.sng.level, b.sb, b.bb, b.ante, this.sng.endAt, this.sng.started ? 1 : 0];
        if (this.sng.places.length) T.pl = this.sng.places.map((p) => [p[1], p[2]]);
      }
      if (this.pending) T.pend = 1;
      return T;
    }

    buildM() {
      const L = Object.entries(this.ledger).map(([pid, r]) => {
        const seat = this.seatOf(pid);
        const cur = seat >= 0 ? this.g.seats[seat].stack : r.out;
        return [pid, r.nm, r.buy, cur, seat >= 0 ? 1 : 0];
      });
      const X = Object.entries(this.stats).map(([pid, s]) => [pid, s.h, s.v, s.p, s.w, s.big, s.sd, s.sdw]);
      return { L: L.slice(-24), X: X.slice(-24) };
    }

    publish() {
      this.dirty = false;
      const T = this.buildT();
      const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
      const bytes = () => (enc ? enc.encode(JSON.stringify(T)).length : JSON.stringify(T).length * 2);
      // Keep inside the 4 KiB presence budget (with room for the host's own name and key):
      // trim the least important fields first.
      const LIMIT = 3600;
      const trims = [
        () => { T.ev = T.ev.slice(-6); },
        () => { delete T.hnm; },
        () => { T.res = (T.res || []).map((r) => { r[7] = ''; return r; }); },
        () => { delete T.c.gl; delete T.msg; },
        () => { T.ev = T.ev.slice(-2); delete T.sd; },
        () => { T.S = T.S.map((e) => (e ? [e[0], e[1].slice(0, 10)].concat(e.slice(2)) : e)); },
      ];
      let n = bytes();
      for (const t of trims) { if (n <= LIMIT) break; t(); n = bytes(); }
      if (n > LIMIT) { delete T.res; delete T.hnm; delete T.ev; delete T.rv; delete T.vt; T.ev = []; n = bytes(); }
      this.lastSize = n;
      this.c.publishHost(T, this.buildM());
    }
  }

  // ---------------- client (every device) ----------------
  class Client {
    constructor() {
      this.listeners = {};
      this.T = null; this.M = null; this.lastT = null; this.lastM = null;
      this.host = null; this.hostPeer = null; this.hostGoneAt = 0;
      this.myCards = null; this.myCardsKey = '';
      this.chat = []; this.chatSeen = new Set(); this.myChat = []; this.chatId = 0;
      this.rq = {}; this.seeds = {}; this.nonce = Date.now() % 100000;
      this.mode = 'starting';
      this.peerMap = new Map();
      // name typed on a previous visit, shown on the first screen before the room is connected
      try { const sv = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem('br.me.anon')) || '{}'); this.nick = clean(sv.nick, 16) || ''; } catch (e) { this.nick = ''; }
    }
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, d) { for (const fn of this.listeners[ev] || []) { try { fn(d); } catch (e) { console.error(e); } } }

    async init(api) {
      this.keys = await PK.fair.newKeyPair();
      const claudeApi = api || (typeof window !== 'undefined' && window.claude);
      let room = null, user = null, profileName = '';
      try { if (claudeApi && claudeApi.use) [room, user] = await Promise.all([claudeApi.use('room'), claudeApi.use('user')]); } catch (e) { room = null; }
      this.user = user;
      if (user) {
        try {
          const me = await user.me();
          this.by = me.id || null;
          profileName = me.name || '';
          this.isOwner = !!me.isOwner;
        } catch (e) {}
      }
      // saved name/colour per account (two people on one browser keep their own)
      this.storeKey = this.storeKey || ('br.me.' + (this.by || 'anon'));
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(this.storeKey) || '{}'); } catch (e) {}
      this.localPid = saved.pid || PK.fair.randHex(8);
      this.nick = this.pendingNick || clean(saved.nick, 16) || clean(profileName.split(' ')[0], 16);
      this.color = saved.color != null ? saved.color : Math.floor(Math.random() * 12);
      if (!this.nick) this.nick = 'Player ' + (Math.floor(Math.random() * 90) + 10);
      this.online = !!room;
      this.room = room || new LocalRoom();
      this.pid = this.by || this.localPid;
      this.saveMe();
      this.room.onPeers(() => this.onPeers(), (e) => { this.emit('net', { error: e.code }); });
      if (this.room.onConnection) this.room.onConnection((c) => { this.connected = c; this.emit('net', { connected: c }); });
      // A side room for chat, ledger and stats keeps the main presence small.
      this.meta = null;
      if (this.online) {
        try { this.meta = await this.room.join('br-meta'); this.meta.onPeers(() => this.onMeta()); } catch (e) { this.meta = null; }
      }
      await this.pushBase();
      this.mode = this.online ? 'online' : 'offline';
      heartbeat(500, () => this.housekeeping());
      this.emit('ready', {});
    }
    saveMe() { try { localStorage.setItem(this.storeKey, JSON.stringify({ pid: this.localPid, nick: this.nick, color: this.color })); } catch (e) {} }
    pushBase() { if (!this.room || !this.keys) return Promise.resolve(); return this.room.presence({ v: 1, pid: this.localPid, nm: this.nick, cl: this.color, pk: this.keys.pub }).catch(() => {}); }
    setNick(n, color) {
      if (!this.storeKey) { this.pendingNick = clean(n, 16) || this.pendingNick; if (this.pendingNick) this.nick = this.pendingNick; return; } // not connected yet
      this.nick = clean(n, 16) || this.nick;
      if (color != null) this.color = color | 0;
      this.saveMe(); this.pushBase();
      if (this.host) { const s = this.host.seatOf(this.pid); if (s >= 0) { this.host.g.seats[s].name = this.nick; this.host.g.seats[s].color = this.color; this.host.dirty = true; } }
    }

    // pid: platform id when available (unforgeable), else the page's own random id
    pidOf(p) { return p.by || (p.presence && clean(p.presence.pid, 24)) || null; }
    peerList() { return this.room.peers().filter((p) => p.kind !== 'agent' && !p.sameTab); }
    peerByPid(pid) { return this.peerMap.get(pid) || null; }

    onPeers() {
      const peers = this.room.peers();
      this.peerMap = new Map();
      for (const p of peers) { if (p.sameTab || p.kind === 'agent') continue; const id = this.pidOf(p); if (id) this.peerMap.set(id, p); }
      this.electHost();
      // the dealer reacts to intents as soon as presence changes, not on the next timer tick
      if (this.host) this.host.tick();
      this.emit('peers', peers);
    }

    // How many distinct people (not tabs) currently follow a given dealer device.
    followers(peerLabel) {
      const seen = new Set();
      for (const p of this.room.peers()) {
        if (p.kind === 'agent' || !p.presence || p.presence.fh !== peerLabel) continue;
        seen.add(p.sameTab ? this.pid : this.pidOf(p) || p.peer);
      }
      return seen.size;
    }

    // Choose which device's table to follow. A dealer that is still here keeps the table unless most
    // people already follow another one, so nobody can take over just by publishing a bigger epoch.
    electHost() {
      const peers = this.room.peers();
      const hosts = peers.filter((p) => p.presence && p.presence.T && p.presence.T.v === 1 && p.kind !== 'agent');
      const T_ = (p) => p.presence.T;
      const cmpPeer = (a, b) => (a.peer < b.peer ? -1 : a.peer > b.peer ? 1 : 0);
      let best = null;
      const cur = this.hostPeer && !this.hostGoneAt ? hosts.find((p) => p.peer === this.hostPeer.peer) : null;
      if (cur && this.T && T_(cur).id === this.T.id) {
        best = cur;
        const fc = this.followers(cur.peer);
        for (const a of hosts) if (a !== cur && this.followers(a.peer) > fc) best = a;
      } else {
        let cands = hosts;
        const last = this.lastT;
        if (last) { const same = hosts.filter((p) => T_(p).id === last.id); if (same.length) cands = same; }
        const near = (p) => (last && T_(p).id === last.id && T_(p).ep <= last.ep + 1 ? 0 : 1);
        cands = cands.slice().sort((a, b) => (this.followers(b.peer) - this.followers(a.peer)) || (near(a) - near(b)) || (T_(b).ep - T_(a).ep) || (T_(a).born - T_(b).born) || cmpPeer(a, b));
        best = cands[0] || null;
      }
      // a dealer device stands down when people follow someone else, or loses a tie to an older table
      if (this.host) {
        const mine = hosts.find((p) => p.sameTab);
        const myF = mine ? this.followers(mine.peer) : 0;
        for (const o of hosts) {
          if (o.sameTab) continue;
          const oF = this.followers(o.peer);
          const tieLoss = oF === myF && myF <= 1 && (T_(o).born < this.host.born || (T_(o).born === this.host.born && mine && cmpPeer(o, mine) < 0));
          if (oF > myF || tieLoss) {
            this.host.stop(); this.host = null;
            this.room.presence({ T: null }).catch(() => {});
            if (this.meta) this.meta.presence({ M: null }).catch(() => {});
            best = o;
            break;
          }
        }
        if (this.host && mine) best = mine;
      }
      if (best) {
        this.hostPeer = best; this.hostGoneAt = 0;
        if (this.fhSent !== best.peer) { this.fhSent = best.peer; this.room.presence({ fh: best.peer }).catch(() => {}); }
        const T = T_(best);
        if (!this.T || T.sv !== this.T.sv || T.id !== this.T.id || T.ep !== this.T.ep) this.setT(T);
      } else if (this.T && !this.host) {
        if (!this.hostGoneAt) { this.hostGoneAt = Date.now(); this.emit('hostgone', {}); }
      }
    }

    onMeta() {
      if (!this.meta) return;
      const peers = this.meta.peers();
      let M = null;
      for (const p of peers) {
        const pr = p.presence || {};
        if (pr.M && this.hostPeer && p.peer === this.hostPeer.peer) M = pr.M;
        if (Array.isArray(pr.ch)) this.mergeChat(p, pr.ch);
        if (Array.isArray(pr.rx) && !p.sameTab) this.mergeReaction(p, pr.rx);
      }
      if (this.host) M = this.host.buildM();
      if (M) { this.M = M; this.lastM = M; this.emit('meta', M); }
    }

    lobbyPeer(peer) { return this.room.peers().find((x) => x.peer === peer) || null; }
    mergeChat(p, list) {
      const lp = p.sameTab ? null : this.lobbyPeer(p.peer);
      const pres = Object.assign({}, (lp && lp.presence) || {}, p.presence || {});
      p = { peer: p.peer, by: p.by, sameTab: p.sameTab, presence: pres };
      const pid = p.sameTab ? this.pid : this.pidOf(p);
      const nm = clean(pres.nm, 16) || 'Someone';
      let added = false;
      for (const m of list.slice(-6)) {
        if (!Array.isArray(m)) continue;
        const key = pid + ':' + m[0];
        if (this.chatSeen.has(key)) continue;
        this.chatSeen.add(key);
        this.chat.push({ pid, nm, cl: (p.presence || {}).cl | 0, text: clean(m[1], 160), ts: Number(m[2]) || Date.now(), me: p.sameTab });
        added = true;
      }
      if (added) { this.chat.sort((a, b) => a.ts - b.ts); if (this.chat.length > 200) this.chat.splice(0, this.chat.length - 200); this.emit('chat', this.chat); }
    }
    mergeReaction(p, rx) {
      const key = p.peer + ':' + rx[0];
      if (this.chatSeen.has(key)) return;
      this.chatSeen.add(key);
      if (Date.now() - (Number(rx[3]) || 0) > 8000) return;
      const lp = this.lobbyPeer(p.peer);
      this.emit('react', { emoji: clean(rx[1], 8), seat: rx[2] | 0, from: clean(((lp && lp.presence) || p.presence || {}).nm, 16) });
    }

    async setT(T) {
      const prev = this.T;
      this.T = T; this.lastT = T;
      this.hostName = T.host ? clean(T.host[1], 16) : '';
      // decrypt my hole cards
      const seat = this.mySeat();
      if (this.host) {
        const h = this.host.g.h;
        const cards = h && seat >= 0 && h.pl[seat] && T.hp !== 'shuffle' && T.hp !== 'void' ? h.pl[seat].hole.slice() : null;
        this.setMyCards(cards, T);
      } else if (seat >= 0 && T.hc && T.hc[seat] && this.hostPeer) {
        const key = T.id + '|' + T.hn + '|' + seat + '|' + T.hc[seat];
        if (key !== this.myCardsKey) {
          this.myCardsKey = key;
          try {
            const k = await PK.fair.sharedKey(this.keys.priv, this.hostPeer.presence.pk);
            const txt = await PK.fair.open(k, T.hc[seat], T.id + '|' + T.hn + '|' + seat);
            const cards = txt.match(/.{2}/g) || [];
            if (this.T && this.T.hn === T.hn) this.setMyCards(cards, T);
          } catch (e) { this.myCardsKey = ''; console.warn('decrypt failed', e); }
        }
      } else if (seat < 0 || !T.hc || T.hp === 'shuffle' || !(T.S[seat] && (T.S[seat][5] & F.IN))) {
        if (this.myCards) this.setMyCards(null, T);
      }
      // entropy for the next shuffle
      if (T.hp === 'shuffle' && T.nh && seat >= 0) {
        const hex = this.seedFor(T.nh);
        const cur = this.room.peers().find((p) => p.sameTab);
        const sd = cur && cur.presence && cur.presence.sd;
        if (!sd || sd[0] !== T.nh) this.room.presence({ sd: [T.nh, hex] }).catch(() => {});
      }
      if (this.T !== T) return; // a newer state arrived while this one was decrypting
      this.emit('state', { T, prev });
    }
    setMyCards(cards, T) {
      const same = (this.myCards || []).join() === (cards || []).join() && this.myCardsHand === (T && T.hn);
      this.myCards = cards; this.myCardsHand = T && T.hn;
      if (!same) this.emit('cards', { cards, hn: T && T.hn });
    }
    seedFor(no) { if (!this.seeds[no]) this.seeds[no] = PK.fair.randHex(8); return this.seeds[no]; }

    mySeat() {
      const T = this.T;
      if (!T || !T.S) return -1;
      return T.S.findIndex((s) => !!s && s[0] === this.pid);
    }

    publishHost(T, M) {
      this.room.presence({ T }).catch((e) => console.warn('presence', e));
      if (this.meta) this.meta.presence({ M }).catch(() => {});
      this.M = M; this.lastM = M;
      // the host's own view updates immediately
      const me = this.room.peers().find((p) => p.sameTab);
      this.hostPeer = me || { peer: 'local', presence: { pk: this.keys.pub, T } };
      if (me && this.fhSent !== me.peer) { this.fhSent = me.peer; this.room.presence({ fh: me.peer }).catch(() => {}); }
      this.setT(T);
      this.emit('meta', M);
    }

    housekeeping() {
      // host migration: the dealer device vanished
      if (this.T && !this.host && this.hostGoneAt && Date.now() - this.hostGoneAt > ms(3500)) {
        const T = this.lastT;
        const peers = this.room.peers().filter((p) => p.kind !== 'agent');
        const seated = [];
        (T.S || []).forEach((s, i) => { if (s && !(s[5] & F.BOT)) { const p = s[0] === this.pid ? peers.find((x) => x.sameTab) : this.peerByPid(s[0]); if (p) seated.push(p); } });
        const pool = seated.length ? seated : peers.slice().sort((a, b) => (a.peer < b.peer ? -1 : 1));
        if (pool[0] && pool[0].sameTab) {
          this.hostGoneAt = 0;
          this.becomeHost(null, { T, M: this.lastM, cfg: decodeCfg(T.c), id: T.id, ep: T.ep, born: T.born, hostName: this.hostName });
        }
      }
      if (this.host) { this.onMeta(); }
      this.emit('tick', {});
    }

    becomeHost(cfg, from) {
      if (this.host) return;
      this.host = new Host(this, cfg, from);
      if (!from) {
        this.host.say(this.nick + ' opened the table.');
      }
      this.host.start();
      this.emit('hosting', {});
    }

    createTable(cfg, opts) {
      if (this.T && !this.host && this.hostPeer && !this.hostGoneAt) return 'A table is already running here';
      this.becomeHost(cfg, null);
      const H = this.host;
      if (opts && opts.sit !== false) H.selfRequest('sit', { seat: opts.seat != null ? opts.seat : 0, buy: H.cfg.stack });
      for (let i = 0; i < ((opts && opts.bots) || 0); i++) H.addBot();
      H.dirty = true; H.tick();
      return null;
    }

    // ---- requests (host applies directly; everyone else uses presence intents)
    req(kind, arg) {
      if (this.host) return this.host.selfRequest(kind, arg);
      const n = ++this.nonce;
      const rq = Object.assign({}, this.rq);
      switch (kind) {
        case 'sit': rq.sit = [arg.seat == null ? -1 : arg.seat, arg.buy | 0, n]; delete rq.lv; break;
        case 'leave': rq.lv = n; delete rq.sit; break;
        case 'sitout': rq.so = !!arg; break;
        case 'rebuy': rq.rb = [arg | 0, n]; break;
        case 'show': rq.sh = arg; break;
        case 'rit': rq.rt = [this.T && this.T.hn, arg ? 1 : 0]; break;
        case 'discard': rq.dc = [this.T && this.T.hn, arg | 0]; break;
        case 'audit': rq.au = arg; break;
        case 'rabbit': rq.rh = arg; break;
        case 'propose': rq.nv = [n, arg]; break;
        case 'vote': rq.vt = [arg.id, arg.yes ? 1 : 0, n]; break;
        case 'act': this.room.presence({ a: [this.T.hn, this.T.tn, arg.k, arg.a | 0, n] }).catch(() => {}); return null;
      }
      this.rq = rq;
      this.room.presence({ rq }).catch(() => {});
      return null;
    }

    sendChat(text) {
      text = clean(text, 160);
      if (!text) return;
      this.myChat.push([++this.chatId, text, Date.now()]);
      this.myChat = this.myChat.slice(-5);
      const target = this.meta || this.room;
      target.presence({ ch: this.myChat }).catch(() => {});
      this.mergeChat({ sameTab: true, presence: { nm: this.nick, cl: this.color } }, this.myChat);
    }
    react(emoji, seat) {
      const rx = [++this.chatId, emoji, seat, Date.now()];
      const target = this.meta || this.room;
      target.presence({ rx }).catch(() => {});
      this.emit('react', { emoji, seat, from: this.nick, mine: true });
    }
  }

  function decodeCfg(c) {
    if (!c) return Object.assign({}, DEFAULTS);
    return { name: c.n, seats: c.s, mode: c.m, game: c.g, gl: c.gl, lim: c.l, sb: c.sb, bb: c.bb, ante: c.an, bbAnte: !!c.ba, straddle: !!c.st, stack: c.bi, minBuy: c.mn, maxBuy: c.mx, timer: c.tm, timeBank: c.tb, rit: c.rt, double: !!c.db, bombEvery: c.be, bombAmt: c.bm, bounty72: c.b72, rabbit: !!c.rh, lvlMin: c.lv, autoReveal: !!c.ar };
  }

  PK.Host = Host; PK.Client = Client; PK.decodeCfg = decodeCfg; PK.BLIND_MULT = BLIND_MULT;
})(typeof window !== 'undefined' ? (window.PK = window.PK || {}) : (globalThis.PK = globalThis.PK || {}));

/* No-account multiplayer transport.
   Every message is end-to-end encrypted with a key derived from the room code in the link (#code),
   then sent through several free public relays at once (Nostr relays + a public MQTT broker).
   Any one relay working is enough. Exposes the same small "room" API the game uses
   (presence / peers / onPeers / join), built from heartbeats. */
(function (PK) {
  'use strict';
  // several independent relays: any one of them reaching both players is enough
  const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom', 'wss://relay.damus.io', 'wss://offchain.pub', 'wss://nostr-pub.wellorder.net'];
  const MQTT_URL = 'wss://public.cloud.shiftr.io';
  const KIND = 21337; // ephemeral: relays forward it but never store it
  const ALPH = '23456789abcdefghjkmnpqrstuvwxyz';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const HEARTBEAT = 4000, EXPIRE = 13000;

  function newCode() {
    const u = new Uint8Array(12);
    crypto.getRandomValues(u);
    let s = '';
    for (let i = 0; i < 12; i++) { s += ALPH[u[i] % ALPH.length]; if (i === 3 || i === 7) s += '-'; }
    return s;
  }
  function parseCode(h) {
    const m = String(h || '').toLowerCase().replace(/^#/, '').match(/^([2-9a-z]{4})-?([2-9a-z]{4})-?([2-9a-z]{4})$/);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  }
  async function sha(str) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(str))); }
  const hex = (u) => [...u].map((x) => x.toString(16).padStart(2, '0')).join('');

  class Bus {
    constructor(code) {
      this.code = code;
      this.peer = 'p' + PK.fair.randHex(6);
      this.handlers = [];
      this.connHandlers = [];
      this.seen = new Map();
      this.sockets = [];
      this.mq = null;
      this.open = new Set();
      this.stats = { sent: 0, recv: 0 };
    }
    async start() {
      this.topic = hex(await sha('brpoker:v1:topic:' + this.code)).slice(0, 32);
      this.key = await crypto.subtle.importKey('raw', await sha('brpoker:v1:key:' + this.code), 'AES-GCM', false, ['encrypt', 'decrypt']);
      this.sk = window.NostrTools ? window.NostrTools.generateSecretKey() : null;
      if (this.sk) for (const url of RELAYS) this.openNostr(url, 0);
      if (window.mqtt) this.openMqtt();
      // phones pause pages in the background and drop their connections: reconnect at once when the page is back
      if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.addEventListener) {
        const wake = () => { if (!document.hidden) this.wake(); };
        document.addEventListener('visibilitychange', wake);
        window.addEventListener('pageshow', wake);
        window.addEventListener('online', wake);
        window.addEventListener('focus', wake);
      }
    }
    wake() {
      if (this.closed) return;
      const now = Date.now();
      if (now - (this.lastWake || 0) < 1500) return;
      this.lastWake = now;
      for (const url of RELAYS) {
        const s = this.sockets.find((x) => x.url === url);
        if (!s || s.ws.readyState > 1) { if (s) s.dead = true; this.openNostr(url, 0); }
      }
      if (this.mq && !this.mq.connected) { try { this.mq.reconnect(); } catch (e) {} }
      for (const h of this.wakeHandlers || []) { try { h(); } catch (e) {} }
    }
    onWake(h) { (this.wakeHandlers = this.wakeHandlers || []).push(h); }
    setOpen(id, on) {
      const before = this.open.size > 0;
      if (on) this.open.add(id); else this.open.delete(id);
      const after = this.open.size > 0;
      if (before !== after) for (const h of this.connHandlers) { try { h(after); } catch (e) {} }
    }
    connected() { return this.open.size > 0; }
    channels() { return [...this.open]; }

    openNostr(url, attempt) {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return; }
      const s = { url, ws, limited: 0 };
      this.sockets = this.sockets.filter((x) => x.url !== url).concat([s]);
      ws.onopen = () => {
        ws.send(JSON.stringify(['REQ', 'brp', { kinds: [KIND], '#t': [this.topic], since: Math.floor(Date.now() / 1000) - 5 }]));
        this.setOpen(url, true);
        attempt = 0;
      };
      ws.onmessage = (e) => {
        let d; try { d = JSON.parse(e.data); } catch (x) { return; }
        if (d[0] === 'EVENT' && d[2] && d[2].kind === KIND) this.receive(d[2].content);
        else if (d[0] === 'OK' && d[2] === false && /rate/i.test(d[3] || '')) s.limited = Date.now() + 5000;
      };
      ws.onclose = () => {
        if (s.dead) return; // replaced by a fresh socket already
        this.setOpen(url, false);
        if (this.closed) return;
        const wait = Math.min(15000, 1000 * Math.pow(2, attempt));
        setTimeout(() => { if (!s.dead) { s.dead = true; this.openNostr(url, attempt + 1); } }, wait);
      };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    }

    openMqtt() {
      try {
        const c = window.mqtt.connect(MQTT_URL, { username: 'public', password: 'public', clientId: 'brp' + PK.fair.randHex(6), reconnectPeriod: 3000, connectTimeout: 8000, keepalive: 30, clean: true });
        this.mq = c;
        c.on('connect', () => { c.subscribe('brpoker/' + this.topic); this.setOpen('mqtt', true); });
        c.on('close', () => this.setOpen('mqtt', false));
        c.on('offline', () => this.setOpen('mqtt', false));
        c.on('error', () => {});
        c.on('message', (t, m) => this.receive(typeof m === 'string' ? m : dec.decode(m)));
      } catch (e) { this.mq = null; }
    }

    async seal(obj) {
      const iv = new Uint8Array(12);
      crypto.getRandomValues(iv);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, enc.encode(JSON.stringify(obj))));
      const out = new Uint8Array(12 + ct.length);
      out.set(iv); out.set(ct, 12);
      return PK.fair.b64(out);
    }
    async open_(b64) {
      const u = PK.fair.unb64(b64);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, this.key, u.slice(12));
      return JSON.parse(dec.decode(pt));
    }

    async send(obj) {
      if (this.closed) return;
      const payload = await this.seal(obj);
      this.stats.sent++;
      if (this.sk) {
        const ev = window.NostrTools.finalizeEvent({ kind: KIND, created_at: Math.floor(Date.now() / 1000), tags: [['t', this.topic]], content: payload }, this.sk);
        const msg = JSON.stringify(['EVENT', ev]);
        for (const s of this.sockets) if (s.ws.readyState === 1 && !(s.limited > Date.now())) { try { s.ws.send(msg); } catch (e) {} }
      }
      if (this.mq && this.mq.connected) { try { this.mq.publish('brpoker/' + this.topic, payload, { qos: 0 }); } catch (e) {} }
    }

    async receive(payload) {
      if (typeof payload !== 'string' || payload.length > 60000) return;
      let m;
      try { m = await this.open_(payload); } catch (e) { return; } // not ours / tampered
      if (!m || typeof m !== 'object' || typeof m.p !== 'string' || m.p === this.peer) return;
      const id = m.p + ':' + m.s;
      if (this.seen.has(id)) return; // same message via another relay
      this.seen.set(id, Date.now());
      if (this.seen.size > 4000) { const cut = Date.now() - 60000; for (const [k, t] of this.seen) if (t < cut) this.seen.delete(k); }
      this.stats.recv++;
      for (const h of this.handlers) { try { h(m); } catch (e) { console.error(e); } }
    }
    onMessage(h) { this.handlers.push(h); }
    close() {
      this.closed = true;
      for (const s of this.sockets) { try { s.ws.close(); } catch (e) {} }
      if (this.mq) { try { this.mq.end(true); } catch (e) {} }
    }
  }

  // A "room" (lobby or named side room) on top of the bus: presence objects kept fresh by heartbeats.
  class RelayRoom {
    constructor(bus, name) {
      this.bus = bus; this.name = name;
      this.me = { presence: {}, updatedAt: Date.now() };
      this.others = new Map(); // peer -> {presence, updatedAt, s}
      this.hs = []; this.seq = 0; this.timer = null; this.last = 0;
      bus.onMessage((m) => this.handle(m));
      setInterval(() => this.beat(), HEARTBEAT);
      setInterval(() => this.sweep(), 2000);
      bus.onWake(() => { this.hello(); this.sendNow(); });
      if (typeof addEventListener === 'function') addEventListener('pagehide', () => { this.bus.send({ v: 1, p: this.bus.peer, s: this.nextSeq(), r: this.name, k: 'x' }); });
      this.hello();
    }
    nextSeq() { return Date.now() * 100 + (++this.seq % 100); }
    hello() { this.bus.send({ v: 1, p: this.bus.peer, s: this.nextSeq(), r: this.name, k: 'h', d: this.me.presence }); }
    view(peer, o, mine) {
      return Object.freeze({ peer, by: null, isMe: !!mine, sameTab: !!mine, kind: 'viewer', guest: false, presence: o.presence, updatedAt: o.updatedAt });
    }
    peers() {
      const out = [this.view(this.bus.peer, this.me, true)];
      for (const [p, o] of this.others) out.push(this.view(p, o, false));
      return out;
    }
    fire() {
      if (this.firing) return;
      this.firing = true;
      queueMicrotask(() => { this.firing = false; const v = this.peers(); for (const h of this.hs) { try { h({ peers: v }); } catch (e) { console.error(e); } } });
    }
    onPeers(h) { this.hs.push(h); this.fire(); return () => {}; }
    connected() { return this.bus.connected(); }
    onConnection(h) { this.bus.connHandlers.push(h); queueMicrotask(() => h(this.bus.connected())); return () => {}; }
    join(name) { return Promise.resolve(new RelayRoom(this.bus, name)); }
    presence(patch) {
      const n = Object.assign({}, this.me.presence);
      for (const k in patch) { if (patch[k] === null) delete n[k]; else n[k] = patch[k]; }
      this.me = { presence: n, updatedAt: Date.now() };
      this.fire();
      this.schedule();
      return Promise.resolve();
    }
    schedule() {
      // coalesce rapid updates; never more than one send per 70 ms
      if (this.timer) return;
      const wait = Math.max(0, 70 - (Date.now() - this.last));
      this.timer = setTimeout(() => { this.timer = null; this.sendNow(); }, wait);
    }
    sendNow() {
      this.last = Date.now();
      this.bus.send({ v: 1, p: this.bus.peer, s: this.nextSeq(), r: this.name, k: 'p', d: this.me.presence });
    }
    beat() { if (Object.keys(this.me.presence).length) this.sendNow(); }
    sweep() {
      const cut = Date.now() - EXPIRE;
      let changed = false;
      for (const [p, o] of this.others) if (o.updatedAt < cut) { this.others.delete(p); changed = true; }
      if (changed) this.fire();
    }
    handle(m) {
      if (m.r !== this.name) return;
      const o = this.others.get(m.p);
      if (m.k === 'x') { if (o) { this.others.delete(m.p); this.fire(); } return; }
      if (o && m.s <= o.s) return; // out of order
      if (m.k === 'h') {
        // someone arrived: tell them about us soon (jittered so a full table doesn't answer at once)
        if (!this.helloReply) this.helloReply = setTimeout(() => { this.helloReply = null; this.sendNow(); }, 120 + Math.random() * 400);
      }
      if (m.d && typeof m.d === 'object') {
        this.others.set(m.p, { presence: Object.freeze(m.d), updatedAt: Date.now(), s: m.s });
        this.fire();
      } else if (o) { o.updatedAt = Date.now(); o.s = m.s; }
    }
  }

  async function connect(code) {
    const bus = new Bus(code);
    await bus.start();
    const room = new RelayRoom(bus, '');
    PK.bus = bus;
    return { bus, api: { use: async (n) => (n === 'room' ? room : null) } };
  }

  PK.relay = { newCode, parseCode, connect, RELAYS, MQTT_URL };
})(typeof window !== 'undefined' ? (window.PK = window.PK || {}) : (globalThis.PK = globalThis.PK || {}));

/* Synthesised sound effects (no audio files): cards, chips, shuffle, turn chime, win. */
(function (PK) {
  'use strict';
  let ctx = null, master = null, noiseBuf = null;
  const S = { volume: 0.7, muted: false };
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = S.muted ? 0 : S.volume; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }
  ['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, unlock, { passive: true }));
  const ok = () => ctx && ctx.state === 'running' && !S.muted && S.volume > 0;
  function noise(t, dur, freq, q, gain, type) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
  }
  function tone(t, freq, dur, gain, type) {
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  const at = (ms) => ctx.currentTime + (ms || 0) / 1000;
  PK.sfx = {
    settings: S,
    set(vol, muted) { S.volume = vol; S.muted = muted; if (master) master.gain.value = muted ? 0 : vol; },
    deal(delay) { if (!ok()) return; const t = at(delay); noise(t, 0.05, 3200, 1.2, 0.35); noise(t + 0.03, 0.04, 1500, 0.8, 0.12, 'lowpass'); },
    chips(delay) { if (!ok()) return; const t = at((delay || 0) + 300); for (let i = 0; i < 3; i++) { const tt = t + i * 0.035 + Math.random() * 0.01; tone(tt, 3100 + Math.random() * 600, 0.05, 0.08, 'triangle'); noise(tt, 0.03, 5200, 2, 0.12); } },
    shuffle() { if (!ok()) return; const t = at(300); for (let i = 0; i < 24; i++) noise(t + i * 0.022, 0.03, 2600 + Math.random() * 1200, 1.5, 0.16); },
    check() { if (!ok()) return; const t = at(0); tone(t, 190, 0.09, 0.35); tone(t + 0.13, 175, 0.09, 0.3); },
    fold() { if (!ok()) return; noise(at(0), 0.22, 900, 0.7, 0.18, 'lowpass'); },
    turn() { if (!ok()) return; const t = at(0); tone(t, 659, 0.35, 0.18); tone(t + 0.14, 880, 0.5, 0.16); },
    win() { if (!ok()) return; const t = at(0); [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.09, f, 0.5, 0.12, 'triangle')); },
    allin() { if (!ok()) return; const t = at(0); tone(t, 70, 0.6, 0.4); noise(t, 0.5, 6000, 0.5, 0.05, 'highpass'); },
    blip() { if (!ok()) return; tone(at(0), 1200, 0.08, 0.06); },
    tick() { if (!ok()) return; tone(at(0), 1600, 0.03, 0.05, 'square'); },
  };
})(typeof window !== 'undefined' ? (window.PK = window.PK || {}) : (globalThis.PK = globalThis.PK || {}));

/* 3D table: Three.js scene with felt, padded rail, cards, instanced chip stacks,
   riffle shuffle, dealing, chip flights, dealer button and camera views. */
(function (PK) {
  'use strict';
  const T3 = () => window.THREE;
  const DENOMS = [
    { v: 100000, c: '#d65d8e', s: '#fbe3ee' }, { v: 25000, c: '#2aa6a6', s: '#e7fbfb' }, { v: 5000, c: '#e07a2e', s: '#fff1e2' },
    { v: 1000, c: '#e9c33d', s: '#2b2414' }, { v: 500, c: '#7b4bb8', s: '#f1e9ff' }, { v: 100, c: '#1c1c22', s: '#e9e4d8' },
    { v: 25, c: '#1f8a4c', s: '#f2fff6' }, { v: 5, c: '#c93636', s: '#fff0ee' }, { v: 1, c: '#e9e4d8', s: '#3a5bb5' },
  ];
  PK.DENOMS = DENOMS;
  const FELTS = {
    green: { felt: '#17614a', deep: '#0b3a2b', line: '#c9a85a' },
    blue: { felt: '#1d4f7a', deep: '#0e2a45', line: '#c9b06a' },
    red: { felt: '#7a2430', deep: '#43121a', line: '#d4ae6a' },
    purple: { felt: '#4a2d6e', deep: '#25163a', line: '#c7a76a' },
    slate: { felt: '#3b4650', deep: '#1c2228', line: '#b8a27a' },
  };
  PK.FELTS = FELTS;
  const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const SUIT_COLOR2 = { s: '#15151b', c: '#15151b', h: '#c1121f', d: '#c1121f' };
  const SUIT_COLOR4 = { s: '#15151b', c: '#14713f', h: '#c1121f', d: '#1f4fb8' };
  PK.SUIT_GLYPH = SUIT_GLYPH;
  const CW = 0.42, CH = 0.6;
  const TILT = 0.42; // how far face-up cards lean back toward the viewer (radians)
  const ease = { out: (t) => 1 - Math.pow(1 - t, 3), inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), back: (t) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };

  class Scene3D {
    constructor(canvas, opts) {
      const THREE = T3();
      this.opts = Object.assign({ reduced: false, quality: 'high', fourColor: false, felt: 'green', back: 'brass', view: 'player' }, opts || {});
      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.opts.quality === 'low' ? 1 : 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = this.opts.quality !== 'low';
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color('#0d0b0a');
      this.scene.fog = new THREE.Fog('#0d0b0a', 14, 30);
      this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      this.anims = [];
      this.cards = new Map();
      this.piles = new Map();
      this.flights = [];
      this.texCache = new Map();
      this.layoutCbs = [];
      this.n = 9; this.me = -1; this.portrait = false;
      if (typeof document !== 'undefined' && document.fonts && document.fonts.load) document.fonts.load('700 100px "Instrument Sans"').then(() => { this.fontsReady = true; this.refreshFaces(); }).catch(() => {});
      this.needs = true; this.lastHn = -1; this.lastHp = '';
      this.camT = 0; this.drag = null; this.orbit = { yaw: 0, pitch: 0, zoom: 1 };
      this.buildLights();
      this.buildTable();
      this.buildChips();
      this.buildDeck();
      this.buildButton();
      this.buildHighlights();
      this.bindInput();
      this.resize();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    // ---------- construction ----------
    buildLights() {
      const THREE = T3();
      this.buildEnvironment();
      this.scene.add(new THREE.HemisphereLight('#ffe9cc', '#1a1310', 0.35));
      const spot = new THREE.SpotLight('#fff1d6', 2.4, 30, 0.72, 0.7, 0);
      spot.position.set(0, 9, 1.2);
      spot.target.position.set(0, 0, 0);
      spot.castShadow = true;
      spot.shadow.mapSize.set(this.opts.quality === 'high' ? 2048 : 1024, this.opts.quality === 'high' ? 2048 : 1024);
      spot.shadow.bias = -0.0004;
      spot.shadow.radius = 4;
      this.scene.add(spot, spot.target);
      const fill = new THREE.DirectionalLight('#9fb6ff', 0.25);
      fill.position.set(-6, 4, -6);
      this.scene.add(fill);
      const rim = new THREE.DirectionalLight('#ffd7a0', 0.35);
      rim.position.set(5, 3, 7);
      this.scene.add(rim);
    }

    // A small studio (soft boxes over a dark room) baked into reflections, so brass, leather,
    // chips and cards pick up real highlights instead of looking flat.
    buildEnvironment() {
      const THREE = T3();
      try {
        const env = new THREE.Scene();
        env.background = new THREE.Color('#120d0a');
        const panel = (w, h, color, k, pos, look) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
          m.position.set(...pos); m.lookAt(...look); env.add(m);
        };
        panel(6, 6, '#fff1d6', 6, [0, 8, 0], [0, 0, 0]);       // lamp over the table
        panel(10, 3, '#ffcf96', 1.4, [0, 3, 9], [0, 0, 0]);     // warm wall behind the camera
        panel(4, 6, '#9fb6ff', 0.8, [-9, 3, -2], [0, 0, 0]);    // cool fill
        panel(4, 6, '#ffd7a0', 1.0, [9, 3, -2], [0, 0, 0]);     // warm fill
        const pm = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pm.fromScene(env, 0.04).texture;
        pm.dispose();
      } catch (e) { /* reflections are optional */ }
    }

    radii() { return this.portrait ? { rx: 2.15, rz: 3.35 } : { rx: 3.7, rz: 2.15 }; }

    buildTable() {
      const THREE = T3();
      if (this.table) { this.scene.remove(this.table); this.table.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      const { rx, rz } = this.radii();
      const g = new THREE.Group();
      const ell = (a, b) => { const s = new THREE.Shape(); s.absellipse(0, 0, a, b, 0, Math.PI * 2, false, 0); return s; };
      // felt
      const felt = new THREE.Mesh(new THREE.ExtrudeGeometry(ell(rx, rz), { depth: 0.12, bevelEnabled: false, curveSegments: 96 }), this.feltMaterial(rx, rz));
      felt.rotation.x = -Math.PI / 2; felt.position.y = -0.12; felt.receiveShadow = true;
      g.add(felt);
      // brass trim
      const trimShape = ell(rx + 0.07, rz + 0.07); trimShape.holes.push(ell(rx - 0.01, rz - 0.01));
      const trim = new THREE.Mesh(new THREE.ExtrudeGeometry(trimShape, { depth: 0.035, bevelEnabled: false, curveSegments: 96 }), new THREE.MeshStandardMaterial({ color: '#c79a4a', metalness: 1, roughness: 0.26, envMapIntensity: 1.2 }));
      trim.rotation.x = -Math.PI / 2; trim.position.y = -0.01; trim.receiveShadow = true;
      g.add(trim);
      // padded leather rail
      const railShape = ell(rx + 0.62, rz + 0.62); railShape.holes.push(ell(rx + 0.16, rz + 0.16));
      const rail = new THREE.Mesh(new THREE.ExtrudeGeometry(railShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.11, bevelSegments: 6, curveSegments: 96 }), new THREE.MeshPhysicalMaterial({ color: '#2a1610', roughness: 0.5, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.32, bumpMap: this.noiseTex(), bumpScale: 0.6, envMapIntensity: 0.9 }));
      rail.rotation.x = -Math.PI / 2; rail.position.y = 0.0; rail.castShadow = true; rail.receiveShadow = true;
      g.add(rail);
      // wooden apron
      const apronShape = ell(rx + 0.78, rz + 0.78); apronShape.holes.push(ell(rx + 0.2, rz + 0.2));
      const apron = new THREE.Mesh(new THREE.ExtrudeGeometry(apronShape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 64 }), new THREE.MeshPhysicalMaterial({ color: '#3b2114', roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 1 }));
      apron.rotation.x = -Math.PI / 2; apron.position.y = -0.42;
      g.add(apron);
      // floor
      const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ map: this.floorTex(), roughness: 1 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; floor.receiveShadow = true;
      g.add(floor);
      this.table = g;
      this.scene.add(g);
      this.feltMesh = felt;
    }

    feltMaterial(rx, rz) {
      const THREE = T3();
      const tex = new THREE.CanvasTexture(this.feltCanvas(rx, rz));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(1 / (2 * rx), 1 / (2 * rz)); tex.offset.set(0.5, 0.5);
      tex.anisotropy = 8;
      this.feltTex = tex;
      const F = FELTS[this.opts.felt] || FELTS.green;
      return new THREE.MeshPhysicalMaterial({ map: tex, roughness: 1, metalness: 0, sheen: 0.7, sheenRoughness: 0.75, sheenColor: new THREE.Color(F.felt).lerp(new THREE.Color('#ffffff'), 0.25), envMapIntensity: 0.25 });
    }

    feltCanvas(rx, rz) {
      const W = 2048, H = Math.round(W * rz / rx);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      const F = FELTS[this.opts.felt] || FELTS.green;
      const gr = x.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.62);
      gr.addColorStop(0, F.felt); gr.addColorStop(1, F.deep);
      x.fillStyle = gr; x.fillRect(0, 0, W, H);
      // fibres
      const img = x.getImageData(0, 0, W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      x.putImageData(img, 0, 0);
      // betting line
      x.strokeStyle = F.line; x.globalAlpha = 0.55; x.lineWidth = W * 0.0035;
      x.beginPath(); x.ellipse(W / 2, H / 2, W * 0.36, H * 0.36, 0, 0, Math.PI * 2); x.stroke();
      x.globalAlpha = 0.25; x.lineWidth = W * 0.0015;
      x.beginPath(); x.ellipse(W / 2, H / 2, W * 0.375, H * 0.375, 0, 0, Math.PI * 2); x.stroke();
      // wordmark
      x.globalAlpha = 0.13; x.fillStyle = F.line;
      x.font = `800 ${Math.round(W * 0.05)}px "Big Shoulders Display", Impact, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('BACK  ROOM', W / 2, H / 2 + (this.portrait ? H * 0.2 : H * 0.23));
      x.globalAlpha = 1;
      return c;
    }

    noiseTex() {
      const THREE = T3();
      if (this._noise) return this._noise;
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d'), img = x.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) { const v = 120 + Math.random() * 30; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      x.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8);
      return (this._noise = t);
    }

    floorTex() {
      const THREE = T3();
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(256, 256, 10, 256, 256, 256);
      g.addColorStop(0, '#2a1d17'); g.addColorStop(0.5, '#161010'); g.addColorStop(1, '#0d0b0a');
      x.fillStyle = g; x.fillRect(0, 0, 512, 512);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    setFelt(name) {
      this.opts.felt = name;
      const { rx, rz } = this.radii();
      this.feltMesh.material = this.feltMaterial(rx, rz);
      this.texCache.forEach((v, k) => { if (k.startsWith('back')) this.texCache.delete(k); });
      for (const c of this.cards.values()) if (!c.face) c.back.material.map = this.backTex();
      this.deckCards.forEach((m) => { m.children[1].material.map = this.backTex(); });
      this.needs = true;
    }

    // ---------- cards ----------
    cardGeometry() {
      const THREE = T3();
      if (this._cardGeo) return this._cardGeo;
      const r = 0.035, w = CW, h = CH;
      const s = new THREE.Shape();
      s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
      s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      const g = new THREE.ShapeGeometry(s, 6);
      const uv = g.attributes.uv, pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
      this._cardGeo = g;
      return g;
    }

    // Vector suit shapes (no font or emoji differences between devices)
    suitPath(x, suit, cx, cy, size, flip) {
      x.save(); x.translate(cx, cy); if (flip) x.rotate(Math.PI); x.scale(size / 100, size / 100);
      x.beginPath();
      if (suit === 'h') {
        x.moveTo(0, 38); x.bezierCurveTo(-60, -6, -48, -58, 0, -28); x.bezierCurveTo(48, -58, 60, -6, 0, 38);
      } else if (suit === 'd') {
        x.moveTo(0, -50); x.quadraticCurveTo(18, -18, 38, 0); x.quadraticCurveTo(18, 18, 0, 50); x.quadraticCurveTo(-18, 18, -38, 0); x.quadraticCurveTo(-18, -18, 0, -50);
      } else if (suit === 's') {
        x.moveTo(0, -48); x.bezierCurveTo(-58, -2, -52, 40, -8, 22); x.quadraticCurveTo(-10, 40, -22, 50); x.lineTo(22, 50); x.quadraticCurveTo(10, 40, 8, 22); x.bezierCurveTo(52, 40, 58, -2, 0, -48);
      } else {
        x.arc(0, -24, 20, 0, Math.PI * 2); x.moveTo(-6, 4); x.arc(-22, 6, 20, 0, Math.PI * 2); x.moveTo(42, 6); x.arc(22, 6, 20, 0, Math.PI * 2);
        x.moveTo(-6, 6); x.quadraticCurveTo(-8, 38, -20, 50); x.lineTo(20, 50); x.quadraticCurveTo(8, 38, 6, 6); x.closePath();
      }
      x.fill(); x.restore();
    }

    // Big-index faces: a huge rank and suit in the corner plus one large suit, so a card reads at a glance
    // even small, far away or at an angle (the style online poker rooms use).
    faceTex(card) {
      const THREE = T3();
      const key = 'face' + card + (this.opts.fourColor ? 4 : 2) + (this.opts.bigCards ? 'b' : '') + (this.fontsReady ? 'f' : '');
      if (this.texCache.has(key)) return this.texCache.get(key);
      const W = 512, H = 732;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      // ivory card stock with a fine gold inner line
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#fffdf8'); g.addColorStop(1, '#f1ece1');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(176,141,72,0.55)'; x.lineWidth = 4; x.strokeRect(20, 20, W - 40, H - 40);
      const r = card[0], suit = card[1];
      const rank = r === 'T' ? '10' : r;
      const col = (this.opts.fourColor ? SUIT_COLOR4 : SUIT_COLOR2)[suit];
      const big = this.opts.bigCards;
      const fs = big ? 350 : 310;
      // one large suit, partly off the corner (clean modern look, still recognisable from across the table)
      x.save(); x.beginPath(); x.rect(20, 20, W - 40, H - 40); x.clip();
      x.fillStyle = col; x.globalAlpha = 0.96; this.suitPath(x, suit, W * 0.69, H * 0.75, big ? 380 : 350, false);
      x.restore();
      // big rank, squeezed to fit when wide (10, Q, K...)
      x.fillStyle = col; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      x.font = `600 ${fs}px "Instrument Sans", "Helvetica Neue", Arial, "Roboto", system-ui, sans-serif`;
      const maxW = W * 0.6, mw = x.measureText(rank).width;
      const sx = Math.min(1, maxW / mw) * (rank === '10' ? 0.9 : 1);
      x.save(); x.translate(44, fs * 0.82 + 34); x.scale(sx, 1); x.fillText(rank, 0, 0); x.restore();
      // small suit under the rank
      this.suitPath(x, suit, 44 + 66, fs * 0.82 + 128, big ? 132 : 118, false);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      this.texCache.set(key, t);
      return t;
    }
    // Showdown: the five cards that won get a gold edge; the other face-up cards dim.
    applyHighlight(vm) {
      const THREE = T3();
      const win = vm.win && vm.win.length ? new Set(vm.win) : null;
      for (const c of this.cards.values()) {
        const state = !win || !c.face || !c.up ? 0 : win.has(c.face) ? 1 : -1;
        if (c.hl === state) continue;
        c.hl = state;
        c.front.material.color.setScalar(state === -1 ? 0.5 : 1);
        if (state === 1 && !c.glow) {
          const g = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.07, CH + 0.07), new THREE.MeshBasicMaterial({ color: '#f3cd6a', transparent: true, opacity: 0.95, toneMapped: false }));
          g.position.z = -0.001;
          c.grp.add(g); c.glow = g;
        }
        if (c.glow) c.glow.visible = state === 1;
      }
      this.needs = true;
    }
    // redraw faces once the card font has loaded (the first textures may have used a fallback font)
    refreshFaces() {
      this.texCache.forEach((t, key) => { if (key.startsWith('face')) { t.dispose(); this.texCache.delete(key); } });
      for (const c of this.cards.values()) { const f = c.face; c.face = null; if (f) this.setFace(c, f); }
      this.needs = true;
    }

    backTex() {
      const THREE = T3();
      const key = 'back' + this.opts.felt + this.opts.back;
      if (this.texCache.has(key)) return this.texCache.get(key);
      const W = 512, H = 732;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      const F = FELTS[this.opts.felt] || FELTS.green;
      const base = this.opts.back === 'crimson' ? '#7d1f2b' : this.opts.back === 'navy' ? '#1b2c55' : this.opts.back === 'black' ? '#15151a' : F.deep;
      x.fillStyle = '#fbf8f1'; x.fillRect(0, 0, W, H);
      x.fillStyle = base; x.fillRect(26, 26, W - 52, H - 52);
      x.strokeStyle = 'rgba(232,206,140,0.45)'; x.lineWidth = 2.5;
      for (let i = -H; i < W + H; i += 30) { x.beginPath(); x.moveTo(i, 26); x.lineTo(i + H, H - 26); x.stroke(); x.beginPath(); x.moveTo(i + H, 26); x.lineTo(i, H - 26); x.stroke(); }
      x.strokeStyle = '#e8ce8c'; x.lineWidth = 6; x.strokeRect(40, 40, W - 80, H - 80);
      x.lineWidth = 2; x.strokeRect(52, 52, W - 104, H - 104);
      x.fillStyle = base; x.beginPath(); x.arc(W / 2, H / 2, 112, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#e8ce8c'; x.lineWidth = 6; x.beginPath(); x.arc(W / 2, H / 2, 112, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 2; x.beginPath(); x.arc(W / 2, H / 2, 98, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#e8ce8c'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '800 104px "Big Shoulders Display", Impact, sans-serif';
      x.fillText('BR', W / 2, H / 2 + 6);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      this.texCache.set(key, t);
      return t;
    }

    makeCard() {
      const THREE = T3();
      const grp = new THREE.Group();
      const geo = this.cardGeometry();
      const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: null, color: '#f7f3ea', roughness: 0.62, metalness: 0, envMapIntensity: 0.32 }));
      const back = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: this.backTex(), roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 0.6 }));
      back.rotation.y = Math.PI; back.position.z = -0.002;
      front.castShadow = back.castShadow = true;
      grp.add(front, back);
      // lie flat face-down by default: card plane is XY, front faces +Z
      return { grp, front, back, face: null };
    }

    setFace(c, card) {
      if (c.face === card) return;
      c.face = card;
      if (card) { c.front.material.map = this.faceTex(card); c.front.material.color.set('#ffffff'); c.front.material.needsUpdate = true; }
    }

    buildDeck() {
      const THREE = T3();
      this.deckGroup = new THREE.Group();
      this.deckCards = [];
      for (let i = 0; i < 26; i++) {
        const c = this.makeCard();
        c.grp.rotation.x = Math.PI / 2; // face down
        c.grp.position.set(0, 0.006 + i * 0.006, 0);
        this.deckGroup.add(c.grp);
        this.deckCards.push(c.grp);
      }
      this.scene.add(this.deckGroup);
      this.placeDeck();
    }
    deckPos() { const { rz, rx } = this.radii(), nb = this.vm && this.vm.boards ? this.vm.boards.length : 1; return this.portrait ? new (T3().Vector3)(-rx * 0.55, 0, -rz * 0.72) : new (T3().Vector3)(nb > 1 ? -0.7 : 0, 0, -rz * 0.86); }
    placeDeck() { const p = this.deckPos(); this.deckGroup.position.copy(p); this.deckGroup.rotation.y = 0; }

    buildButton() {
      const THREE = T3();
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#f5f1e6'; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#1b1b1b'; x.lineWidth = 4; x.beginPath(); x.arc(64, 64, 50, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#1b1b1b'; x.font = '800 64px "Big Shoulders Display", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('D', 64, 68);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 40), [new THREE.MeshStandardMaterial({ color: '#e9e3d4', roughness: 0.4 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#d8d2c2' })]);
      m.castShadow = true; m.position.y = 0.025; m.visible = false;
      this.button = m; this.scene.add(m);
    }

    buildHighlights() {
      const THREE = T3();
      this.turnRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 64), new THREE.MeshBasicMaterial({ color: '#f2c76b', transparent: true, opacity: 0, depthWrite: false }));
      this.turnRing.rotation.x = -Math.PI / 2; this.turnRing.position.y = 0.004; this.turnRing.scale.set(1.25, 1, 1);
      this.scene.add(this.turnRing);
      this.winRings = [];
    }

    // ---------- chips ----------
    chipTextures(d) {
      const THREE = T3();
      const side = document.createElement('canvas'); side.width = 512; side.height = 32;
      let x = side.getContext('2d');
      x.fillStyle = d.c; x.fillRect(0, 0, 512, 32);
      x.fillStyle = d.s; for (let i = 0; i < 8; i++) x.fillRect(i * 64 + 20, 0, 24, 32);
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, 0, 512, 3); x.fillRect(0, 29, 512, 3);
      const top = document.createElement('canvas'); top.width = top.height = 256;
      x = top.getContext('2d');
      x.fillStyle = d.c; x.beginPath(); x.arc(128, 128, 128, 0, Math.PI * 2); x.fill();
      x.fillStyle = d.s;
      for (let i = 0; i < 8; i++) { x.save(); x.translate(128, 128); x.rotate(i * Math.PI / 4); x.fillRect(-12, -128, 24, 30); x.restore(); }
      x.strokeStyle = d.s; x.lineWidth = 4; x.setLineDash([10, 8]); x.beginPath(); x.arc(128, 128, 88, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
      const ig = x.createRadialGradient(128, 110, 10, 128, 128, 74);
      ig.addColorStop(0, 'rgba(255,255,255,0.22)'); ig.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = ig; x.beginPath(); x.arc(128, 128, 74, 0, Math.PI * 2); x.fill();
      x.fillStyle = d.s; x.textAlign = 'center'; x.textBaseline = 'middle';
      const label = d.v >= 1000 ? d.v / 1000 + 'K' : String(d.v);
      x.font = `800 ${label.length > 3 ? 52 : 68}px "Big Shoulders Display", Impact, sans-serif`;
      x.fillText(label, 128, 132);
      const ts = new THREE.CanvasTexture(side), tt = new THREE.CanvasTexture(top);
      ts.colorSpace = tt.colorSpace = THREE.SRGBColorSpace; tt.anisotropy = 8;
      const m = (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.8 });
      return [m(ts), m(tt), m(tt)];
    }

    buildChips() {
      const THREE = T3();
      this.chipGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.026, 40, 1);
      this.chipMats = DENOMS.map((d) => this.chipTextures(d));
      this.chipMeshes = DENOMS.map((d, i) => {
        const m = new THREE.InstancedMesh(this.chipGeo, this.chipMats[i], 700);
        m.count = 0; m.castShadow = true; m.receiveShadow = true;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(m);
        return m;
      });
      this.flyPool = [];
    }

    // break an amount into chip columns
    breakdown(amount) {
      const cols = [];
      let rem = Math.max(0, Math.floor(amount)), total = 0;
      for (let di = 0; di < DENOMS.length && rem > 0; di++) {
        const v = DENOMS[di].v;
        let n = Math.floor(rem / v);
        if (!n) continue;
        n = Math.min(n, 60 - total);
        if (n <= 0) break;
        rem -= n * v; total += n;
        while (n > 0) { const k = Math.min(n, 14); cols.push({ di, n: k }); n -= k; }
      }
      return cols.slice(0, 9);
    }

    pileSlots(center, angle, cols) {
      const THREE = T3();
      const offs = [[0, 0], [0.245, 0], [-0.245, 0], [0.122, 0.21], [-0.122, 0.21], [0.367, 0.21], [-0.367, 0.21], [0.122, -0.21], [-0.122, -0.21]];
      const out = [];
      const cs = Math.cos(angle), sn = Math.sin(angle);
      cols.forEach((col, i) => {
        const [ox, oz] = offs[i];
        const x = center.x + ox * cs - oz * sn, z = center.z + ox * sn + oz * cs;
        for (let k = 0; k < col.n; k++) out.push({ di: col.di, p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.008, 0.013 + k * 0.026, z + (Math.random() - 0.5) * 0.008) });
      });
      return out;
    }

    rebuildChips() {
      const THREE = T3();
      const counts = DENOMS.map(() => 0);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
      for (const pile of this.piles.values()) {
        if (!pile.slots) pile.slots = this.pileSlots(pile.pos, pile.angle, this.breakdown(pile.shown));
        for (const sl of pile.slots) {
          const mesh = this.chipMeshes[sl.di];
          if (counts[sl.di] >= 700) continue;
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (sl.p.x * 13 + sl.p.z * 7) % 6.28);
          m4.compose(sl.p, q, s);
          mesh.setMatrixAt(counts[sl.di]++, m4);
        }
      }
      this.chipMeshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; });
      this.needs = true;
    }

    pile(key, pos, angle) {
      let p = this.piles.get(key);
      if (!p) { p = { key, pos: pos.clone(), angle, shown: 0, slots: null }; this.piles.set(key, p); }
      else if (!p.pos.equals(pos)) { p.pos.copy(pos); p.angle = angle; p.slots = null; }
      return p;
    }
    setPile(p, amount) { amount = Math.max(0, Math.round(amount)); if (p.shown !== amount) { p.shown = amount; p.slots = null; this.chipsDirty = true; } }

    flyChips(from, to, amount, delay, done) {
      const THREE = T3();
      const cols = this.breakdown(amount);
      const n = Math.max(1, Math.min(6, cols.reduce((a, c) => a + c.n, 0)));
      const dis = [];
      for (const c of cols) for (let k = 0; k < c.n && dis.length < n; k++) dis.push(c.di);
      if (this.opts.reduced) { setTimeout(done, 0); return; }
      let left = dis.length;
      dis.forEach((di, i) => {
        const m = this.flyPool.pop() || new THREE.Mesh(this.chipGeo, this.chipMats[di]);
        m.material = this.chipMats[di]; m.castShadow = true; m.visible = false;
        this.scene.add(m);
        const a = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.03 + i * 0.026, (Math.random() - 0.5) * 0.12));
        const b = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.03 + i * 0.026, (Math.random() - 0.5) * 0.1));
        this.anim(340, delay + i * 35, (t) => {
          m.visible = true;
          const e = ease.out(t);
          m.position.lerpVectors(a, b, e);
          m.position.y += Math.sin(Math.PI * e) * 0.35;
          m.rotation.x = e * Math.PI * 2;
        }, () => { this.scene.remove(m); this.flyPool.push(m); if (--left === 0 && done) done(); });
      });
      PK.sfx && PK.sfx.chips(delay);
    }

    // ---------- layout ----------
    seatAngle(i) {
      const ref = this.me >= 0 ? this.me : 0;
      return Math.PI / 2 + (2 * Math.PI * (i - ref)) / this.n;
    }
    onEllipse(i, k) {
      const { rx, rz } = this.radii();
      const a = this.seatAngle(i);
      return new (T3().Vector3)(Math.cos(a) * rx * k, 0, Math.sin(a) * rz * k);
    }
    facing(i) { const p = this.onEllipse(i, 1); return Math.atan2(-p.x, -p.z); }
    seatAnchor(i) { return this.onEllipse(i, 1.13); }
    cardSpot(i) { return this.onEllipse(i, 0.74); }
    stackSpot(i) {
      const THREE = T3();
      const p = this.onEllipse(i, 0.8), a = this.seatAngle(i);
      const t = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      return p.add(t.multiplyScalar(i === this.me ? 1.05 : 0.62));
    }
    betSpot(i) { return this.onEllipse(i, 0.52); }
    btnSpot(i) {
      const THREE = T3();
      const p = this.onEllipse(i, 0.62), a = this.seatAngle(i);
      const t = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      return p.add(t.multiplyScalar(-0.42));
    }
    // phones: board sits a little higher (between the side seats) and the pot goes under it, in the open middle
    boardZ() { return this.portrait ? -0.5 : 0; }
    potSpot() {
      const { rz } = this.radii(), nb = this.vm && this.vm.boards ? this.vm.boards.length : 1;
      return this.portrait ? new (T3().Vector3)(0, 0, 0.62) : new (T3().Vector3)(nb > 1 ? 0.3 : 0, 0, -rz * (nb > 1 ? 0.72 : 0.58));
    }
    boardSpot(bi, k, nb) {
      const THREE = T3();
      const sp = this.portrait ? 0.74 : 0.8, scale = nb > 1 ? 0.84 : 1; // big, easy-to-read board
      const z = (nb > 1 ? (bi === 0 ? -0.5 : 0.42) : 0.02) + this.boardZ();
      return new THREE.Vector3((k - 2) * sp * scale, 0.004 + k * 0.0005, z);
    }

    setLayout(n, me) {
      if (n === this.n && me === this.me) return;
      this.n = n; this.me = me;
      for (const c of this.cards.values()) c.placed = false;
      this.piles.forEach((p) => { p.slots = null; });
      this.relayout = true; this.needs = true;
    }

    resize() {
      const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      const portrait = w / h < 0.85;
      if (portrait !== this.portrait) {
        this.portrait = portrait;
        this.buildTable(); this.placeDeck();
        for (const c of this.cards.values()) c.placed = false;
        this.piles.forEach((p) => { p.slots = null; });
        this.relayout = true;
      }
      this.fitCamera();
      this.needs = true;
    }

    setView(v) { this.opts.view = v; this.orbit = { yaw: 0, pitch: 0, zoom: 1 }; this.fitCamera(); this.needs = true; }

    fitCamera() {
      const THREE = T3();
      const { rx, rz } = this.radii();
      const cam = this.camera;
      const vfov = cam.fov * Math.PI / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
      const view = this.opts.view;
      const pitch = (view === 'top' ? 89 : view === 'low' ? 34 : 52) * Math.PI / 180 + this.orbit.pitch;
      const halfW = rx + (this.portrait ? 0.72 : 0.95), halfD = rz + 1.0;
      // distance to fit width and projected depth
      const dW = halfW / Math.tan(hfov / 2);
      const projD = halfD * Math.sin(pitch) + 0.6 * Math.cos(pitch);
      const dH = projD / Math.tan(vfov / 2);
      let dist = Math.max(dW, dH) * (view === 'low' ? 0.92 : 1.02) * this.orbit.zoom;
      const yaw = this.orbit.yaw;
      const tgt = new THREE.Vector3(0, 0, view === 'top' ? 0 : 0.15);
      cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist);
      cam.lookAt(tgt);
      cam.updateProjectionMatrix();
      this.camBase = { dist, pitch, yaw, tgt };
      this.relayout = true;
    }

    bindInput() {
      const el = this.canvas;
      el.addEventListener('pointerdown', (e) => { if (this.opts.view === 'top') return; this.drag = { x: e.clientX, y: e.clientY, yaw: this.orbit.yaw, pitch: this.orbit.pitch }; el.setPointerCapture(e.pointerId); });
      el.addEventListener('pointermove', (e) => {
        if (!this.drag) return;
        this.orbit.yaw = Math.max(-0.6, Math.min(0.6, this.drag.yaw - (e.clientX - this.drag.x) * 0.004));
        this.orbit.pitch = Math.max(-0.35, Math.min(0.45, this.drag.pitch + (e.clientY - this.drag.y) * 0.003));
        this.fitCamera(); this.needs = true;
      });
      const end = () => { this.drag = null; };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
      el.addEventListener('wheel', (e) => { e.preventDefault(); this.orbit.zoom = Math.max(0.7, Math.min(1.35, this.orbit.zoom * (e.deltaY > 0 ? 1.06 : 0.94))); this.fitCamera(); this.needs = true; }, { passive: false });
      el.addEventListener('dblclick', () => { this.orbit = { yaw: 0, pitch: 0, zoom: 1 }; this.fitCamera(); this.needs = true; });
    }

    // ---------- animation core ----------
    anim(dur, delay, update, done) {
      if (this.opts.reduced) { dur = Math.min(dur, 120); delay = Math.min(delay, 60); }
      this.anims.push({ start: performance.now() + delay, dur, update, done, begun: false });
      this.needs = true;
    }

    loop(now) {
      requestAnimationFrame(this.loop);
      let active = false;
      if (this.anims.length) {
        const keep = [];
        for (const a of this.anims) {
          if (now < a.start) { keep.push(a); active = true; continue; }
          const t = Math.min(1, (now - a.start) / a.dur);
          a.update(t);
          if (t >= 1) { if (a.done) a.done(); } else keep.push(a);
          active = true;
        }
        this.anims = keep;
      }
      // pulsing turn ring
      if (this.turnRing.visible && this.turnOn && this.turnRing.material.opacity < 0.5) {
        this.turnRing.material.opacity = Math.min(0.5, this.turnRing.material.opacity + 0.05);
        active = true;
      }
      if (!this.opts.reduced && this.opts.view === 'low' && !this.drag) {
        this.camT += 0.0016;
        this.orbit.yaw = Math.sin(this.camT) * 0.35;
        this.fitCamera(); active = true;
      }
      for (const w of this.winRings) { if (w.material.opacity > 0.04) { w.material.opacity *= 0.97; w.scale.multiplyScalar(1.003); active = true; } else w.visible = false; }
      if (this.chipsDirty) { this.chipsDirty = false; this.rebuildChips(); }
      if (this.relayout) { this.relayout = false; this.layoutNow(); }
      if (active || this.needs) {
        this.needs = false;
        const t0 = performance.now();
        this.renderer.render(this.scene, this.camera);
        const dt = performance.now() - t0;
        // adaptive quality: a device that can't keep up drops shadows and resolution
        this.slowEma = (this.slowEma || dt) * 0.9 + dt * 0.1;
        this.frames = (this.frames || 0) + 1;
        if (this.frames > 30 && this.slowEma > 45 && this.opts.quality !== 'low' && !this.downgraded) {
          this.downgraded = true;
          this.setOption('quality', 'low');
          if (this.onDowngrade) this.onDowngrade();
        }
        this.emitLayout();
      }
    }

    project(v) {
      const p = v.clone().project(this.camera);
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
    }
    emitLayout() {
      const key = this.camera.position.toArray().map((x) => x.toFixed(3)).join() + this.n + ':' + this.me + this.canvas.clientWidth + 'x' + this.canvas.clientHeight + ':' + (this.vm && this.vm.boards ? this.vm.boards.length : 1);
      if (key === this.layoutKey) return;
      this.layoutKey = key;
      const nb = this.vm && this.vm.boards ? this.vm.boards.length : 1;
      const L = { seats: [], bets: [], pot: this.project(this.potSpot().add(new (T3().Vector3)(0, 0.1, this.portrait ? 0.3 : 0.24))), board: this.project(new (T3().Vector3)(0, 0, (nb > 1 ? 0.88 : 0.52) + this.boardZ())), boardTop: this.project(new (T3().Vector3)(0, 0, -0.62 + this.boardZ())), cards: [] };
      for (let i = 0; i < this.n; i++) {
        L.seats.push(this.project(this.seatAnchor(i)));
        L.bets.push(this.project(this.betSpot(i).add(new (T3().Vector3)(0, 0.05, 0))));
        L.cards.push(this.project(this.cardSpot(i)));
      }
      L.me = this.me >= 0 ? this.project(this.myCardSpot(0, 2)) : null;
      for (const cb of this.layoutCbs) cb(L);
    }
    onLayout(cb) { this.layoutCbs.push(cb); }
    // screen rectangles of the community cards (used by layout checks)
    boardRects() {
      const THREE = T3(), out = [], box = new THREE.Box3();
      for (const c of this.cards.values()) {
        if (c.kind !== 'board' || !c.grp.visible) continue;
        box.setFromObject(c.grp);
        let l = 1e9, r = -1e9, t = 1e9, b = -1e9;
        for (let i = 0; i < 8; i++) {
          const p = this.project(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
          l = Math.min(l, p.x); r = Math.max(r, p.x); t = Math.min(t, p.y); b = Math.max(b, p.y);
        }
        out.push({ left: l, right: r, top: t, bottom: b });
      }
      return out;
    }

    // ---------- card placement ----------
    myCardSpot(i, n) {
      const THREE = T3();
      const base = this.onEllipse(this.me, 0.79);
      const a = this.seatAngle(this.me);
      const t = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const spread = n > 3 ? 0.38 : 0.58;
      return base.add(t.multiplyScalar((i - (n - 1) / 2) * spread)).add(new THREE.Vector3(0, 0.12 + i * 0.004, 0));
    }

    cardTarget(c) {
      const THREE = T3();
      const pos = new THREE.Vector3(), rot = new THREE.Euler(), sc = 1;
      if (c.kind === 'board') {
        pos.copy(this.boardSpot(c.bi, c.k, c.nb));
        const bsc = this.portrait ? (c.nb > 1 ? 1.3 : 1.6) : (c.nb > 1 ? 1.32 : 1.72);
        // face-up community cards lean back toward you (like a card holder) so they are not squashed by the camera angle
        if (c.up) { rot.set(-Math.PI / 2 + TILT, 0, 0); pos.y += (CH * bsc / 2) * Math.sin(TILT) + 0.01; }
        else rot.set(Math.PI / 2, 0, 0);
        return { pos, rot, sc: bsc };
      }
      if (c.kind === 'hole') {
        if (c.seat === this.me && c.mine) {
          pos.copy(this.myCardSpot(c.k, c.n));
          const yawA = this.facing(c.seat);
          rot.set(-Math.PI / 2 + 0.62, 0, 0, 'YXZ'); rot.y = yawA + Math.PI;
          rot.order = 'YXZ';
          rot.z = (c.k - (c.n - 1) / 2) * -0.07;
          if (c.folded) { pos.y = 0.012 + c.k * 0.003; rot.x = -Math.PI / 2; rot.z = 0; }
          return { pos, rot, sc: c.n > 3 ? 1.15 : 1.42 };
        }
        const base = this.cardSpot(c.seat);
        const a = this.seatAngle(c.seat);
        const t = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        if (c.up) {
          // shown cards: side by side, upright as you look at the table, leaning back so you can read them
          const ssc = c.n > 3 ? 0.9 : 1.05, gap = CW * ssc + 0.03;
          pos.copy(this.onEllipse(c.seat, 0.82)); pos.x += (c.k - (c.n - 1) / 2) * gap;
          if (!this.portrait && pos.z < -1.2) pos.z += 0.32; // top seats: keep shown cards clear of the name plate
          pos.y = (CH * ssc / 2) * Math.sin(TILT) + 0.02 + c.k * 0.002;
          rot.order = 'YXZ'; rot.y = 0; rot.x = -Math.PI / 2 + TILT; rot.z = 0;
          return { pos, rot, sc: ssc };
        }
        pos.copy(base.add(t.multiplyScalar((c.k - (c.n - 1) / 2) * 0.14)));
        pos.y = 0.006 + c.k * 0.003;
        rot.order = 'YXZ';
        rot.y = this.facing(c.seat) + Math.PI;
        rot.x = Math.PI / 2;
        rot.z = (c.k - (c.n - 1) / 2) * 0.12;
        return { pos, rot, sc: 0.78 };
      }
      return { pos, rot, sc };
    }

    moveCard(c, delay, dur, arc, then) {
      const THREE = T3();
      const tg = this.cardTarget(c);
      const g = c.grp;
      const p0 = g.position.clone(), q0 = g.quaternion.clone(), s0 = g.scale.x;
      const q1 = new THREE.Quaternion().setFromEuler(tg.rot);
      if (dur <= 0 || this.opts.reduced) {
        if (delay > 0 && !this.opts.reduced) {
          this.anim(1, delay, () => { g.position.copy(tg.pos); g.quaternion.copy(q1); g.scale.setScalar(tg.sc); }, then);
        } else { g.position.copy(tg.pos); g.quaternion.copy(q1); g.scale.setScalar(tg.sc); if (then) then(); }
        this.needs = true;
        return;
      }
      this.anim(dur, delay, (t) => {
        const e = ease.out(t);
        g.position.lerpVectors(p0, tg.pos, e);
        g.position.y += Math.sin(Math.PI * e) * (arc || 0);
        g.quaternion.slerpQuaternions(q0, q1, e);
        g.scale.setScalar(s0 + (tg.sc - s0) * e);
      }, then);
    }

    removeCard(key, c, delay) {
      this.cards.delete(key);
      const THREE = T3();
      const g = c.grp;
      const p0 = g.position.clone(), tgt = this.deckPos().add(new THREE.Vector3(0, 0.05, 0.25));
      this.anim(this.opts.reduced ? 1 : 380, delay || 0, (t) => {
        const e = ease.inOut(t);
        g.position.lerpVectors(p0, tgt, e);
        g.position.y += Math.sin(Math.PI * e) * 0.3;
        g.scale.setScalar(Math.max(0.01, 1 - e * 0.2));
      }, () => { this.scene.remove(g); });
    }

    // ---------- shuffle ----------
    shuffleAnim() {
      if (this.opts.reduced) return;
      const THREE = T3();
      const cards = this.deckCards;
      const n = cards.length;
      const half = Math.floor(n / 2);
      PK.sfx && PK.sfx.shuffle();
      cards.forEach((g, i) => {
        const left = i < half;
        const idx = left ? i : i - half;
        const p0 = new THREE.Vector3(0, 0.006 + i * 0.006, 0);
        const pSplit = new THREE.Vector3(left ? -0.32 : 0.32, 0.006 + idx * 0.006, 0);
        const final = new THREE.Vector3(0, 0.006 + (idx * 2 + (left ? 0 : 1)) * 0.006, 0);
        const r0 = g.rotation.z;
        // split
        this.anim(260, 0, (t) => { const e = ease.out(t); g.position.lerpVectors(p0, pSplit, e); g.rotation.z = r0 + (left ? 0.18 : -0.18) * e; });
        // riffle: interleave from the bottom up
        const order = idx * 2 + (left ? 0 : 1);
        this.anim(150, 300 + order * 22, (t) => {
          const e = ease.inOut(t);
          g.position.lerpVectors(pSplit, final, e);
          g.position.y += Math.sin(Math.PI * e) * 0.09;
          g.rotation.z = (left ? 0.18 : -0.18) * (1 - e);
        });
      });
      // square the deck
      this.anim(160, 300 + n * 22 + 140, (t) => { this.deckGroup.position.y = Math.sin(Math.PI * t) * 0.05; });
    }

    // ---------- main update ----------
    update(vm) {
      const THREE = T3();
      this.vm = vm;
      this.setLayout(vm.n, vm.me);
      const newHand = vm.hn !== this.lastHn;
      const shuffling = vm.hp === 'shuffle';
      // sweep cards at a new hand
      if ((newHand || shuffling || vm.hp === 'void') && this.cards.size) {
        let d = 0;
        for (const [k, c] of [...this.cards]) { if (shuffling || vm.hp === 'void' || !k.startsWith('h' + vm.hn + ':')) { this.removeCard(k, c, d); d += 12; } }
      }
      if (shuffling && this.lastHp !== 'shuffle') this.shuffleAnim();
      // dealer button
      if (vm.btn >= 0 && vm.seats[vm.btn]) {
        const target = this.btnSpot(vm.btn);
        this.button.visible = true;
        if (this.button.userData.seat == null || this.opts.reduced) this.button.position.set(target.x, 0.026, target.z);
        else if (this.button.userData.seat !== vm.btn) {
          const p0 = this.button.position.clone();
          this.anim(520, 0, (t) => { const e = ease.inOut(t); this.button.position.lerpVectors(p0, new THREE.Vector3(target.x, 0.026, target.z), e); this.button.position.y = 0.026 + Math.sin(Math.PI * e) * 0.12; });
        }
        this.button.userData.seat = vm.btn;
      } else this.button.visible = false;

      const freshDeal = newHand && (this.lastHp === 'shuffle' || this.lastHn === vm.hn - 1) && vm.hp !== 'done';
      const order = vm.od || [];
      // hole cards
      let dealing = 0;
      for (let s = 0; s < vm.n; s++) {
        const S = vm.seats[s];
        const n = S && S.inHand ? S.nHole : 0;
        for (let k = 0; k < Math.max(n, 5); k++) {
          const key = 'h' + vm.hn + ':' + s + ':' + k;
          let c = this.cards.get(key);
          if (k >= n) { if (c) this.removeCard(key, c, 0); continue; }
          const mine = s === vm.me && vm.mine;
          const value = S.cards ? S.cards[k] : null;
          const up = !!(S.shown && value) || (mine && !!value);
          if (!c) {
            if (S.folded && !mine) continue; // dealt and folded between two updates: nothing to show
            const m = this.makeCard();
            c = Object.assign(m, { kind: 'hole', seat: s, k, n, up: false, mine, folded: false });
            this.cards.set(key, c);
            this.scene.add(c.grp);
            const dp = this.deckPos().add(new THREE.Vector3(0, 0.16, 0));
            c.grp.position.copy(dp); c.grp.rotation.set(Math.PI / 2, 0, 0);
            if (value) this.setFace(c, value);
            c.up = up; c.n = n; c.folded = S.folded;
            if (freshDeal && !this.opts.reduced) {
              const oi = Math.max(0, order.indexOf(s));
              const delay = (k * Math.max(order.length, 1) + oi) * 120 + 200;
              this.moveCard(c, delay, 420, 0.25);
              PK.sfx && PK.sfx.deal(delay);
              dealing = Math.max(dealing, delay);
            } else this.moveCard(c, 0, 0);
            continue;
          }
          let changed = false;
          if (value && c.face !== value) { this.setFace(c, value); changed = true; }
          if (c.up !== up || c.n !== n || c.mine !== mine || !c.placed) { c.up = up; c.n = n; c.mine = mine; changed = true; }
          if (S.folded && !c.folded) {
            c.folded = true;
            if (!mine) { this.removeCard(key, c, k * 40); continue; }
            changed = true;
          }
          if (changed) { c.placed = true; this.moveCard(c, 0, up && !c.wasUp ? 420 : 260, up && !c.wasUp ? 0.3 : 0.05); }
          c.wasUp = up;
        }
      }
      // board
      const boards = vm.boards || [];
      const nb = boards.length;
      // new street: let the bets slide into the pot first, then deal the cards (like a dealer would)
      let bd = freshDeal ? dealing + 600 : (this.opts.reduced ? 0 : 900);
      for (let bi = 0; bi < 4; bi++) for (let k = 0; k < 5; k++) {
        const key = 'b' + vm.hn + ':' + bi + ':' + k;
        let c = this.cards.get(key);
        const v = boards[bi] && boards[bi][k];
        if (!v) { if (c) this.removeCard(key, c, 0); continue; }
        if (!c) {
          const m = this.makeCard();
          c = Object.assign(m, { kind: 'board', bi, k, nb, up: false });
          this.cards.set(key, c);
          this.scene.add(c.grp);
          this.setFace(c, v);
          const dp = this.deckPos().add(new THREE.Vector3(0, 0.16, 0));
          c.grp.position.copy(dp); c.grp.rotation.set(Math.PI / 2, 0, 0);
          if (this.opts.reduced || (!newHand && false)) { c.up = true; this.moveCard(c, 0, 0); continue; }
          const d0 = bd; bd += k < 3 && boards[bi].length >= 3 && !this.boardSeen(bi, vm.hn) ? 160 : 220;
          // land face down, then flip
          c.up = false;
          this.moveCard(c, d0, 400, 0.2, () => { c.up = true; this.moveCard(c, 80, 360, 0.18); });
          PK.sfx && PK.sfx.deal(d0);
        } else if (c.nb !== nb || !c.placed) { c.nb = nb; c.placed = true; c.up = true; this.moveCard(c, 0, 250, 0.05); }
      }
      this.boardSeenMark(vm.hn, boards);
      this.applyHighlight(vm);

      // chips
      this.updateChips(vm);
      // highlights
      if (vm.toAct >= 0 && vm.seats[vm.toAct]) {
        const p = this.onEllipse(vm.toAct, 0.86);
        this.turnRing.position.set(p.x, 0.004, p.z);
        this.turnRing.rotation.z = 0;
        if (!this.turnOn || this.turnSeat !== vm.toAct) this.turnRing.material.opacity = 0;
        this.turnRing.visible = true; this.turnOn = true; this.turnSeat = vm.toAct;
      } else { this.turnRing.visible = false; this.turnOn = false; }
      if (vm.hp === 'done' && this.lastHp !== 'done') {
        for (const w of vm.winners || []) this.winBurst(w);
      }
      if (vm.hp !== 'done') this.clearWinRings();
      this.lastHn = vm.hn; this.lastHp = vm.hp;
      this.needs = true;
    }

    boardSeen(bi, hn) { return this._bs && this._bs[hn + ':' + bi] >= 3; }
    boardSeenMark(hn, boards) { this._bs = this._bs || {}; boards.forEach((b, i) => { this._bs[hn + ':' + i] = b.length; }); }

    winBurst(seat) {
      const THREE = T3();
      const p = this.onEllipse(seat, 0.86);
      const r = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 64), new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0.85, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.set(p.x, 0.006, p.z); r.scale.set(1.3, 1.3, 1);
      this.scene.add(r); this.winRings.push(r);
    }
    clearWinRings() { for (const w of this.winRings) this.scene.remove(w); this.winRings = []; }

    updateChips(vm) {
      const pot = this.pile('pot', this.potSpot(), 0);
      const prev = this.prevChips;
      this.prevChips = { stacks: vm.seats.map((S) => (S ? S.stack : null)), bets: vm.seats.map((S) => (S ? S.bet : 0)), pot: vm.pot, hn: vm.hn };
      const snap = () => {
        for (let s = 0; s < vm.n; s++) {
          const S = vm.seats[s];
          this.setPile(this.pile('stack' + s, this.stackSpot(s), this.facing(s)), S ? S.stack : 0);
          this.setPile(this.pile('bet' + s, this.betSpot(s), this.facing(s)), S ? S.bet : 0);
        }
        this.setPile(pot, vm.pot);
      };
      if (!prev || this.opts.reduced || document.hidden) return snap();
      const A = [], B = [], C = [];
      let collected = 0, won = 0;
      for (let s = 0; s < vm.n; s++) {
        const S = vm.seats[s];
        const sp = this.pile('stack' + s, this.stackSpot(s), this.facing(s));
        const bp = this.pile('bet' + s, this.betSpot(s), this.facing(s));
        if (!S || prev.stacks[s] == null) { this.setPile(sp, S ? S.stack : 0); this.setPile(bp, S ? S.bet : 0); continue; }
        const pStack = prev.stacks[s], pBet = prev.bets[s] || 0;
        const put = pStack - S.stack;
        const refund = S.stack > pStack && S.bet < pBet && vm.pot >= prev.pot && vm.hp !== 'done';
        if (refund) {
          const amt = Math.min(pBet - S.bet, S.stack - pStack);
          A.push({ from: bp.pos, to: sp.pos, amt, start: () => this.setPile(bp, S.bet), done: () => this.setPile(sp, S.stack) });
          continue;
        }
        const inBet = pBet + Math.max(put, 0);
        if (put > 0) A.push({ from: sp.pos, to: bp.pos, amt: put, start: () => this.setPile(sp, S.stack), done: () => this.setPile(bp, inBet) });
        if (inBet > S.bet) { collected += inBet - S.bet; B.push({ from: bp.pos, to: pot.pos, amt: inBet - S.bet, start: () => this.setPile(bp, S.bet) }); }
        else if (put <= 0 && bp.shown !== S.bet) this.setPile(bp, S.bet);
        if (put < 0) {
          const gain = -put;
          if (prev.pot + collected > 0 && vm.pot < prev.pot + collected) { won += gain; C.push({ from: pot.pos, to: sp.pos, amt: gain, win: true, done: () => this.setPile(sp, S.stack) }); }
          else this.setPile(sp, S.stack);
        } else if (put === 0) this.setPile(sp, S.stack);
      }
      const tB = A.length ? 560 : 0;
      const tC = tB + (B.length ? 620 : 0) + (C.length ? 380 : 0);
      for (const f of A) this.flight(f, 0);
      for (const f of B) this.flight(f, tB);
      const potAfterCollect = prev.pot + collected;
      if (B.length) this.anim(1, tB + 480, () => this.setPile(pot, C.length ? Math.max(potAfterCollect, vm.pot) : vm.pot));
      if (C.length) { this.anim(1, tC, () => this.setPile(pot, vm.pot)); for (const f of C) this.flight(f, tC); }
      if (!B.length && !C.length) this.setPile(pot, vm.pot);
      this.chipsDirty = true;
    }

    flight(f, delay) {
      if (f.start) this.anim(1, delay, () => {}, f.start);
      this.flyChips(f.from, f.to, f.amt, delay, f.done || (() => {}));
    }

    layoutNow() {
      // re-place everything after a layout change (seat rotation, orientation)
      for (const c of this.cards.values()) { c.placed = true; this.moveCard(c, 0, 0); }
      const pot = this.piles.get('pot'); if (pot) { pot.pos.copy(this.potSpot()); pot.slots = null; }
      for (let s = 0; s < this.n; s++) {
        const sp = this.piles.get('stack' + s), bp = this.piles.get('bet' + s);
        if (sp) { sp.pos.copy(this.stackSpot(s)); sp.angle = this.facing(s); sp.slots = null; }
        if (bp) { bp.pos.copy(this.betSpot(s)); bp.angle = this.facing(s); bp.slots = null; }
      }
      for (const [k, p] of this.piles) { const m = /^(stack|bet)(\d+)$/.exec(k); if (m && +m[2] >= this.n) this.piles.delete(k); }
      if (this.button.userData.seat != null && this.button.userData.seat < this.n) { const t = this.btnSpot(this.button.userData.seat); this.button.position.set(t.x, 0.026, t.z); }
      this.placeDeck();
      this.chipsDirty = true;
      this.layoutKey = '';
    }

    setOption(k, v) {
      this.opts[k] = v;
      if (k === 'fourColor' || k === 'bigCards') this.refreshFaces();
      if (k === 'quality') { this.renderer.shadowMap.enabled = v !== 'low'; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, v === 'low' ? 1 : 2)); this.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => { x.needsUpdate = true; }); } }); }
      this.needs = true;
    }
  }

  PK.Scene3D = Scene3D;
})(typeof window !== 'undefined' ? (window.PK = window.PK || {}) : (globalThis.PK = globalThis.PK || {}));

/* Interface: seats, action dock, hotkeys, chat, toasts, announcements, hand history. */
(function (PK) {
  'use strict';
  const F = PK.F;
  const $ = (s, r) => (r || document).querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (k.startsWith('aria-') && typeof v === 'boolean') { el.setAttribute(k, String(v)); continue; }
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v; // only used with static strings (icons)
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return el;
  }
  const P = {
    chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
    history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
    book: 'M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z',
    scale: 'M12 3v18M6 21h12M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z',
    ledger: 'M4 20V10M10 20V4M16 20v-7M2 20h20',
    sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
    crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
    sound: 'M11 5L6 9H3v6h3l5 4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
    mute: 'M11 5L6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6',
    cube: 'M12 2l9 5v10l-9 5-9-5V7zM12 22V12M21 7l-9 5-9-5',
    full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    x: 'M6 6l12 12M18 6L6 18',
    key: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
    send: 'M4 12l16-8-6 16-2-7z',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
    alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
    bot: 'M5 9h14v10H5zM12 5v4M9 14h.01M15 14h.01',
    pause: 'M8 5v14M16 5v14', play: 'M7 4l13 8-13 8z',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    user: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    menu: 'M4 7h16M4 12h16M4 17h16',
    invite: 'M15 20v-2a4 4 0 0 0-8 0v2M11 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 7v6M16 10h6',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n]}"/></svg>`;
  PK.icon = icon; PK.h = h;

  // ---------------- per-viewer settings ----------------
  const DEF_SET = { felt: 'green', back: 'brass', fourColor: true, bigCards: false, view: 'player', quality: 'high', motion: 'auto', contrast: false, scale: 1, volume: 0.7, muted: false, showBB: false, betDefault: 'min', haptics: true, autoRebuy: false, confirmAllin: true, autoMuck: false };
  let SET = Object.assign({}, DEF_SET);
  try { SET = Object.assign(SET, JSON.parse(localStorage.getItem('br.settings') || '{}')); } catch (e) {}
  if (!SET.cv) { SET.fourColor = true; SET.cv = 2; } // new readable cards: four-colour suits on by default (can be turned off in Settings)
  const saveSet = () => { try { localStorage.setItem('br.settings', JSON.stringify(SET)); } catch (e) {} };
  const reducedMotion = () => SET.motion === 'on' || (SET.motion === 'auto' && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  PK.SET = SET;

  const HUES = [28, 62, 95, 140, 170, 200, 230, 260, 290, 320, 345, 10];
  const colorOf = (c) => `oklch(0.78 0.12 ${HUES[(c | 0) % HUES.length]})`;
  PK.colorOf = colorOf;
  const initials = (n) => (String(n || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2) || '?').toUpperCase();

  // ---------------- state ----------------
  const client = new PK.Client();
  PK.client = client;
  const ui = {
    T: null, M: null, L: null, scene: null, raiseOpen: false, raiseTo: 0, pre: null, preAmt: 0,
    drawer: false, tab: 'chat', unread: 0, sheet: null, lastTurn: '', lastMsg: null, lastEv: 0, evKey: '',
    hist: new Map(), auditWait: null, allinArm: 0, voteSeen: null, seatEls: [], betEls: [], log: [], toasted: new Set(),
  };
  PK.ui = ui;

  const fmtN = (n) => (n == null ? '' : Math.round(n).toLocaleString('en-US'));
  function fmt(n) {
    const T = ui.T;
    if (SET.showBB && T) { const bb = (T.bl && T.bl[1]) || (T.lvl && T.lvl[2]) || T.c.bb; return (Math.round((n / bb) * 10) / 10).toLocaleString('en-US') + ' BB'; }
    return fmtN(n);
  }
  PK.fmt = fmt;
  const say = (text, polite) => { const el = $(polite ? '#sr2' : '#sr'); el.textContent = ''; setTimeout(() => { el.textContent = text; }, 30); };
  PK.say = say;

  const cardName = (c) => (c ? PK.RNAME[PK.RANKS.indexOf(c[0]) + 2] + ' of ' + { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }[c[1]] : '');
  const splitCards = (s) => (s ? s.match(/.{2}/g) || [] : []);
  // Suits drawn as SVG (same shapes as the 3D cards), so they look identical on every phone and never turn into emoji.
  const SUIT_D = {
    h: 'M0 38C-60 -6 -48 -58 0 -28C48 -58 60 -6 0 38Z',
    d: 'M0 -50Q18 -18 38 0Q18 18 0 50Q-18 18 -38 0Q-18 -18 0 -50Z',
    s: 'M0 -48C-58 -2 -52 40 -8 22Q-10 40 -22 50L22 50Q10 40 8 22C52 40 58 -2 0 -48Z',
    c: 'M-20 -24a20 20 0 1 0 40 0a20 20 0 1 0 -40 0ZM-42 6a20 20 0 1 0 40 0a20 20 0 1 0 -40 0ZM2 6a20 20 0 1 0 40 0a20 20 0 1 0 -40 0ZM-6 6Q-8 38 -20 50L20 50Q8 38 6 6Z',
  };
  function suitSvg(s, cls) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', '-52 -52 104 104'); el.setAttribute('class', cls); el.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', SUIT_D[s]); p.setAttribute('fill', 'currentColor');
    el.append(p);
    return el;
  }
  PK.suitSvg = suitSvg;
  // Big-index card: huge rank top-left, suit under it, large suit bottom-right.
  function miniCard(c, cls) {
    if (!c) return h('div', { class: 'mc back' + (cls ? ' ' + cls : ''), 'aria-label': 'Hidden card' });
    const red = 'hd'.includes(c[1]);
    let col = red ? 'red' : '';
    if (SET.fourColor) col = { h: 'red', d: 'blue', c: 'green', s: '' }[c[1]];
    return h('div', { class: 'mc ' + col + (cls ? ' ' + cls : ''), role: 'img', 'aria-label': cardName(c) },
      h('span', { class: 'r' + (c[0] === 'T' ? ' ten' : '') }, c[0] === 'T' ? '10' : c[0]), suitSvg(c[1], 's1'), suitSvg(c[1], 's2'));
  }
  PK.miniCard = miniCard; PK.cardName = cardName; PK.splitCards = splitCards;

  // ---------------- derived view ----------------
  const mySeat = () => client.mySeat();
  const seatName = (i) => { const s = ui.T && ui.T.S[i]; return s ? s[1] : 'Seat ' + (i + 1); };
  PK.seatName = seatName;
  const variant = () => PK.VARIANTS[(ui.T && (ui.T.g || (ui.T.c.g !== 'dealers' ? ui.T.c.g : 'nlhe'))) || 'nlhe'] || PK.VARIANTS.nlhe;
  const inHandLive = (T) => T && ['bet', 'rit', 'runout', 'discard', 'showdown'].includes(T.hp);

  function myHandName() {
    const T = ui.T, cards = client.myCards;
    if (!T || !cards || !cards.length) return '';
    const V = variant();
    const bd = (T.bd && T.bd[0]) || [];
    if (bd.length >= 3) {
      try {
        const names = (T.bd || [bd]).map((b) => {
          const r = PK.bestHigh(cards.map(PK.toInt), b.map(PK.toInt), V.mode, V.deck === 'short');
          let n = r ? PK.nameHigh(r.score) : '';
          if (V.hilo) { const lo = PK.bestLow(cards.map(PK.toInt), b.map(PK.toInt)); n += lo ? ' / ' + PK.nameLow(lo) : ''; }
          return n;
        });
        return names.length > 1 ? names.map((n, i) => (i ? 'Board 2: ' : 'Board 1: ') + n).join(' · ') : names[0];
      } catch (e) { return ''; }
    }
    if (cards.length === 2) {
      const r = cards.map((c) => c[0]), suited = cards[0][1] === cards[1][1];
      const nm = (x) => PK.RNAME[PK.RANKS.indexOf(x) + 2];
      if (r[0] === r[1]) return 'Pocket ' + PK.RPLUR[PK.RANKS.indexOf(r[0]) + 2];
      const hi = PK.RANKS.indexOf(r[0]) > PK.RANKS.indexOf(r[1]) ? [r[0], r[1]] : [r[1], r[0]];
      return nm(hi[0]) + '-' + nm(hi[1]) + (suited ? ' suited' : ' offsuit');
    }
    return cards.length + ' cards';
  }

  function sceneVM() {
    const T = ui.T, me = mySeat();
    const seats = T.S.map((e, i) => {
      if (!e) return null;
      const shown = T.sh && T.sh[i] ? splitCards(T.sh[i]) : null;
      const inHand = !!(e[5] & F.IN) && T.hp !== 'shuffle' && T.hp !== 'void';
      let cards = shown;
      if (i === me && client.myCards && client.myCardsHand === T.hn) cards = client.myCards;
      return { stack: e[3], bet: e[4], inHand, folded: !!(e[5] & F.FOLD), nHole: inHand ? e[7] : 0, cards, shown: !!shown };
    });
    const winners = [];
    (T.res || []).forEach((r) => r[3].forEach((w) => { if (!winners.includes(w)) winners.push(w); }));
    // the cards that made the winning hands, so the table can light them up
    const win = T.hp === 'done' && !(T.unc >= 0) ? [...new Set((T.res || []).flatMap((r) => splitCards(r[6] || '')))] : null;
    return { n: T.c.s, me, mine: !!(client.myCards && client.myCardsHand === T.hn), hn: T.hn, hp: T.hp || T.ph, boards: T.hp === 'shuffle' ? [] : T.bd || [], pot: T.pot || 0, btn: T.btn, toAct: T.hp === 'bet' ? T.ta : -1, od: T.od, seats, winners, win };
  }

  // ---------------- boot ----------------
  async function boot() {
    document.documentElement.lang = 'en';
    document.documentElement.dataset.motion = reducedMotion() ? 'reduced' : 'full';
    applyLook();
    buildChrome();
    // fonts first so card faces draw with the right typefaces
    try { await Promise.race([Promise.all([document.fonts.load('600 92px "Instrument Sans"'), document.fonts.load('800 40px "Big Shoulders Display"')]), new Promise((r) => setTimeout(r, 1800))]); } catch (e) {}
    try {
      if (!window.THREE) throw new Error('3D library did not load');
      ui.scene = new PK.Scene3D($('#gl'), { reduced: reducedMotion(), quality: SET.quality, fourColor: SET.fourColor, bigCards: SET.bigCards, felt: SET.felt, back: SET.back, view: SET.view });
      ui.scene.onLayout((L) => { ui.L = L; positionOverlay(); });
      ui.scene.onDowngrade = () => { SET.quality = 'low'; saveSet(); toast('Graphics switched to battery saver so the game stays smooth on this device. Change it in Settings.'); };
      window.addEventListener('resize', () => ui.scene && ui.scene.resize());
      new ResizeObserver(() => ui.scene && ui.scene.resize()).observe($('#stage'));
    } catch (e) {
      console.warn('3D unavailable, using flat table', e);
      ui.scene = null;
      $('#gl').hidden = true;
      $('#stage').style.background = 'radial-gradient(ellipse at center, oklch(0.42 0.09 160), oklch(0.2 0.04 160) 70%, var(--bg))';
      window.addEventListener('resize', () => { flatLayout(); positionOverlay(); });
    }
    client.on('state', onState);
    client.on('cards', () => { if (ui.T) { refreshScene(); renderDock(); if (client.myCards && client.myCards.length) say('Your cards: ' + client.myCards.map(cardName).join(', ') + '. ' + myHandName(), true); } });
    client.on('chat', onChat);
    client.on('meta', (M) => { ui.M = M; if (ui.sheet === 'ledger') PK.panels.open('ledger', true); });
    client.on('peers', () => renderTopbar());
    client.on('react', onReact);
    client.on('tick', onTick);
    client.on('hostgone', () => toast((client.hostName || 'The dealer device') + ' disconnected. If they do not come back in a few seconds, another player takes over dealing.'));
    client.on('hosting', () => { renderTopbar(); });
    client.on('net', () => renderTopbar());
    PK.sfx.set(SET.volume, SET.muted);
    bindKeys();
    window.addEventListener('hashchange', () => { const c = PK.relay.parseCode(location.hash); if (c && c !== ui.code) location.reload(); });
    const code = PK.relay.parseCode(location.hash);
    if (code) await enterRoom(code, {});
    else renderAll();
    setInterval(() => { if (ui.mode === 'online' && !ui.T) renderCenter(); renderTopbar(); }, 2000);
  }

  // Join (or create) a table identified by the code in the link.
  async function enterRoom(code, opts) {
    ui.code = code; ui.mode = 'online'; ui.connecting = true; ui.enteredAt = Date.now();
    if (PK.relay.parseCode(location.hash) !== code) history.replaceState(null, '', location.pathname + location.search + '#' + code);
    renderAll();
    const { api, bus } = await PK.relay.connect(code);
    ui.bus = bus;
    await client.init(api);
    ui.connecting = false;
    if (opts.create) {
      const err = client.createTable(opts.cfg || {}, { sit: true, seat: 0, bots: opts.bots || 0 });
      if (err) toast(err);
    }
    renderAll();
  }
  async function practice(bots, cfg) {
    ui.mode = 'practice';
    await client.init(null);
    client.createTable(cfg || {}, { sit: true, seat: 0, bots });
    renderAll();
  }
  PK.enterRoom = enterRoom;
  PK.inviteUrl = () => location.origin + location.pathname + '#' + ui.code;

  function applyLook() {
    const r = document.documentElement;
    r.dataset.contrast = SET.contrast ? 'high' : 'normal';
    r.style.setProperty('--scale', SET.scale);
    r.dataset.motion = reducedMotion() ? 'reduced' : 'full';
  }
  PK.applySettings = function (changed) {
    saveSet(); applyLook();
    const sc = ui.scene;
    if (sc) {
      if (changed === 'felt') sc.setFelt(SET.felt);
      if (changed === 'back') { sc.opts.back = SET.back; sc.setFelt(SET.felt); }
      if (changed === 'fourColor') sc.setOption('fourColor', SET.fourColor);
      if (changed === 'bigCards') sc.setOption('bigCards', SET.bigCards);
      if (changed === 'quality') sc.setOption('quality', SET.quality);
      if (changed === 'view') sc.setView(SET.view);
      if (changed === 'motion') sc.opts.reduced = reducedMotion();
    }
    PK.sfx.set(SET.volume, SET.muted);
    renderAll();
  };

  // ---------------- chrome ----------------
  function buildChrome() {
    $('#drawer-close').innerHTML = icon('x');
    $('#drawer-close').onclick = () => toggleDrawer(false);
    $('#sheet-close').innerHTML = icon('x');
    $('#sheet-close').onclick = () => PK.panels.close();
    $('#scrim').onclick = () => PK.panels.close();
    $('#chatsend').innerHTML = icon('send');
    $('#tab-chat').onclick = () => setTab('chat');
    $('#tab-log').onclick = () => setTab('log');
    $('#chatform').addEventListener('submit', (e) => { e.preventDefault(); const i = $('#chatinput'); client.sendChat(i.value); i.value = ''; });
    const quick = $('#quick');
    ['gg', 'nh', 'ty', 'wp', 'gl', 'unlucky', 'ship it', 'one more'].forEach((t) => quick.append(h('button', { type: 'button', onclick: () => client.sendChat(t) }, t)));
    ['\u{1F525}', '\u{1F602}', '\u{1F62D}', '\u{1F44F}', '\u{1F92F}', '\u{1F480}', '\u{1F0CF}'].forEach((e) => quick.append(h('button', { type: 'button', class: 'emo', 'aria-label': 'React ' + e, onclick: () => react(e) }, e)));
  }
  function react(e) { const me = mySeat(); client.react(e, me >= 0 ? me : -1); }

  function setTab(t) {
    ui.tab = t;
    $('#tab-chat').setAttribute('aria-selected', t === 'chat'); $('#tab-log').setAttribute('aria-selected', t === 'log');
    $('#feed-chat').hidden = t !== 'chat'; $('#feed-log').hidden = t !== 'log';
    $('.compose').hidden = t !== 'chat';
    if (t === 'chat') { ui.unread = 0; renderTopbar(); }
    const f = t === 'chat' ? $('#feed-chat') : $('#feed-log'); f.scrollTop = f.scrollHeight;
  }
  function toggleDrawer(open, tab) {
    ui.drawer = open == null ? !ui.drawer : open;
    $('#drawer').classList.toggle('open', ui.drawer);
    $('#drawer').setAttribute('aria-hidden', !ui.drawer);
    if (tab) setTab(tab);
    if (ui.drawer && ui.tab === 'chat') { ui.unread = 0; setTimeout(() => $('#chatinput').focus({ preventScroll: true }), 280); }
    renderTopbar();
  }
  PK.toggleDrawer = toggleDrawer;

  function renderTopbar() {
    const T = ui.T;
    const info = $('#tableinfo');
    info.textContent = '';
    if (T) {
      const g = T.g || T.c.g;
      const V = PK.VARIANTS[g];
      const gname = T.c.g === 'dealers' ? "Dealer's choice" + (V ? ': ' + V.short : '') : V ? V.short : '';
      const lim = { nl: 'NL', pl: 'PL', fl: 'Limit' }[T.l || T.c.l || (V && V.lim)] || '';
      const bl = T.lvl ? [T.lvl[1], T.lvl[2]] : T.bl ? [T.bl[0], T.bl[1]] : [T.c.sb, T.c.bb];
      const live = ui.mode !== 'online' || (ui.bus && ui.bus.connected());
      info.append(h('span', { class: 'chip live', title: ui.mode === 'online' ? (live ? 'Connected' : 'Reconnecting') : 'Practice' },
        ui.mode === 'online' ? h('i', { class: 'conn ' + (live ? 'on' : 'off'), 'aria-label': live ? 'Connected' : 'Reconnecting' }) : null,
        h('b', null, lim + ' ' + gname), ' ' + fmtN(bl[0]) + '/' + fmtN(bl[1])));
      if (T.c.m === 'sng' && T.lvl && T.lvl[5]) info.append(h('span', { class: 'chip num opt' }, 'Level ' + (T.lvl[0] + 1) + ' ', h('b', { id: 'lvlleft' }, '')));
      if (T.pd) info.append(h('span', { class: 'chip live' }, h('b', null, 'Paused')));
    }
    const bar = $('#iconbar');
    bar.textContent = '';
    if (ui.mode === 'online' && ui.code) bar.append(h('button', { class: 'btn small primary invitebtn', onclick: () => PK.panels.open('invite'), html: icon('invite') + '<span>Invite</span>' }));
    if (T) {
      const chat = h('button', { class: 'ib', 'aria-label': ui.unread ? 'Chat, ' + ui.unread + ' unread' : 'Chat', title: 'Chat (T)', html: icon('chat'), onclick: () => toggleDrawer(null, 'chat') });
      if (ui.unread) chat.append(h('span', { class: 'dot', 'aria-hidden': 'true' }));
      bar.append(chat);
    }
    bar.append(h('button', { class: 'ib', 'aria-label': 'Menu', title: 'Menu (Esc to close)', html: icon('menu'), onclick: () => PK.panels.open('menu') }));
  }
  function cycleView() {
    const order = ['player', 'top', 'low'];
    SET.view = order[(order.indexOf(SET.view) + 1) % order.length];
    PK.applySettings('view');
    toast({ player: 'Player view', top: 'Overhead view', low: 'Cinematic view' }[SET.view]);
  }

  // ---------------- toasts ----------------
  function toast(text, opts) {
    const box = $('#toasts');
    const t = h('div', { class: 'toast', role: 'status' }, text);
    box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), (opts && opts.ms) || 5200);
    return t;
  }
  PK.toast = toast;

  // ---------------- state handling ----------------
  function onState({ T, prev }) {
    const first = !ui.T || ui.T.id !== T.id || ui.T.ep !== T.ep;
    ui.T = T;
    if (ui.scene && ui.scene.deckGroup && !ui.scene.deckGroup.visible) { ui.scene.deckGroup.visible = true; ui.scene.needs = true; }
    if (first) { ui.lastEv = 0; if (ui.histId !== T.id) loadHist(T.id); }
    trackHand(T);
    trackBlinds(T);
    processEvents(T, first);
    if (T.msg && (!ui.lastMsg || ui.lastMsg !== T.msg[0])) { ui.lastMsg = T.msg[0]; if (!first || !prev) toast(T.msg[1]); logLine(T.msg[1], 'sys'); }
    handleVote(T);
    handleTurn(T);
    handleAudit(T);
    refreshScene();
    renderAll();
  }

  // who posted the blinds this hand (for the SB / BB markers next to names)
  function trackBlinds(T) {
    if (!ui.pos || ui.pos.hn !== T.hn) ui.pos = { hn: T.hn, sb: -1, bb: -1 };
    const ev = T.ev || [];
    let start = -1;
    for (let i = ev.length - 1; i >= 0; i--) if (ev[i][1] === 'hand') { start = i; break; }
    if (start < 0) return;
    for (let i = start + 1; i < ev.length; i++) { const e = ev[i]; if (e[1] === 'post' && (e[4] === 'sb' || e[4] === 'bb')) ui.pos[e[4]] = e[2]; }
  }

  function refreshScene() {
    if (!ui.T) return;
    if (ui.scene) ui.scene.update(sceneVM());
    else { flatLayout(); positionOverlay(); }
  }

  function renderAll() {
    renderTopbar(); renderCenter(); renderSeats(); renderDock(); positionOverlay();
    const sc = ui.scene;
    if (sc && sc.deckGroup && sc.deckGroup.visible !== !!ui.T) { sc.deckGroup.visible = !!ui.T; sc.needs = true; } // no deck peeking out behind the welcome card
  }

  // ---------------- events → log, sounds, announcements ----------------
  function processEvents(T, silent) {
    const evs = (T.ev || []).filter((e) => e[0] > ui.lastEv);
    if (!evs.length) return;
    ui.lastEv = Math.max(...evs.map((e) => e[0]));
    if (silent) return;
    const me = mySeat();
    for (const [, k, s, a, x] of evs) {
      const nm = seatName(s);
      switch (k) {
        case 'hand': { const vn = (PK.VARIANTS[x] || PK.VARIANTS[T.g] || {}).name; logLine('Hand #' + T.hn + (vn ? ' · ' + vn : ''), 'street'); break; }
        case 'post': logLine(nm + ' posts ' + ({ sb: 'small blind', bb: 'big blind', ante: 'ante', straddle: 'straddle', bomb: 'bomb pot' }[x] || x) + ' ' + fmt(a)); break;
        case 'act': {
          const t = String(x);
          const line = t === 'fold' ? nm + ' folds' : t === 'check' ? nm + ' checks' : t === 'call' ? nm + ' calls ' + fmt(a) : t === 'bet' ? nm + ' bets ' + fmt(a) : t === 'raise' ? nm + ' raises to ' + fmt(a) : t === 'all-in' ? nm + ' is all in for ' + fmt(a) : nm + ' ' + t;
          logLine(line);
          if (t === 'fold') PK.sfx.fold(); else if (t === 'check') PK.sfx.check(); else if (t === 'all-in') PK.sfx.allin();
          if (s !== me) say(line, true);
          break;
        }
        case 'board': {
          const cs = splitCards(x);
          const street = cs.length === 3 ? 'Flop' : (T.bd && T.bd[0] && T.bd[0].length === 4) ? 'Turn' : 'River';
          const lbl = (T.bd && T.bd.length > 1 ? (T.dbl ? '' : '') : '') + street;
          logLine(lbl + ': ' + cs.map((c) => (c[0] === 'T' ? '10' : c[0]) + PK.SUIT_GLYPH[c[1]]).join(' '), 'street');
          say(lbl + ': ' + cs.map(cardName).join(', '), true);
          break;
        }
        case 'show': if (x) logLine(nm + ' shows ' + splitCards(x).map((c) => (c[0] === 'T' ? '10' : c[0]) + PK.SUIT_GLYPH[c[1]]).join(' ')); break;
        case 'win': logLine(nm + ' wins ' + fmt(a), 'win'); if (s === me) { PK.sfx.win(); if (SET.haptics && navigator.vibrate) navigator.vibrate([30, 40, 30]); } say(nm + ' wins ' + fmt(a), true); break;
        case 'refund': logLine('Uncalled ' + fmt(a) + ' returned to ' + nm); break;
        case 'bounty': logLine(nm + ' collects the 7-2 bounty: ' + fmt(a), 'win'); toast(nm + ' won with 7-2 and collects the bounty: ' + fmt(a)); break;
        case 'rit': if (x === '2') logLine('Running it twice', 'street'); break;
        case 'void': logLine('Hand cancelled, stacks returned', 'street'); break;
        case 'sit': logLine(nm + ' sits down with ' + fmt(a)); break;
        case 'rebuy': logLine(nm + ' adds ' + fmt(a)); break;
        case 'discardStart': logLine('Everyone discards one card', 'street'); break;
      }
    }
  }

  function renderTicker() {
    const tk = $('#ticker'); if (!tk) return;
    let from = 0;
    for (let i = ui.log.length - 1; i >= 0; i--) if (/^Hand #/.test(ui.log[i].text)) { from = i; break; }
    const lines = ui.log.slice(from).slice(-5);
    tk.textContent = '';
    tk.hidden = !lines.length || !ui.T;
    for (const l of lines) tk.append(h('div', { class: 'tl' + (l.cls ? ' ' + l.cls : '') }, l.text));
    tk.onclick = () => toggleDrawer(true, 'log');
  }
  function logLine(text, cls) {
    ui.log.push({ text, cls });
    if (ui.log.length > 300) ui.log.shift();
    renderTicker();
    const f = $('#feed-log');
    const atBottom = f.scrollHeight - f.scrollTop - f.clientHeight < 40;
    f.append(h('div', { class: 'logline' + (cls ? ' ' + cls : '') }, text));
    while (f.children.length > 300) f.firstChild.remove();
    if (atBottom) f.scrollTop = f.scrollHeight;
  }

  function onChat(list) {
    const f = $('#feed-chat');
    const have = f.children.length;
    if (list.length < have) f.textContent = '';
    const atBottom = f.scrollHeight - f.scrollTop - f.clientHeight < 40;
    for (const m of list.slice(f.children.length)) {
      f.append(h('div', { class: 'msg' }, h('span', { class: 'who', style: { color: colorOf(m.cl) } }, m.me ? 'You' : m.nm), h('span', { class: 'txt' }, m.text)));
      if (!m.me) {
        if (!(ui.drawer && ui.tab === 'chat')) { ui.unread++; renderTopbar(); toast(m.nm + ': ' + m.text, { ms: 3500 }); }
        PK.sfx.blip();
        say(m.nm + ' says ' + m.text, true);
      }
    }
    if (atBottom) f.scrollTop = f.scrollHeight;
  }

  function onReact({ emoji, seat }) {
    const L = ui.L;
    let p = L && seat >= 0 && L.seats[seat] ? L.seats[seat] : { x: $('#stage').clientWidth / 2, y: $('#stage').clientHeight / 2 };
    const el = h('div', { class: 'react', style: { left: p.x + 'px', top: p.y - 30 + 'px' }, 'aria-hidden': 'true' }, emoji);
    $('#overlay').append(el);
    setTimeout(() => el.remove(), 1900);
  }

  // ---------------- votes ----------------
  function handleVote(T) {
    const v = T.vt;
    const box = $('#toasts');
    const existing = box.querySelector('.toast.vote');
    if (!v) { if (existing) existing.remove(); ui.voteSeen = null; return; }
    const me = mySeat();
    const voted = v[4].includes(me) || v[5].includes(me);
    const body = [h('div', null, h('b', null, v[3] + ' asks: '), v[2]), h('div', { class: 'note num' }, v[4].length + ' yes, ' + v[5].length + ' no, ' + v[6] + ' needed')];
    if (me >= 0 && !voted) body.push(h('div', { class: 'prompt' }, h('button', { class: 'btn small primary', onclick: () => client.req('vote', { id: v[0], yes: true }) }, 'Yes ', h('kbd', null, 'Y')), h('button', { class: 'btn small', onclick: () => client.req('vote', { id: v[0], yes: false }) }, 'No ', h('kbd', null, 'N'))));
    const el = h('div', { class: 'toast vote', role: 'status' }, ...body);
    if (existing) existing.replaceWith(el); else box.prepend(el);
    if (ui.voteSeen !== v[0]) { ui.voteSeen = v[0]; say('Vote: ' + v[2] + ' Press Y for yes or N for no.'); PK.sfx.blip(); }
  }

  // ---------------- my turn ----------------
  function handleTurn(T) {
    const me = mySeat();
    const key = T.id + ':' + T.hn + ':' + T.tn;
    if (T.hp === 'bet' && T.ta === me && me >= 0) {
      if (ui.lastTurn !== key) {
        ui.lastTurn = key;
        ui.sending = false;
        ui.raiseOpen = false;
        const la = T.la;
        // pre-actions
        const pre = ui.pre;
        ui.pre = null;
        if (pre) {
          if (pre === 'checkfold') return sendAct(la[2] ? 'check' : 'fold');
          if (pre === 'check' && la[2]) return sendAct('check');
          if (pre === 'callany') return sendAct(la[2] ? 'check' : 'call');
          if (pre === 'call' && (la[2] || la[1] === ui.preAmt)) return sendAct(la[2] ? 'check' : 'call');
          if (pre === 'fold') return sendAct(la[2] ? 'check' : 'fold');
        }
        ui.raiseTo = defaultRaise(la);
        PK.sfx.turn();
        if (SET.haptics && navigator.vibrate) navigator.vibrate(40);
        const potNow = (T.pot || 0) + T.S.reduce((a, s) => a + (s ? s[4] : 0), 0);
        say('Your turn. ' + (la[2] ? 'You can check.' : fmt(la[1]) + ' to call.') + ' Pot ' + fmt(potNow) + '. F fold, C ' + (la[2] ? 'check' : 'call') + (la[3] ? ', R raise' : '') + '.');
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Your turn at ' + T.c.n); } catch (e) {} }
        flashTitle(true);
      }
    } else if (ui.lastTurn && !(T.hp === 'bet' && T.ta === me)) { ui.raiseOpen = false; flashTitle(false); ui.foldArm = 0; }
    // clear pre-actions at a new street or hand
    const street = T.hn + ':' + ((T.bd && T.bd[0]) || []).length;
    if (ui.preStreet !== street) { ui.preStreet = street; if (ui.pre === 'call') ui.pre = null; }
    if (!inHandLive(T)) ui.pre = null;
  }

  // background tab: blink the title so you notice it is your turn
  function flashTitle(on) {
    clearInterval(ui.titleTimer); ui.titleTimer = null;
    if (!ui.baseTitle) ui.baseTitle = document.title;
    document.title = ui.baseTitle;
    if (!on) return;
    let n = 0;
    ui.titleTimer = setInterval(() => { if (!document.hidden && n > 1) { clearInterval(ui.titleTimer); document.title = ui.baseTitle; return; } document.title = (n++ % 2 ? ui.baseTitle : '● Your turn'); }, 900);
  }

  function defaultRaise(la) {
    if (!la || !la[3]) return 0;
    const T = ui.T;
    const [toCall, , , , minTo, maxTo] = la;
    const potNow = (T.pot || 0) + T.S.reduce((a, s) => a + (s ? s[4] : 0), 0);
    const cur = minTo - Math.max(T.bl ? T.bl[1] : T.c.bb, 0);
    let v = minTo;
    const frac = { half: 0.5, twothirds: 2 / 3, pot: 1 }[SET.betDefault];
    if (frac) v = Math.round(Math.max(cur, 0) + (potNow + toCall) * frac + (la[6] ? 0 : toCall * 0));
    return clampRaise(v, la);
  }
  function clampRaise(v, la) { la = la || (ui.T && ui.T.la); if (!la) return v; return Math.max(la[4], Math.min(la[5], Math.round(v))); }

  function sendAct(k, amount) {
    const T = ui.T, me = mySeat();
    if (!T || T.hp !== 'bet' || T.ta !== me || ui.sending) return;
    const la = T.la;
    if (k === 'raise' || k === 'bet') amount = clampRaise(amount, la);
    if (k === 'fold' && la && la[2]) {
      // folding when you could check for free is almost always a misclick
      if (Date.now() - (ui.foldArm || 0) > 2500) { ui.foldArm = Date.now(); toast('You can check for free. Press Fold again to fold anyway.', { ms: 2500 }); say('You can check for free. Press F again to fold anyway.'); renderDock(); setTimeout(() => { if (ui.foldArm && Date.now() - ui.foldArm >= 2500) renderDock(); }, 2600); return; }
    }
    ui.foldArm = 0;
    if (k === 'allin') {
      if (SET.confirmAllin && Date.now() - ui.allinArm > 2500) { ui.allinArm = Date.now(); ui.raiseTo = la[5]; toast('Press again to confirm all-in.', { ms: 2500 }); say('Press A again to confirm all in.'); renderDock(); setTimeout(() => renderDock(), 2600); return; }
      ui.allinArm = 0;
    }
    ui.sending = true;
    ui.raiseOpen = false;
    const err = client.req('act', { k, a: amount });
    if (err) { ui.sending = false; toast(err); }
    setTimeout(() => { if (ui.sending && ui.T && ui.T.tn === T.tn) { ui.sending = false; renderDock(); } }, 4000);
    renderDock();
  }
  PK.sendAct = sendAct;

  // ---------------- audits ----------------
  function handleAudit(T) {
    if (!T.rv) return;
    const hn = T.rv[0];
    const rec = ui.hist.get(hn);
    if (!rec || (rec.audit && rec.audit.secret === T.rv[1])) return;
    const seen = {};
    if (rec.mySeat >= 0 && rec.my) seen[rec.mySeat] = rec.my;
    for (const s in rec.sh || {}) seen[s] = splitCards(rec.sh[s]);
    const V = PK.VARIANTS[rec.game] || PK.VARIANTS.nlhe;
    const boardSeq = (rec.log || []).filter((e) => e[1] === 'board' && e[4]).map((e) => splitCards(e[4]));
    PK.fair.verifyHand({ secret: T.rv[1], commit: rec.cm, shuffleCommit: rec.commitChanged ? 'changed' : rec.shuffleCommit, seeds: T.rv[2], mySeed: rec.mySeed, deckKind: V.deck, order: rec.od || T.rv[4], hole: V.hole, seen, boards: rec.bd || [], boardSeq, discardVariant: rec.game === 'pine' }).then((v) => {
      rec.audit = { secret: T.rv[1], ok: v.commitOk && v.deckOk, commitOk: v.commitOk, deckOk: v.deckOk, problems: v.problems, warnings: v.warnings || [], partial: !!v.partial, dealt: v.dealt };
      saveHist();
      if (ui.auditWait === hn) { ui.auditWait = null; toast(rec.audit.ok ? 'Hand #' + hn + ' audit passed: the shuffle matches the commitment.' : 'Hand #' + hn + ' audit FAILED. See history for details.'); }
      if (ui.sheet === 'history') PK.panels.open('history', true);
    });
  }

  // ---------------- hand history (local to this viewer) ----------------
  function loadHist(id) {
    ui.hist = new Map();
    ui.histId = id;
    try { for (const r of JSON.parse(localStorage.getItem('br.hist.' + id) || '[]')) ui.hist.set(r.hn, r); } catch (e) {}
  }
  function saveHist() {
    const arr = [...ui.hist.values()].sort((a, b) => a.hn - b.hn).slice(-80);
    try { localStorage.setItem('br.hist.' + ui.histId, JSON.stringify(arr)); } catch (e) {}
  }
  function trackHand(T) {
    if (T.hp === 'shuffle' && T.nh && T.cm) {
      ui.commits = ui.commits || {};
      const k = T.id + ':' + T.nh;
      if (!ui.commits[k]) ui.commits[k] = T.cm; else if (ui.commits[k] !== T.cm) ui.commits[k + ':changed'] = true;
      return;
    }
    if (!T.hn || T.hp === 'shuffle' || !T.hp) return;
    let rec = ui.hist.get(T.hn);
    const me = mySeat();
    if (!rec) {
      const ck = T.id + ':' + T.hn;
      rec = { hn: T.hn, at: Date.now(), game: T.g, lim: T.l, bl: T.bl, btn: T.btn, names: T.S.map((s) => (s ? s[1] : null)), start: T.ss || T.S.map((s) => (s ? s[3] : null)), mySeat: me, log: [], sh: {},
        shuffleCommit: ui.commits && ui.commits[ck], commitChanged: !!(ui.commits && ui.commits[ck + ':changed']), mySeed: me >= 0 && client.seeds[T.hn] && T.S[me] && (T.S[me][5] & F.IN) ? me + ':' + client.seeds[T.hn] : null };
      ui.hist.set(T.hn, rec);
      ui.recEv = 0;
    }
    rec.bd = T.bd || rec.bd; rec.cm = T.cm || rec.cm; rec.sd = T.sd || rec.sd; rec.od = T.od || rec.od;
    if (T.sh) Object.assign(rec.sh, T.sh);
    if (me >= 0 && client.myCards && client.myCardsHand === T.hn) { rec.my = client.myCards.slice(); rec.mySeat = me; }
    for (const e of T.ev || []) {
      if (e[0] <= (rec.lastEv || 0)) continue;
      rec.lastEv = e[0];
      if (['post', 'act', 'board', 'show', 'win', 'refund', 'bounty', 'rit', 'void', 'discardStart', 'collect'].includes(e[1])) rec.log.push(e);
    }
    if (T.hp === 'done' || T.hp === 'void') {
      rec.res = T.res || rec.res; rec.hnm = T.hnm || rec.hnm; rec.end = T.S.map((s) => (s ? s[3] : null)); rec.unc = T.unc; rec.bty = T.bty;
      rec.void = T.hp === 'void';
      if (!rec.saved) { rec.saved = true; saveHist(); }
    }
    if (T.rab && T.rab[0] === T.hn) rec.rab = T.rab[1];
  }

  // ---------------- tick (timers, countdowns) ----------------
  function onTick() {
    const T = ui.T;
    if (!T) return;
    const skew = T.now ? T.now - Date.now() : 0;
    void skew;
    const lv = $('#lvlleft');
    if (lv && T.lvl) { const ms = Math.max(0, T.lvl[4] - T.now - (Date.now() - ui.recvAt)); lv.textContent = mmss(ms); }
    const cd = $('#nextcd');
    if (cd && T.nx) { const ms = Math.max(0, T.nx - T.now - (Date.now() - ui.recvAt)); cd.textContent = Math.ceil(ms / 1000) + 's'; }
    // seconds left for whoever is acting (shown in the last 10 seconds)
    const sx = document.querySelector('.seat.toact .secs');
    if (sx && T.dl) { const s = Math.ceil(Math.max(0, T.dl - T.now - (Date.now() - ui.recvAt)) / 1000); sx.textContent = s <= 10 ? s + 's' : ''; sx.classList.toggle('show', s <= 10); }
    // warning tick in the last seconds of my turn
    if (T.hp === 'bet' && T.ta === mySeat() && T.dl) {
      const left = T.dl - T.now - (Date.now() - ui.recvAt);
      const s = Math.ceil(left / 1000);
      if (s <= 5 && s > 0 && ui.warned !== T.tn + ':' + s) { ui.warned = T.tn + ':' + s; PK.sfx.tick(); if (s === 5) say('5 seconds left.'); }
    }
  }
  const mmss = (ms) => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  client.on('state', () => { ui.recvAt = Date.now(); });

  // ---------------- center card ----------------
  function renderCenter() {
    const box = $('#center');
    const T = ui.T, me = mySeat();
    const wt = Date.now() - (ui.enteredAt || 0);
    const seated = T ? T.S.filter(Boolean).length : 0;
    const key = [!!T, ui.mode, ui.connecting, me, T && T.ph, ui.joinDismissed, wt > 5000, wt > 12000, wt > 25000, ui.bus && ui.bus.connected(), seated, !!client.host, ui.code].join('|');
    if (key === ui.centerKey && box.children.length) return;
    ui.centerKey = key;
    box.textContent = '';
    const nameInput = (id) => h('input', { class: 'input big', id, value: client.nick || '', maxlength: 16, placeholder: 'Your name', 'aria-label': 'Your name', autocomplete: 'nickname', onchange: (e) => client.setNick(e.target.value) });
    if (!ui.mode) {
      const name = nameInput('lobby-name');
      box.append(h('div', { class: 'card hero stack' },
        h('h1', null, 'Back Room Poker'),
        h('p', null, 'Hold’em, Omaha and more, dealt on a 3D table. Make a table, send your friends the link, and they’re in. No sign-up.'),
        name,
        h('button', { class: 'btn primary big', id: 'quickstart', onclick: () => { client.setNick(name.value); PK.enterRoom(PK.relay.newCode(), { create: true }); } }, 'Create a table'),
        joinByCode(name),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => { client.setNick(name.value); practice(5); } }, 'Practise vs bots'),
          h('button', { class: 'btn ghost', onclick: () => { client.setNick(name.value); PK.panels.open('setup'); } }, 'Table options')),
        h('p', { class: 'note' }, 'Play chips only, no real money.')));
      return;
    }
    if (ui.mode === 'online' && !T) {
      const waited = Date.now() - (ui.enteredAt || Date.now());
      const conn = ui.bus && ui.bus.connected();
      if (!conn && waited > 12000) {
        box.append(h('div', { class: 'card stack' }, h('h1', null, 'Can’t connect'), h('p', null, 'This Wi-Fi seems to block the game. Switch to mobile data (or another Wi-Fi) and tap Try again.'), h('button', { class: 'btn primary big', onclick: () => location.reload() }, 'Try again')));
      } else if (waited < 25000 || ui.connecting) {
        box.append(h('div', { class: 'card stack center' }, h('h1', null, 'Joining table'), h('p', null, waited < 5000 ? 'Finding the other players…' : 'Waiting for the table. Ask the friend who sent you the link to keep the game open on their screen (phones pause it when you switch apps).')));
      } else {
        box.append(h('div', { class: 'card stack' }, h('h1', null, 'Table not found yet'), h('p', null, 'Nobody at this link is answering. Ask your friend to open the game on their screen. This page keeps looking and joins as soon as they are back.'),
          h('button', { class: 'btn primary big', onclick: () => { location.hash = ''; location.reload(); } }, 'Make my own table instead'),
          h('button', { class: 'btn ghost', onclick: () => { const err = client.createTable({}, { sit: true, seat: 0 }); if (err) toast(err); else setTimeout(() => PK.panels.open('invite'), 400); } }, 'I made this table: restart it here')));
      }
      return;
    }
    if (T && T.ph === 'over') {
      const pl = (T.pl || []).slice().sort((a, b) => a[1] - b[1]);
      box.append(h('div', { class: 'card stack' }, h('h1', null, 'Tournament over'),
        h('div', { class: 'ranks' }, pl.slice(0, 6).map((p) => h('div', { class: 'rankrow' }, h('span', { class: 'n' }, p[1]), h('b', null, p[0]), h('span', { class: 'ex note' }, p[1] === 1 ? 'Winner' : '')))),
        client.host ? h('button', { class: 'btn primary', onclick: () => client.host.resetTournament() }, 'Set up a rematch') : h('p', { class: 'note' }, 'The host can start a rematch.')));
      return;
    }
    // seated but alone: invite friends right here (link, copy, share), or add a bot to start now
    if (T && me >= 0 && T.ph === 'wait' && seated < 2 && T.c.m === 'cash') {
      const card = h('div', { class: 'card stack waitcard' }, h('h1', null, ui.mode === 'online' ? 'Invite your friends' : 'Add some players'));
      if (ui.mode === 'online') {
        const url = PK.inviteUrl();
        const inp = h('input', { class: 'input big num', id: 'wait-url', value: url, readonly: true, 'aria-label': 'Invite link', onfocus: (e) => e.target.select() });
        const copy = h('button', { class: 'btn primary big', type: 'button', onclick: async () => {
          try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied! Now paste it to your friends'; setTimeout(() => { copy.textContent = 'Copy invite link'; }, 2200); }
          catch (e) { inp.focus(); inp.select(); copy.textContent = 'Press Ctrl+C (or Cmd+C) to copy'; }
        } }, 'Copy invite link');
        const row = h('div', { class: 'row' });
        if (navigator.share) row.append(h('button', { class: 'btn', type: 'button', onclick: () => navigator.share({ title: 'Back Room Poker', text: 'Come play poker with me', url }).catch(() => {}) }, 'Share…'));
        row.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => PK.panels.open('invite') }, 'Show QR code'));
        card.append(h('p', null, 'Send this link. Friends open it, type a name and tap ', h('b', null, 'Sit down'), '. The game starts as soon as two people are seated.'), inp, copy, row);
      }
      if (client.host) card.append(h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => { const err = client.host.addBot(); if (err) toast(err); } }, ui.mode === 'online' ? 'Add a bot while you wait' : 'Add a bot')));
      if (ui.mode === 'online') card.append(h('p', { class: 'note' }, 'Keep this page open: your device deals the cards.'));
      box.append(card);
      return;
    }
    // a visitor who has not sat down yet: one obvious step
    if (T && me < 0 && !ui.joinDismissed) {
      const sngLocked = T.c.m === 'sng' && T.lvl && T.lvl[5];
      const free = T.S.findIndex((x) => !x);
      const name = nameInput('join-name');
      const host = T.host ? T.host[1] : 'the';
      const card = h('div', { class: 'card stack' }, h('h1', null, sngLocked ? 'Tournament running' : free < 0 ? 'Table is full' : 'Join ' + host + (host === 'the' ? ' table' : '’s table')));
      if (sngLocked || free < 0) card.append(h('p', null, 'You can watch, and take a seat when one opens.'), h('button', { class: 'btn', onclick: () => { ui.joinDismissed = true; renderAll(); } }, 'Watch'));
      else card.append(name, h('button', { class: 'btn primary big', id: 'joinbtn', onclick: () => { client.setNick(name.value); takeSeat(free); ui.joinDismissed = true; renderAll(); } }, 'Sit down'), h('button', { class: 'btn ghost', onclick: () => { ui.joinDismissed = true; renderAll(); } }, 'Just watch'));
      box.append(card);
      setTimeout(() => { const i = $('#join-name'); if (i && !i.value) i.focus({ preventScroll: true }); }, 50);
    }
  }
  // "Got a link from a friend?" box on the first screen: paste a link or type the code
  function joinByCode(nameInp) {
    const inp = h('input', { class: 'input', id: 'join-code', placeholder: 'Paste a friend’s link or code', 'aria-label': 'Friend’s link or table code', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const go = () => {
      const raw = inp.value.trim();
      const code = PK.relay.parseCode(raw.includes('#') ? raw.split('#').pop() : raw);
      if (!code) { toast('That doesn’t look like a table link. It ends with a code like abcd-efgh-jkmn.'); inp.focus(); return; }
      client.setNick(nameInp.value);
      PK.enterRoom(code, {});
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    return h('div', { class: 'joinrow' }, inp, h('button', { class: 'btn', type: 'button', id: 'join-go', onclick: go }, 'Join'));
  }
  function start(cfg, bots) {
    if (!ui.mode) return PK.enterRoom(PK.relay.newCode(), { create: true, cfg, bots });
    const err = client.createTable(cfg, { sit: true, seat: 0, bots });
    if (err) toast(err);
  }
  PK.startTable = start;
  PK.practice = practice;

  // ---------------- seats ----------------
  function renderSeats() {
    const T = ui.T, ov = $('#overlay');
    if (!T) { ov.textContent = ''; ui.seatEls = []; return; }
    const n = T.c.s, me = mySeat();
    while (ui.seatEls.length < n) {
      const i = ui.seatEls.length;
      const el = h('div', { class: 'seat', 'data-i': i });
      ov.append(el); ui.seatEls.push(el);
      const b = h('div', { class: 'betlabel num', hidden: true });
      ov.append(b); ui.betEls.push(b);
    }
    while (ui.seatEls.length > n) { ui.seatEls.pop().remove(); ui.betEls.pop().remove(); }
    let pot = $('#potlabel');
    if (!pot) { pot = h('div', { id: 'potlabel' }); ov.append(pot); }
    let bi = $('#boardinfo');
    if (!bi) { bi = h('div', { id: 'boardinfo' }); ov.append(bi); }
    const winners = new Map();
    (T.res || []).forEach((r) => r[3].forEach((w) => winners.set(w, (winners.get(w) || 0) + (r[4] / r[3].length))));
    for (let i = 0; i < n; i++) {
      const el = ui.seatEls[i], e = T.S[i];
      el.textContent = '';
      el.className = 'seat';
      if (!e) {
        if (me < 0 && !(T.c.m === 'sng' && T.lvl && T.lvl[5])) el.append(h('button', { class: 'emptyseat', onclick: () => takeSeat(i), 'aria-label': 'Sit in seat ' + (i + 1) }, 'Sit'));
        ui.betEls[i].hidden = true;
        continue;
      }
      const f = e[5];
      const isMe = i === me;
      if (isMe) el.classList.add('me');
      if (T.hp === 'bet' && T.ta === i) el.classList.add('toact');
      if (f & F.FOLD) el.classList.add('folded');
      if ((f & F.OUT) || (f & F.BUST) || (f & F.DISC)) el.classList.add('out');
      if (T.hp === 'done' && winners.has(i)) el.classList.add('win');
      // above the plate: equity, result, or last action
      const eq = T.eq && T.eq[i] != null && !(f & F.FOLD) ? T.eq[i] : null;
      let shownAct = '';
      if (T.hp === 'done' && winners.has(i)) el.append(h('div', { class: 'result' }, '+' + fmt(winners.get(i)) + (T.hnm && T.hnm[i] ? ' · ' + T.hnm[i][0] : '')));
      else if (T.hp === 'done' && T.hnm && T.hnm[i]) el.append(h('div', { class: 'result lose' }, T.hnm[i][0]));
      else if (eq != null && T.hp !== 'done') el.append(h('div', { class: 'eq num', 'aria-label': eq + ' percent to win' }, eq + '%'));
      else {
        const la = e[6];
        shownAct = la || '';
        el.append(h('div', { class: 'lastact ' + (la ? 'show ' + la.toLowerCase().replace(/\s+/g, '-') : ''), 'aria-hidden': !la }, la || ' '));
      }
      const tags = h('div', { class: 'tags' });
      const handOn = T.hp && T.hp !== 'shuffle' && T.hn > 0;
      if (handOn && i === T.btn) tags.append(h('span', { class: 'tag pos d', title: 'Dealer button' }, 'D'));
      if (handOn && ui.pos && ui.pos.hn === T.hn && i === ui.pos.sb && i !== T.btn) tags.append(h('span', { class: 'tag pos', title: 'Small blind' }, 'SB'));
      if (handOn && ui.pos && ui.pos.hn === T.hn && i === ui.pos.bb) tags.append(h('span', { class: 'tag pos', title: 'Big blind' }, 'BB'));
      if ((f & F.ALLIN) && !/all/i.test(shownAct)) tags.append(h('span', { class: 'tag', style: { color: 'var(--allin)' } }, 'All-in'));
      if (f & F.DISC) tags.append(h('span', { class: 'tag' }, 'Offline'));
      else if (f & F.OUT) tags.append(h('span', { class: 'tag' }, f & F.AWAY ? 'Away' : 'Sitting out'));
      else if ((f & F.BUST) && !(f & F.IN)) tags.append(h('span', { class: 'tag' }, 'Busted'));

      const timer = h('div', { class: 'timer' + (T.tbu ? ' bank' : '') }, h('i'));
      if (T.hp === 'bet' && T.ta === i && T.dl) tags.append(h('span', { class: 'tag secs num', 'aria-hidden': 'true' }, ''));
      const plate = h('div', { class: 'plate', role: 'group', 'aria-label': e[1] + ', ' + fmt(e[3]) + ' chips' + (f & F.FOLD ? ', folded' : '') + (f & F.ALLIN ? ', all in' : '') },
        tags,
        h('div', { class: 'avatar', style: { background: colorOf(e[2]) }, 'aria-hidden': 'true' }, initials(e[1])),
        h('div', { style: { minWidth: 0 } }, h('div', { class: 'pname' }, e[1], f & F.BOT ? h('span', { class: 'botmark' }, ' bot') : null), h('div', { class: 'pstack' }, fmt(e[3]))),
        timer);
      el.append(plate);
      if (T.hp === 'bet' && T.ta === i && T.dl) startTimer(timer, T);
      const b = ui.betEls[i];
      if (e[4] > 0) { b.hidden = false; b.textContent = fmt(e[4]); } else b.hidden = true;
    }
    // pot
    pot.textContent = '';
    const bets = T.S.reduce((a, s) => a + (s ? s[4] : 0), 0);
    if (T.pot > 0 || bets > 0) {
      pot.append(h('div', { class: 'main num', 'aria-label': 'Pot ' + fmt(T.pot + bets) }, 'Pot ' + fmt(T.pot + bets)));
      if (bets > 0 && T.pot > 0) pot.append(h('div', { class: 'side num' }, fmt(T.pot) + ' in the middle'));
    }
    // winner banner
    bi.textContent = '';
    if (T.hp === 'done' && T.res && T.res.length) {
      const r = T.res.find((x) => x[0] === 0) || T.res[0];
      const names = r[3].map(seatName).join(' & ');
      const many = T.res.length > 1;
      const text = r[3].length > 1 ? names + ' split the pot' : names + ' wins' + (many ? '' : ' ' + fmt(r[4]));
      const sub = T.unc >= 0 ? 'Everyone else folded.' : r[5] + (r[7] ? '. ' + r[7] : '');
      const banner = h('div', { class: 'banner', role: 'status' }, many ? 'Results' : text, many ? null : h('small', null, sub));
      if (many) {
        // side pots, split pots, hi/lo and run-it-twice: one line each
        const runs = new Set(T.res.map((x) => x[8])).size > 1;
        const list = h('div', { class: 'potlist' });
        for (const x of T.res) {
          const who = x[3].map(seatName).join(' & ');
          const label = (runs && x[8] >= 0 ? 'Run ' + (x[8] + 1) + ' · ' : '') + (x[0] === 0 ? 'Main pot' : 'Side pot' + (x[0] > 1 ? ' ' + x[0] : '')) + (x[2] ? ' (low)' : '');
          list.append(h('div', { class: 'potline' }, h('span', { class: 'pl' }, label), h('b', null, who + (x[3].length > 1 ? ' split ' : ' wins ') + fmt(x[4])), T.unc >= 0 ? null : h('span', { class: 'ph' }, x[5])));
        }
        banner.append(list);
      }
      bi.append(banner);
      bi.append(h('button', { class: 'btn small', onclick: () => PK.panels.open('rules', false, 'hand'), style: { pointerEvents: 'auto' } }, 'Why did that win?'));
    } else if (T.hp === 'void') bi.append(h('div', { class: 'banner' }, 'Hand cancelled', h('small', null, 'Stacks returned to where the hand started.')));
    else if (T.ph === 'wait' && T.c.m === 'sng' && !(T.lvl && T.lvl[5])) bi.append(h('div', { class: 'banner' }, 'Tournament lobby', h('small', null, client.host ? 'Start the tournament from the dock when everyone is seated.' : 'Waiting for the host to start.')));
    else if (T.ph === 'paused') bi.append(h('div', { class: 'banner' }, 'Paused'));
    else if (T.hp === 'shuffle') bi.append(h('div', { class: 'banner', style: { opacity: 0.85 } }, 'Shuffling', h('small', { class: 'num' }, 'Deck commitment ' + String(T.cm || '').slice(0, 12) + '…')));
    else if (T.hp === 'rit') bi.append(h('div', { class: 'banner' }, 'All in', h('small', null, 'Players can agree to run it twice.')));
    if (!ui.scene && T.bd && T.hp !== 'shuffle') {
      for (const b of T.bd) bi.append(h('div', { class: 'cardrow' }, b.map((c) => miniCard(c))));
    }
  }

  function startTimer(timer, T) {
    const i = timer.firstChild;
    const left = Math.max(0, T.dl - T.now - (Date.now() - (ui.recvAt || Date.now())));
    const total = T.tbu ? Math.max(left, 1000) : (T.c.tm || 30) * 1000;
    i.style.transition = 'none';
    i.style.transform = 'scaleX(' + Math.min(1, left / total) + ')';
    requestAnimationFrame(() => requestAnimationFrame(() => { i.style.transition = 'transform ' + left + 'ms linear'; i.style.transform = 'scaleX(0)'; }));
  }

  function takeSeat(i) {
    const T = ui.T;
    const amt = Number(($('#buyin') || {}).value) || T.c.bi;
    client.req('sit', { seat: i, buy: amt });
    say('Taking seat ' + (i + 1) + '.');
  }
  PK.takeSeat = takeSeat;

  // ---------------- overlay positioning ----------------
  function flatLayout() {
    const st = $('#stage'), W = st.clientWidth, H = st.clientHeight;
    const T = ui.T; if (!T) return;
    const n = T.c.s, me = mySeat(), ref = me >= 0 ? me : 0;
    const rx = W * 0.4, ry = H * 0.36, cx = W / 2, cy = H * 0.52;
    const seats = [], bets = [];
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (2 * Math.PI * (i - ref)) / n;
      seats.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
      bets.push({ x: cx + Math.cos(a) * rx * 0.6, y: cy + Math.sin(a) * ry * 0.6 });
    }
    ui.L = { seats, bets, pot: { x: cx, y: cy - ry * 0.35 }, board: { x: cx, y: cy - 30 } };
  }
  function positionOverlay() {
    const L = ui.L, T = ui.T;
    if (!L || !T) return;
    const st = $('#stage'), W = st.clientWidth, H = st.clientHeight;
    st.classList.toggle('dense', W < 560 && T.S.filter(Boolean).length >= 6); // a full table on a phone: slimmer name plates
    ui.seatEls.forEach((el, i) => {
      const p = L.seats[i]; if (!p) return;
      const w = el.offsetWidth || 120, hh = el.offsetHeight || 60;
      const x = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, p.x));
      const y = Math.max(hh / 2 + 56, Math.min(H - hh / 2 - 6, p.y));
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    });
    ui.betEls.forEach((el, i) => { const p = L.bets[i]; if (p) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; } });
    const pot = $('#potlabel'); if (pot && L.pot) { pot.style.left = L.pot.x + 'px'; pot.style.top = L.pot.y + 'px'; }
    const bi = $('#boardinfo'); if (bi && L.board) { bi.style.left = L.board.x + 'px'; bi.style.top = Math.min(L.board.y, H - 110) + 'px'; }
  }

  // ---------------- dock ----------------
  function renderDock() {
    const box = $('#dockin');
    const T = ui.T, me = mySeat();
    // On your turn, leave the controls alone unless something that matters changed,
    // so a chat message or a timer update never interrupts you dragging the slider or typing an amount.
    if (T && me >= 0 && T.hp === 'bet' && T.ta === me) {
      const now = Date.now();
      const key = ['turn', T.id, T.hn, T.tn, (T.la || []).join(','), ui.sending, !!(ui.foldArm && now - ui.foldArm < 2500), !!(ui.allinArm && now - ui.allinArm < 2500), T.tbu, client.myCardsHand, SET.showBB, T.hp].join('|');
      if (key === ui.dockKey && box.querySelector('#actions')) return;
      ui.dockKey = key;
    } else ui.dockKey = null;
    box.textContent = '';
    $('#dock').classList.remove('myturn');
    if (!T) {
      if (ui.mode) box.append(h('div', { class: 'status', style: { textAlign: 'left' } }, ui.connecting || client.mode === 'starting' ? 'Connecting…' : 'Waiting for the table…'), h('div'));
      return;
    }
    const e = me >= 0 ? T.S[me] : null;
    const left = h('div', { id: 'myhand' });
    const right = h('div', { id: 'actions' });
    box.append(left, right);
    if (!e) return dockSpectator(left, right, T);
    const f = e[5];
    const cards = client.myCards && client.myCardsHand === T.hn ? client.myCards : null;
    if (cards && cards.length && (f & F.IN) && T.hp !== 'shuffle') {
      const discarding = T.hp === 'discard' && (T.dc || []).includes(me);
      left.append(h('div', { class: 'minicards n' + cards.length }, cards.map((c, idx) => {
        const el = miniCard(c, discarding ? 'pick' : '');
        if (discarding) { el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', 'Discard ' + cardName(c)); el.onclick = () => client.req('discard', idx); el.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') client.req('discard', idx); }; }
        return el;
      })));
      const hn = myHandName();
      const sub = (f & F.FOLD) ? 'Folded' : T.eq && T.eq[me] != null ? T.eq[me] + '% to win' : fmt(e[3]) + ' behind';
      left.append(h('div', { class: 'handname' }, h('b', null, hn || ' '), h('span', null, sub)));
    } else {
      left.append(h('div', { class: 'handname' }, h('b', null, e[1]), h('span', { class: 'num' }, fmt(e[3]) + ' chips')));
    }
    // what's happening
    if (T.hp === 'discard' && (T.dc || []).includes(me)) {
      right.append(h('div', { class: 'status' }, 'Pick one card to throw away. Keys 1, 2 or 3.'));
      return;
    }
    if (T.hp === 'rit' && (f & F.IN) && !(f & F.FOLD)) {
      const voted = (T.rv2 || []).includes(me);
      if (!voted && T.c.rt === 'ask') {
        right.append(h('div', { class: 'status' }, 'Run it twice?'), h('button', { class: 'act call', onclick: () => client.req('rit', true) }, 'Yes', h('small', null, 'Y')), h('button', { class: 'act fold', onclick: () => client.req('rit', false) }, 'Once', h('small', null, 'N')));
      } else right.append(h('div', { class: 'status' }, 'Waiting for the others to decide'));
      return;
    }
    if (T.hp === 'bet' && T.ta === me) return dockMyTurn(left, right, T);
    if (inHandLive(T) && (f & F.IN) && !(f & F.FOLD) && !(f & F.ALLIN)) return dockPre(right, T);
    if (T.hp === 'done' || T.ph === 'next') return dockBetween(right, T, e, f);
    // seated, waiting
    const bits = [];
    if (f & F.OUT) bits.push(h('button', { class: 'btn primary', onclick: () => client.req('sitout', false) }, "I'm back"));
    if ((f & F.BUST) && T.c.m === 'cash') bits.push(rebuyBtn(T, e));
    if (T.c.m === 'sng' && client.host && !(T.lvl && T.lvl[5]) && T.ph !== 'over') bits.push(h('button', { class: 'btn primary', onclick: () => client.host.startTournament() }, 'Start tournament'));
    const status = (f & F.BUST) && e[3] <= 0 ? (T.c.m === 'cash' ? 'Out of chips. Rebuy to keep playing.' : 'You are out of the tournament.') : (f & F.OUT) ? 'Sitting out' : T.ph === 'wait' ? (T.S.filter(Boolean).length < 2 ? 'Waiting for another player' : 'Starting soon') : (f & F.IN) && (f & F.FOLD) ? 'You folded. Waiting for the hand to finish.' : (f & F.ALLIN) ? 'You are all in.' : T.hp === 'shuffle' ? 'Shuffling' : 'You will be dealt in next hand';
    right.append(h('div', { class: 'status' }, status), ...bits);
    if ((f & F.IN) && (f & F.FOLD) && T.hp !== 'done') right.append(sitOutToggle(f));
  }

  function rebuyBtn(T, e) {
    const amt = Math.max(0, T.c.mx - e[3]);
    return h('button', { class: 'btn primary', onclick: () => client.req('rebuy', Math.min(T.c.bi, amt) || amt) }, 'Rebuy ' + fmt(Math.min(T.c.bi, amt) || amt));
  }
  function sitOutToggle(f) {
    const on = !!(f & F.OUT);
    return h('button', { class: 'btn small ghost', onclick: () => client.req('sitout', !on), title: 'Shortcut: O' }, on ? "I'm back" : 'Sit out next hand');
  }

  function dockSpectator(left, right, T) {
    const sngLocked = T.c.m === 'sng' && T.lvl && T.lvl[5];
    const free = T.S.findIndex((s) => !s);
    const name = h('input', { class: 'input', id: 'dock-name', value: client.nick, maxlength: 16, 'aria-label': 'Your name', style: { width: '160px' }, onchange: (ev) => client.setNick(ev.target.value) });
    left.append(h('div', { class: 'handname' }, h('b', null, 'Watching'), h('span', null, sngLocked ? 'Tournament in progress' : free < 0 ? 'The table is full' : 'Tap Sit on any open seat')));
    if (sngLocked || free < 0) { right.append(name); return; }
    const buy = T.c.m === 'cash' ? h('input', { class: 'input num', id: 'buyin', type: 'number', min: T.c.mn, max: T.c.mx, step: T.c.bb, value: T.c.bi, 'aria-label': 'Buy-in amount', style: { width: '120px' } }) : null;
    right.append(name, buy, h('button', { class: 'btn primary', id: 'takeseat', onclick: () => { client.setNick(name.value); takeSeat(free); } }, 'Take a seat ', h('kbd', null, 'J')));
  }

  function dockPre(right, T) {
    const me = mySeat();
    const toCall = Math.max(0, Math.max(...T.S.map((s) => (s ? s[4] : 0))) - T.S[me][4]);
    const opt = (val, label) => {
      const id = 'pre-' + val;
      const inp = h('input', { type: 'checkbox', id, checked: ui.pre === val, onchange: (ev) => { ui.pre = ev.target.checked ? val : null; ui.preAmt = toCall; renderDock(); } });
      return h('label', { for: id }, inp, label);
    };
    const who = T.ta >= 0 ? seatName(T.ta) : '';
    right.append(h('div', { class: 'pre' },
      opt('checkfold', 'Check/Fold'),
      toCall === 0 ? opt('check', 'Check') : opt('call', 'Call ' + fmt(toCall)),
      opt('callany', 'Call any')),
    h('div', { class: 'status' }, who ? 'Waiting for ' + who : ''));
  }

  function dockBetween(right, T, e, f) {
    const me = mySeat();
    const bits = [];
    const shown = T.sh && T.sh[me];
    if ((f & F.IN) && !shown && client.myCards && T.hp === 'done') bits.push(h('button', { class: 'btn', onclick: () => client.req('show', T.hn) }, 'Show cards ', h('kbd', null, 'S')));
    if (T.rb && !(T.rab && T.rab[0] === T.hn)) bits.push(h('button', { class: 'btn ghost', onclick: () => client.req('rabbit', T.hn), title: 'See what the board would have been' }, 'Rabbit hunt ', h('kbd', null, 'E')));
    if (T.rab && T.rab[0] === T.hn) bits.push(h('div', { class: 'cardrow', 'aria-label': 'Rabbit cards' }, h('span', { class: 'note' }, 'Would have come: '), T.rab[1].map((c) => miniCard(c))));
    if ((f & F.BUST) && T.c.m === 'cash') bits.push(rebuyBtn(T, e));
    else if (T.c.m === 'cash' && e[3] < T.c.mx) bits.push(h('button', { class: 'btn small ghost', onclick: () => client.req('rebuy', T.c.mx - e[3]) }, 'Top up'));
    bits.push(sitOutToggle(f));
    right.append(...bits, h('div', { class: 'status' }, T.ph === 'next' ? h('span', null, 'Next hand in ', h('span', { class: 'countdown', id: 'nextcd' }, '')) : ''));
  }

  // Bet sizes the way good poker rooms offer them: multiples of the bet before the flop, pot fractions after.
  function betPresets(T, la) {
    const [toCall, , , , minTo, maxTo, , allTo] = la;
    const bets = T.S.map((s) => (s ? s[4] : 0));
    const curBet = Math.max(0, ...bets);
    const potNow = (T.pot || 0) + bets.reduce((a, b) => a + b, 0);
    const potAfter = potNow + toCall;
    const bb = (T.bl && T.bl[1]) || T.c.bb;
    const pre = !(T.bd && T.bd[0] && T.bd[0].length);
    const out = [];
    if (pre) {
      const base = Math.max(curBet, bb);
      out.push(['2.5x', base * 2.5], ['3x', base * 3], ['4x', base * 4]);
    } else out.push(['⅓ pot', curBet + potAfter / 3], ['½ pot', curBet + potAfter / 2], ['¾ pot', curBet + potAfter * 0.75]);
    out.push(['Pot', curBet + potAfter]);
    out.push([maxTo < allTo ? 'Max' : 'All-in', maxTo]);
    // drop sizes that are not legal or that repeat
    const seen = new Set();
    return out.map(([l, v]) => [l, clampRaise(Math.round(v / (bb >= 2 ? 1 : 1)), la)]).filter(([l, v]) => { if (seen.has(v) && !/All|Max/.test(l)) return false; seen.add(v); return v >= minTo; });
  }

  function dockMyTurn(left, right, T) {
    const la = T.la || [0, 0, 1, 0, 0, 0, 0, 0];
    const [toCall, call, canCheck, canRaise, minTo, maxTo, isBet, allTo] = la;
    if (ui.sending) { right.append(h('div', { class: 'status' }, 'Sending…')); return; }
    $('#dock').classList.add('myturn');
    const fl = (T.l || T.c.l) === 'fl';
    const stack = T.S[mySeat()][3];
    const foldArmed = ui.foldArm && Date.now() - ui.foldArm < 2500;
    const fold = h('button', { class: 'act fold' + (foldArmed ? ' armed' : ''), id: 'act-fold', onclick: () => sendAct('fold') }, foldArmed ? 'Fold anyway?' : 'Fold', h('small', null, 'F'));
    const ccLabel = canCheck ? 'Check' : call >= stack ? 'Call all-in ' + fmt(call) : 'Call ' + fmt(call);
    const cc = h('button', { class: 'act call', id: 'act-call', onclick: () => sendAct(canCheck ? 'check' : 'call') }, ccLabel, h('small', null, 'C'));
    const acts = h('div', { class: 'actrow' }, fold, cc);
    const panel = canRaise && !fl && minTo !== maxTo;
    if (canRaise) {
      if (!ui.raiseTo || ui.raiseTo < minTo || ui.raiseTo > maxTo) ui.raiseTo = defaultRaise(la);
      const isAll = ui.raiseTo >= allTo;
      const verb = isBet ? 'Bet' : 'Raise to';
      const allArmed = ui.allinArm && Date.now() - ui.allinArm < 2500;
      const rb = h('button', { class: 'act ' + (isAll ? 'allin' : 'raise') + (allArmed && isAll ? ' armed' : ''), id: 'act-raise', onclick: () => sendAct(ui.raiseTo >= allTo ? 'allin' : isBet ? 'bet' : 'raise', ui.raiseTo) },
        h('span', { class: 'lbl' }, allArmed && isAll ? 'Confirm all-in' : (isAll ? 'All-in ' : verb + ' ') + fmt(ui.raiseTo)), h('small', null, panel ? 'R · Enter' : 'R'));
      acts.append(rb);
    }
    if (panel) {
      const bb = (T.bl && T.bl[1]) || T.c.bb;
      const pbox = h('div', { class: 'presets', role: 'group', 'aria-label': 'Bet sizes' }, betPresets(T, la).map(([lbl, v], i) =>
        h('button', { type: 'button', 'data-v': v, 'aria-pressed': v === ui.raiseTo ? 'true' : 'false', title: 'Key ' + (i + 1), onclick: () => { ui.raiseTo = v; syncRaise(); } }, lbl, h('span', { class: 'pv num' }, fmtN(v)))));
      const step = Math.max(1, bb);
      const range = h('input', { type: 'range', id: 'raise-range', min: minTo, max: maxTo, step: 1, value: ui.raiseTo, 'aria-label': 'Bet amount', oninput: (ev) => { ui.raiseTo = clampRaise(snap(+ev.target.value, step, minTo, maxTo)); syncRaise(); } });
      const num = h('input', { class: 'input num', id: 'raise-num', type: 'number', inputmode: 'numeric', min: minTo, max: maxTo, step, value: ui.raiseTo, 'aria-label': 'Bet amount',
        oninput: (ev) => { const v = +ev.target.value; if (v >= minTo && v <= maxTo) { ui.raiseTo = Math.round(v); syncRaise(true); } },
        onchange: (ev) => { ui.raiseTo = clampRaise(+ev.target.value); syncRaise(); },
        onkeydown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ui.raiseTo = clampRaise(+ev.target.value); sendAct(ui.raiseTo >= allTo ? 'allin' : isBet ? 'bet' : 'raise', ui.raiseTo); } } });
      const minus = h('button', { type: 'button', class: 'stepbtn', 'aria-label': 'Less', onclick: () => { ui.raiseTo = clampRaise(ui.raiseTo - step); syncRaise(); } }, '−');
      const plus = h('button', { type: 'button', class: 'stepbtn', 'aria-label': 'More', onclick: () => { ui.raiseTo = clampRaise(ui.raiseTo + step); syncRaise(); } }, '+');
      const inbb = h('span', { class: 'inbb num', id: 'raise-bb' }, bbText(ui.raiseTo, bb));
      right.append(h('div', { class: 'betpanel' }, pbox, h('div', { class: 'slide' }, minus, range, plus, h('div', { class: 'amt' }, num, inbb))));
    }
    right.append(acts);
    // time left for me, right in the dock
    if (T.dl) { const tb = h('div', { class: 'docktimer' + (T.tbu ? ' bank' : '') }, h('i')); right.append(tb); startTimer(tb, T); }
  }
  const bbText = (v, bb) => (bb ? (Math.round((v / bb) * 10) / 10) + ' BB' : '');
  const snap = (v, step, lo, hi) => (v >= hi ? hi : v <= lo ? lo : Math.round(v / step) * step);
  function syncRaise(fromTyping) {
    const T = ui.T, la = T.la;
    const r = $('#raise-range'), n = $('#raise-num'), b = $('#act-raise');
    if (r) r.value = ui.raiseTo; if (n && !fromTyping) n.value = ui.raiseTo;
    const bbx = $('#raise-bb'); if (bbx) bbx.textContent = bbText(ui.raiseTo, (T.bl && T.bl[1]) || T.c.bb);
    if (b) { const isAll = ui.raiseTo >= la[7]; b.className = 'act ' + (isAll ? 'allin' : 'raise'); b.querySelector('.lbl').textContent = (isAll ? 'All-in ' : la[6] ? 'Bet ' : 'Raise to ') + fmt(ui.raiseTo); }
    document.querySelectorAll('.presets button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.v === ui.raiseTo)));
  }
  function focusSlider() { setTimeout(() => { const r = $('#raise-num'); if (r) { r.focus(); r.select(); } }, 20); }

  // ---------------- keyboard ----------------
  function bindKeys() {
    document.addEventListener('keydown', (ev) => {
      const tg = ev.target;
      const typing = tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable) && !(tg.id === 'raise-num' || tg.id === 'raise-range' || tg.type === 'checkbox');
      if (ev.key === 'Escape') {
        if (ui.sheet) { PK.panels.close(); ev.preventDefault(); return; }
        if (ui.raiseOpen) { ui.raiseOpen = false; renderDock(); ev.preventDefault(); return; }
        if (ui.drawer) { toggleDrawer(false); ev.preventDefault(); return; }
      }
      if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ui.sheet && ev.key !== '?') return;
      const T = ui.T, me = mySeat();
      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      const myTurn = T && T.hp === 'bet' && T.ta === me && me >= 0;
      const la = T && T.la;
      const handled = () => ev.preventDefault();
      if (tg && tg.id === 'raise-num' && /^[0-9]$/.test(k)) return;
      if (myTurn && la) {
        if (k === 'f') { handled(); return sendAct('fold'); }
        if (k === 'c' || k === ' ' || k === 'k') { handled(); return sendAct(la[2] ? 'check' : 'call'); }
        const sendRaise = () => sendAct(ui.raiseTo >= la[7] ? 'allin' : la[6] ? 'bet' : 'raise', ui.raiseTo);
        if ((k === 'r' || k === 'b') && la[3]) {
          handled();
          const n = $('#raise-num');
          if (n && document.activeElement !== n) { n.focus(); n.select(); say('Bet amount ' + ui.raiseTo + '. Type an amount, then Enter.'); } else sendRaise();
          return;
        }
        if (k === 'a' && la[3]) { handled(); return sendAct('allin'); }
        if (k === 'Enter' && la[3] && $('#raise-num')) { handled(); return sendRaise(); }
        if (/^[1-5]$/.test(k) && la[3]) {
          handled();
          const btns = document.querySelectorAll('.presets button');
          if (btns[+k - 1]) btns[+k - 1].click();
          return;
        }
        if ((k === 'ArrowUp' || k === 'ArrowDown') && la[3]) {
          handled();
          const step = ((T.bl && T.bl[1]) || T.c.bb) * (ev.shiftKey ? 5 : 1);
          ui.raiseTo = clampRaise(ui.raiseTo + (k === 'ArrowUp' ? step : -step));
          syncRaise(); return;
        }
      } else if (T && inHandLive(T) && me >= 0) {
        if (k === 'f') { handled(); ui.pre = ui.pre === 'checkfold' ? null : 'checkfold'; renderDock(); say(ui.pre ? 'Check or fold when it is your turn' : 'Pre-action cleared'); return; }
        if (k === 'c') { handled(); ui.pre = ui.pre === 'callany' ? null : 'callany'; renderDock(); say(ui.pre ? 'Will call any bet' : 'Pre-action cleared'); return; }
      }
      if (T && T.hp === 'discard' && /^[1-3]$/.test(k) && (T.dc || []).includes(me)) { handled(); client.req('discard', +k - 1); return; }
      if (T && (k === 'y' || k === 'n')) {
        if (T.hp === 'rit' && me >= 0) { handled(); client.req('rit', k === 'y'); return; }
        if (T.vt && me >= 0) { handled(); client.req('vote', { id: T.vt[0], yes: k === 'y' }); return; }
      }
      switch (k) {
        case 't': case '/': handled(); toggleDrawer(true, 'chat'); return;
        case 'l': handled(); toggleDrawer(true, 'log'); return;
        case 'h': handled(); if (ev.shiftKey && client.host) PK.panels.open('host'); else PK.panels.open('history'); return;
        case 'g': handled(); PK.panels.open('rules'); return;
        case '?': handled(); if (ui.sheet === 'shortcuts') PK.panels.close(); else PK.panels.open('shortcuts'); return;
        case ',': handled(); PK.panels.open('settings'); return;
        case 'v': handled(); cycleView(); return;
        case 'm': handled(); SET.muted = !SET.muted; PK.applySettings(); toast(SET.muted ? 'Sound off' : 'Sound on', { ms: 1500 }); return;
        case 'i': handled(); readTable(); return;
        case 's': if (T && me >= 0 && T.hp === 'done') { handled(); client.req('show', T.hn); } return;
        case 'e': if (T && T.rb) { handled(); client.req('rabbit', T.hn); } return;
        case 'o': if (T && me >= 0) { handled(); const out = !!(T.S[me][5] & F.OUT); client.req('sitout', !out); toast(out ? 'Back in next hand' : 'Sitting out from next hand', { ms: 2000 }); } return;
        case 'j': if (T && me < 0) { handled(); const free = T.S.findIndex((s) => !s); if (free >= 0) takeSeat(free); } return;
        case 'p': if (client.host) { handled(); client.host.setPaused(!client.host.paused); } return;
      }
    });
  }

  function readTable() {
    const T = ui.T;
    if (!T) return say('No table yet.');
    const parts = [];
    const V = variant();
    parts.push(V.name + ', hand ' + T.hn + '.');
    if (T.bd && T.bd[0] && T.bd[0].length) parts.push('Board: ' + T.bd.map((b) => b.map(cardName).join(', ')).join('; second board: ') + '.');
    else parts.push('No board yet.');
    parts.push('Pot ' + fmt(T.pot || 0) + '.');
    if (client.myCards && client.myCardsHand === T.hn) parts.push('Your cards: ' + client.myCards.map(cardName).join(', ') + '. ' + myHandName() + '.');
    T.S.forEach((s, i) => { if (s) parts.push(s[1] + (i === mySeat() ? ' (you)' : '') + ': ' + fmt(s[3]) + (s[4] ? ', bet ' + fmt(s[4]) : '') + (s[5] & F.FOLD ? ', folded' : '') + (s[5] & F.ALLIN ? ', all in' : '') + (T.hp === 'bet' && T.ta === i ? ', to act' : '') + '.'); });
    say(parts.join(' '));
  }

  PK.render = { all: renderAll, dock: renderDock, seats: renderSeats, topbar: renderTopbar };
  PK.boot = boot;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
  }
})(window.PK = window.PK || {});

/* Sheets: table setup, personal settings, rules & disputes, hand history + audits, ledger, host tools, shortcuts. */
(function (PK) {
  'use strict';
  const { h, icon } = PK;
  const $ = (s, r) => (r || document).querySelector(s);
  const F = PK.F;
  const ui = PK.ui, client = PK.client, SET = PK.SET;
  const fmt = (n) => PK.fmt(n);
  let lastFocus = null;
  let tabRules = 'hand';
  let histDetail = null, replayStep = -1;

  const panels = {
    open(name, refresh, arg) {
      if (refresh && ui.sheet !== name) return;
      if (!refresh) lastFocus = document.activeElement;
      if (name === 'rules' && arg) tabRules = arg;
      ui.sheet = name;
      const sheet = $('#sheet'), body = $('#sheet-body'), foot = $('#sheet-foot');
      const scroll = refresh ? body.scrollTop : 0;
      body.textContent = ''; foot.textContent = '';
      const titles = { menu: 'Menu', invite: 'Invite friends', setup: 'Table setup', settings: 'Settings', rules: 'Rules & disputes', history: 'Hand history', ledger: 'Ledger & stats', host: 'Host tools', shortcuts: 'Keyboard shortcuts' };
      $('#sheet-title').textContent = titles[name] || '';
      (BUILD[name] || (() => {}))(body, foot, arg);
      sheet.hidden = false;
      void sheet.offsetWidth; // start the transition from the closed state without waiting a frame
      sheet.classList.add('open'); $('#scrim').classList.add('open');
      body.scrollTop = scroll;
      if (!refresh) setTimeout(() => { const f = body.querySelector('input, button, select, [tabindex="0"]'); (f || $('#sheet-close')).focus({ preventScroll: true }); }, 40);
    },
    close() {
      ui.sheet = null;
      const sheet = $('#sheet');
      sheet.classList.remove('open'); $('#scrim').classList.remove('open');
      setTimeout(() => { if (!ui.sheet) sheet.hidden = true; }, 220);
      histDetail = null;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    },
  };
  PK.panels = panels;
  // keep Tab inside the open sheet
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !ui.sheet) return;
    const f = [...$('#sheet').querySelectorAll('button, input, select, textarea, [tabindex="0"], summary')].filter((x) => !x.disabled && x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });

  // ---------- menu ----------
  function buildMenu(body) {
    const T = ui.T, me = client.mySeat && client.mySeat();
    const row = (ic, label, sub, fn) => h('button', { class: 'menurow', type: 'button', onclick: fn }, h('span', { class: 'mi', html: icon(ic) }), h('span', null, h('b', null, label), sub ? h('small', null, sub) : null));
    const list = h('div', { class: 'menulist' });
    if (ui.mode === 'online' && ui.code) list.append(row('invite', 'Invite friends', 'Link and QR code', () => panels.open('invite')));
    if (T) {
      list.append(row('scale', 'Rules & disputes', 'Who won and why, hand rankings, shuffle audits', () => panels.open('rules')));
      list.append(row('history', 'Hand history', 'Replay any hand', () => panels.open('history')));
      list.append(row('ledger', 'Ledger & stats', 'Buy-ins, who is up, VPIP', () => panels.open('ledger')));
    }
    if (client.host) list.append(row('crown', 'Host tools', 'Add bots, pause, stacks, table rules', () => panels.open('host')));
    list.append(row('sliders', 'Settings', 'Name, felt, deck colours, sound, accessibility', () => panels.open('settings')));
    list.append(row('cube', 'Camera: ' + ({ player: 'player view', top: 'overhead', low: 'cinematic' }[SET.view] || 'player view'), 'Tap to switch (V)', () => { const o = ['player', 'top', 'low']; SET.view = o[(o.indexOf(SET.view) + 1) % 3]; PK.applySettings('view'); panels.open('menu', true); }));
    list.append(row(SET.muted ? 'mute' : 'sound', SET.muted ? 'Sound is off' : 'Sound is on', 'Tap to switch (M)', () => { SET.muted = !SET.muted; PK.applySettings(); panels.open('menu', true); }));
    list.append(row('key', 'Keyboard shortcuts', 'F fold, C call, R raise, A all-in', () => panels.open('shortcuts')));
    if (T && me >= 0) list.append(row('user', 'Leave my seat', 'Your chips are recorded in the ledger', () => { client.req('leave'); panels.close(); }));
    list.append(row('play', 'New table', 'Start somewhere else', () => { location.hash = ''; location.reload(); }));
    body.append(list);
  }

  // ---------- invite ----------
  function buildInvite(body) {
    const url = PK.inviteUrl();
    const inp = h('input', { class: 'input big num', id: 'invite-url', value: url, readonly: true, 'aria-label': 'Invite link', onfocus: (e) => e.target.select() });
    const copy = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy link'; }, 1600); }
      catch (e) { inp.focus(); inp.select(); copy.textContent = 'Press Ctrl+C'; }
    } }, 'Copy link');
    const actions = h('div', { class: 'row' }, copy);
    if (navigator.share) actions.append(h('button', { class: 'btn', type: 'button', onclick: () => navigator.share({ title: 'Back Room Poker', text: 'Come play poker', url }).catch(() => {}) }, 'Share…'));
    body.append(h('div', { class: 'stack' }, h('p', { style: { margin: 0 } }, 'Send this link to your friends. They open it, type a name and tap ', h('b', null, 'Sit down'), '. Nothing to install, no accounts.'), inp, actions));
    if (window.qrcode) {
      try {
        const q = window.qrcode(0, 'M'); q.addData(url); q.make();
        body.append(h('div', { class: 'qr', html: q.createSvgTag({ cellSize: 6, margin: 3, scalable: true }), 'aria-label': 'QR code for the invite link', role: 'img' }), h('p', { class: 'note center' }, 'Friends in the room can scan this with their phone camera.'));
      } catch (e) {}
    }
    body.append(h('div', { class: 'callout' }, 'Keep this page open while you play: the person who started the table deals the cards. If their page closes, another player takes over within about 15 seconds and the unfinished hand is cancelled.'));
    body.append(h('p', { class: 'note' }, 'Only people with this link can see the table. Everything is encrypted with the code at the end of the link before it leaves your device.'));
  }

  // ---------- small builders ----------
  const group = (title, ...kids) => h('section', { class: 'group' }, h('h3', null, title), ...kids);
  const field = (label, input) => h('label', { class: 'field' }, h('span', null, label), input);
  const num = (id, val, opts) => h('input', Object.assign({ class: 'input num', id, type: 'number', value: val, min: 0 }, opts || {}));
  function seg(id, options, value, onPick, label) {
    const box = h('div', { class: 'seg', role: 'group', 'aria-label': label || id, id });
    for (const [v, l] of options) box.append(h('button', { type: 'button', 'aria-pressed': String(v) === String(value), onclick: () => { box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false')); box.querySelector(`[data-v="${v}"]`).setAttribute('aria-pressed', 'true'); onPick(v); }, 'data-v': v }, l));
    return box;
  }
  function sw(id, label, checked, onChange, hint) {
    return h('label', { class: 'switch', for: id }, h('span', null, label, hint ? h('small', null, hint) : null), h('input', { type: 'checkbox', id, role: 'switch', checked: !!checked, onchange: (e) => onChange(e.target.checked) }));
  }

  // ---------- setup ----------
  const PRESETS = [
    ['Classic Hold’em', { game: 'nlhe', lim: '', sb: 10, bb: 20, stack: 2000, mode: 'cash' }],
    ['PLO 25/50', { game: 'plo', lim: 'pl', sb: 25, bb: 50, stack: 5000, mode: 'cash' }],
    ['Turbo Sit & Go', { game: 'nlhe', lim: '', sb: 10, bb: 20, stack: 1500, mode: 'sng', lvlMin: 4 }],
    ['Chaos night', { game: 'dealers', gl: ['nlhe', 'plo', 'short', 'pine'], sb: 10, bb: 20, stack: 2000, straddle: true, bombEvery: 6, bombAmt: 40, bounty72: 40, rit: 'always' }],
  ];
  function buildSetup(body, foot, arg) {
    const editing = arg === 'edit' && client.host;
    const cfg = Object.assign({}, PK.DEFAULTS, editing ? client.host.cfg : {});
    const draw = () => panels.open('setup', true, arg);
    const set = (k, v) => { cfg[k] = v; };
    body.append(group('Quick presets', h('div', { class: 'row' }, PRESETS.map(([n, p]) => h('button', { class: 'btn small', type: 'button', onclick: () => { Object.assign(cfg, PK.DEFAULTS, editing ? {} : {}, p); fill(); } }, n)))));
    const holder = h('div', { class: 'stack' });
    body.append(holder);
    function fill() {
      holder.textContent = '';
      holder.append(group('Table', field('Table name', h('input', { class: 'input', id: 'cfg-name', value: cfg.name, maxlength: 28, oninput: (e) => set('name', e.target.value) })),
        field('Format', seg('cfg-mode', [['cash', 'Cash game'], ['sng', 'Sit & Go tournament']], cfg.mode, (v) => { set('mode', v); fill(); }, 'Format'))));
      const games = h('div', { class: 'games', role: 'group', 'aria-label': 'Game' });
      for (const [id, V] of Object.entries(PK.VARIANTS)) games.append(h('button', { type: 'button', class: 'gamecard', 'aria-pressed': cfg.game === id, onclick: () => { set('game', id); fill(); } }, h('b', null, V.name), h('span', null, V.hole + ' cards · ' + PK.LIMIT_NAME[V.lim] + (V.hilo ? ' · split pot' : V.deck === 'short' ? ' · 36-card deck' : V.discard ? ' · discard one' : ''))));
      games.append(h('button', { type: 'button', class: 'gamecard', 'aria-pressed': cfg.game === 'dealers', onclick: () => { set('game', 'dealers'); fill(); } }, h('b', null, 'Dealer’s choice'), h('span', null, 'Rotates games every orbit')));
      const gsec = group('Game', games, field('Betting', seg('cfg-lim', [['', 'Game default'], ['nl', 'No-limit'], ['pl', 'Pot-limit'], ['fl', 'Limit']], cfg.lim, (v) => set('lim', v), 'Betting')));
      if (cfg.game === 'dealers') {
        const rot = h('div', { class: 'row' });
        for (const [id, V] of Object.entries(PK.VARIANTS)) rot.append(h('label', { class: 'switch', style: { minHeight: '34px' } }, h('input', { type: 'checkbox', checked: cfg.gl.includes(id), onchange: (e) => { cfg.gl = e.target.checked ? [...new Set([...cfg.gl, id])] : cfg.gl.filter((x) => x !== id); } }), h('span', null, V.short)));
        gsec.append(field('Games in the rotation', rot));
      }
      holder.append(gsec);
      const stakes = h('div', { class: 'grid3' },
        field('Small blind', num('cfg-sb', cfg.sb, { min: 1, oninput: (e) => set('sb', +e.target.value) })),
        field('Big blind', num('cfg-bb', cfg.bb, { min: 2, oninput: (e) => set('bb', +e.target.value) })),
        field('Ante', num('cfg-ante', cfg.ante, { oninput: (e) => set('ante', +e.target.value) })),
        field(cfg.mode === 'sng' ? 'Starting chips' : 'Default buy-in', num('cfg-stack', cfg.stack, { min: 100, oninput: (e) => set('stack', +e.target.value) })));
      if (cfg.mode === 'cash') stakes.append(field('Minimum buy-in', num('cfg-min', cfg.minBuy, { oninput: (e) => set('minBuy', +e.target.value) })), field('Maximum buy-in', num('cfg-max', cfg.maxBuy, { oninput: (e) => set('maxBuy', +e.target.value) })));
      else stakes.append(field('Minutes per blind level', num('cfg-lvl', cfg.lvlMin, { min: 1, max: 60, oninput: (e) => set('lvlMin', +e.target.value) })));
      stakes.append(field('Seats', num('cfg-seats', cfg.seats, { min: 2, max: 9, oninput: (e) => set('seats', +e.target.value) })));
      holder.append(group('Stakes', stakes, sw('cfg-bbante', 'Big blind ante', cfg.bbAnte, (v) => set('bbAnte', v), 'The big blind pays everyone’s ante (ante × players).')));
      holder.append(group('House rules',
        sw('cfg-straddle', 'Straddle', cfg.straddle, (v) => set('straddle', v), 'Player left of the big blind posts 2× and acts last preflop (4+ players).'),
        field('Run it twice', seg('cfg-rit', [['off', 'Off'], ['ask', 'Players agree'], ['always', 'Always']], cfg.rit, (v) => set('rit', v), 'Run it twice')),
        sw('cfg-double', 'Double board', cfg.double, (v) => set('double', v), 'Two boards every hand; each board wins half the pot.'),
        h('div', { class: 'grid2' }, field('Bomb pot every N hands (0 = off)', num('cfg-bomb', cfg.bombEvery, { max: 50, oninput: (e) => set('bombEvery', +e.target.value) })), field('Bomb pot amount', num('cfg-bombamt', cfg.bombAmt, { min: 1, oninput: (e) => set('bombAmt', +e.target.value) }))),
        field('7-2 bounty (0 = off)', num('cfg-72', cfg.bounty72, { oninput: (e) => set('bounty72', +e.target.value) })),
        sw('cfg-rabbit', 'Rabbit hunting', cfg.rabbit, (v) => set('rabbit', v), 'Peek at the cards that would have come after a hand ends early.'),
        sw('cfg-reveal', 'Publish the shuffle proof after every hand', cfg.autoReveal, (v) => set('autoReveal', v), 'Lets anyone verify every deal, but reveals folded cards once the hand is over.')));
      holder.append(group('Clock',
        field('Time to act', seg('cfg-timer', [[15, '15s'], [30, '30s'], [45, '45s'], [60, '60s'], [0, 'No limit']], cfg.timer, (v) => set('timer', +v), 'Time to act')),
        field('Time bank per player (seconds)', num('cfg-tb', cfg.timeBank, { max: 600, oninput: (e) => set('timeBank', +e.target.value) }))));
      if (!editing) holder.append(group('Players', field('Bots to add now', num('cfg-bots', cfg._bots || 0, { min: 0, max: 8, oninput: (e) => set('_bots', +e.target.value) }))));
    }
    fill();
    void draw;
    if (editing) foot.append(h('button', { class: 'btn', onclick: () => panels.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { client.host.updateCfg(cfg); PK.toast('Saved. Changes start with the next hand.'); panels.close(); } }, 'Save changes'));
    else foot.append(h('button', { class: 'btn', onclick: () => panels.close() }, 'Cancel'), h('button', { class: 'btn primary', id: 'create-table', onclick: () => { const bots = cfg._bots | 0; delete cfg._bots; panels.close(); PK.startTable(cfg, bots); } }, 'Create table'));
  }

  // ---------- settings ----------
  function buildSettings(body) {
    const apply = (k, v) => { SET[k] = v; PK.applySettings(k); };
    const sw2 = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Your colour' });
    for (let c = 0; c < 12; c++) sw2.append(h('button', { class: 'swatch', type: 'button', style: { background: PK.colorOf(c) }, 'aria-label': 'Colour ' + (c + 1), 'aria-pressed': client.color === c, onclick: () => { client.setNick(client.nick, c); panels.open('settings', true); } }));
    body.append(group('You', field('Name at the table', h('input', { class: 'input', id: 'set-name', value: client.nick, maxlength: 16, onchange: (e) => client.setNick(e.target.value) })), sw2));
    const felts = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Felt colour' });
    for (const [k, v] of Object.entries(PK.FELTS)) felts.append(h('button', { class: 'swatch', type: 'button', style: { background: v.felt }, 'aria-label': k + ' felt', 'aria-pressed': SET.felt === k, onclick: () => { apply('felt', k); panels.open('settings', true); } }));
    body.append(group('Table look', field('Felt', felts),
      field('Card back', seg('set-back', [['brass', 'Felt'], ['crimson', 'Crimson'], ['navy', 'Navy'], ['black', 'Black']], SET.back, (v) => apply('back', v), 'Card back')),
      sw('set-4c', 'Four-colour deck', SET.fourColor, (v) => apply('fourColor', v), 'Hearts red, diamonds blue, clubs green, spades black.'),
      sw('set-big', 'Large card indices', SET.bigCards, (v) => apply('bigCards', v), 'Bigger rank and suit, easier to read at a distance.'),
      field('Camera', seg('set-view', [['player', 'Player'], ['top', 'Overhead'], ['low', 'Cinematic']], SET.view, (v) => apply('view', v), 'Camera')),
      field('Graphics', seg('set-q', [['high', 'High'], ['low', 'Battery saver']], SET.quality, (v) => apply('quality', v), 'Graphics'))));
    body.append(group('Accessibility',
      field('Motion', seg('set-motion', [['auto', 'Match my device'], ['on', 'Reduce motion'], ['off', 'Full motion']], SET.motion, (v) => apply('motion', v), 'Motion')),
      sw('set-hc', 'High contrast', SET.contrast, (v) => apply('contrast', v)),
      field('Text size', seg('set-scale', [[1, '100%'], [1.15, '115%'], [1.3, '130%']], SET.scale, (v) => apply('scale', +v), 'Text size')),
      sw('set-hap', 'Vibrate on my turn', SET.haptics, (v) => apply('haptics', v), 'Phones only.'),
      h('p', { class: 'note' }, 'Screen readers hear every action as it happens. Press I at any time to hear the whole table read out, and ? for all shortcuts.')));
    body.append(group('Sound',
      field('Volume', h('input', { type: 'range', id: 'set-vol', min: 0, max: 1, step: 0.05, value: SET.volume, 'aria-label': 'Volume', oninput: (e) => apply('volume', +e.target.value) })),
      sw('set-mute', 'Mute', SET.muted, (v) => apply('muted', v))));
    const notif = 'Notification' in window ? h('button', { class: 'btn small', type: 'button', onclick: async () => { try { const r = await Notification.requestPermission(); PK.toast(r === 'granted' ? 'You will get a notification when it is your turn in a background tab.' : 'Notifications are blocked here.'); } catch (e) { PK.toast('Notifications are not available in this view.'); } } }, 'Notify me on my turn') : null;
    body.append(group('Play',
      sw('set-bb', 'Show amounts in big blinds', SET.showBB, (v) => apply('showBB', v)),
      field('Default raise size', seg('set-bet', [['min', 'Minimum'], ['half', '½ pot'], ['twothirds', '⅔ pot'], ['pot', 'Pot']], SET.betDefault, (v) => apply('betDefault', v), 'Default raise size')),
      sw('set-confirm', 'Confirm all-in', SET.confirmAllin, (v) => apply('confirmAllin', v), 'Press All-in (or A) twice so a slip never costs your stack.'),
      notif));
  }

  // ---------- rules & disputes ----------
  function buildRules(body) {
    body.append(seg('rules-tab', [['hand', 'Last hand'], ['rank', 'Hand rankings'], ['rules', 'Rules'], ['disputes', 'Disputes']], tabRules, (v) => { tabRules = v; panels.open('rules', true); }, 'Section'));
    if (tabRules === 'hand') return lastHand(body);
    if (tabRules === 'rank') return rankings(body);
    if (tabRules === 'rules') return rulesText(body);
    return disputes(body);
  }

  function resultBlock(T, res, hnm, sh, unc) {
    const out = h('div', { class: 'stack' });
    if (!res || !res.length) { out.append(h('p', { class: 'note' }, 'No finished hand yet.')); return out; }
    if (unc >= 0) { out.append(h('div', { class: 'callout' }, PK.seatName(unc) + ' won ' + fmt(res[0][4]) + ' because everyone else folded. No cards had to be shown.')); return out; }
    const nPots = Math.max(...res.map((r) => r[0])) + 1;
    const nB = Math.max(...res.map((r) => r[1])) + 1;
    for (const r of res) {
      const [pi, bi, lo, winners, amount, name, cards, why, runner] = r;
      const potName = nPots > 1 ? (pi === 0 ? 'Main pot' : 'Side pot ' + pi) : 'Pot';
      const boardName = bi >= 0 && nB > 1 ? (T && T.bd && T.bd.length > 1 && T.c.db ? (bi === 0 ? ', top board' : ', bottom board') : ', run ' + (bi + 1)) : '';
      const who = winners.map(PK.seatName).join(' and ');
      out.append(h('div', { class: 'group' },
        h('h3', null, potName + boardName + (lo ? ' · low half' : '') + ' · ' + fmt(amount)),
        h('div', null, h('b', null, who), winners.length > 1 ? ' split it with ' : ' wins with ', h('b', null, name)),
        cards ? h('div', { class: 'cardrow' }, PK.splitCards(cards).map((c) => PK.miniCard(c))) : null,
        why ? h('p', { class: 'note', style: { margin: 0 } }, runner >= 0 ? 'Against ' + PK.seatName(runner) + ': ' : '', why) : null));
    }
    if (hnm) {
      const rows = Object.entries(hnm).map(([s, names]) => h('tr', null, h('td', null, PK.seatName(+s)), h('td', null, h('div', { class: 'cardrow' }, PK.splitCards((sh || {})[s]).map((c) => PK.miniCard(c)))), h('td', null, names.join(' / '))));
      out.append(h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', null, 'Cards'), h('th', null, 'Best hand'))), h('tbody', null, rows))));
    }
    out.append(h('p', { class: 'note' }, 'Cards speak: the dealer device evaluates every hand with the same rules shown under Hand rankings. Odd chips go to the first winner clockwise from the button.'));
    return out;
  }
  function lastHand(body) {
    const T = ui.T;
    if (!T) return body.append(h('p', { class: 'note' }, 'No table yet.'));
    let res = T.res, hnm = T.hnm, sh = T.sh, unc = T.unc;
    if (!res) { const rec = [...ui.hist.values()].filter((r) => r.res).sort((a, b) => b.hn - a.hn)[0]; if (rec) { res = rec.res; hnm = rec.hnm; sh = rec.sh; unc = rec.unc; } }
    body.append(resultBlock(T, res, hnm, sh, unc));
  }

  function rankings(body) {
    const rows = [
      ['Royal flush', 'A K Q J 10, all one suit', 'AsKsQsJsTs'], ['Straight flush', 'Five in a row, one suit', '9h8h7h6h5h'], ['Four of a kind', 'Four cards of one rank', 'QcQdQhQs2d'],
      ['Full house', 'Three of a kind plus a pair', 'Js Jd Jc 4h 4s'.replace(/ /g, '')], ['Flush', 'Any five of one suit', 'AdJd8d6d3d'], ['Straight', 'Five in a row (A-2-3-4-5 counts)', 'Th9c8d7s6h'],
      ['Three of a kind', 'Three cards of one rank', '7c7d7hKs2d'], ['Two pair', 'Two different pairs', 'KhKd5c5s9h'], ['Pair', 'Two cards of one rank', 'AhAc9d6s3c'], ['High card', 'Nothing else: highest card plays', 'AsJd8c5h3s'],
    ];
    body.append(h('div', { class: 'ranks' }, rows.map(([n, d, c], i) => h('div', { class: 'rankrow' }, h('span', { class: 'n' }, i + 1), h('div', null, h('b', null, n), h('div', { class: 'note' }, d)), h('div', { class: 'cardrow ex' }, PK.splitCards(c).map((x) => PK.miniCard(x)))))));
    body.append(h('div', { class: 'callout' }, h('b', null, 'Short Deck changes two things: '), 'a flush beats a full house, and three of a kind beats a straight. Sixes through Aces only; A-6-7-8-9 is the lowest straight.'));
    body.append(h('div', { class: 'callout' }, h('b', null, 'Omaha: '), 'you must use exactly two of your hole cards and exactly three from the board. Four hearts on the board with one heart in your hand is not a flush. ', h('b', null, 'Hi-Lo: '), 'the low half goes to the best five unpaired cards eight or lower (A-2-3-4-5 is best); if nobody qualifies, the high hand scoops.'));
  }

  const RULES = [
    ['How a hand runs', ['Blinds are posted, then everyone gets their hole cards one at a time starting left of the button.', 'Betting goes clockwise. Preflop it starts left of the big blind (left of the straddle when there is one); after the flop it starts left of the button.', 'Heads-up, the button posts the small blind and acts first before the flop, last after it.', 'The button moves one seat left each hand to the next player who is dealt in (moving button).']],
    ['Betting limits', ['No-limit: bet anything from one big blind up to your whole stack.', 'Pot-limit: the biggest raise is to the current bet + the whole pot after you call. Example at 1/2: the first raise can go to 7.', 'Limit: fixed sizes, small bet = big blind before the turn, big bet = 2 big blinds on the turn and river. Four bets per round (bet plus three raises), unlimited heads-up.', 'Minimum raise: at least the size of the last full raise. A bet of 100 makes the next raise at least to 200.']],
    ['All-ins and side pots', ['You can only win from each player what you put in yourself. Extra chips form side pots that only players who covered them can win.', 'An all-in for less than a full raise does not re-open the betting: players who already acted may only call or fold.', 'Any bet nobody can match is returned before the showdown ("uncalled bet").', 'When everyone left is all-in, all hands are turned face up and the board runs out. That is when the win percentages appear.']],
    ['Showdown', ['Cards speak: the dealer device reads every hand; you never have to declare it.', 'All hands still in at the showdown are shown. The last player to bet or raise shows first.', 'Ties split the pot. Odd chips go to the first winner clockwise from the button.', 'After a hand you can show your cards voluntarily (key S). If everyone folded to you, showing is optional.']],
    ['Run it twice', ['When players are all in before the river, everyone involved can agree to deal the rest of the board twice. Each run wins half of every pot.', 'With "Players agree" everyone must say yes within 8 seconds; with "Always" it happens automatically. Not available with double board or Pineapple.']],
    ['Straddles, bomb pots, double board', ['Straddle: the player left of the big blind posts double the big blind before the deal and acts last preflop. Needs 4+ players.', 'Bomb pot: everyone puts the bomb amount in, there is no preflop betting, and the flop comes straight away. Happens on a schedule or by table vote.', 'Double board: two boards are dealt; each board wins half the pot. Win both to scoop.']],
    ['7-2 bounty', ['Win a hand holding 7-2 and show it, and every other player dealt in pays you the bounty (capped at their stack).', 'If everyone folds to you, press Show cards before the next hand starts to claim it.']],
    ['Crazy Pineapple', ['You get three cards. After the flop betting finishes, everyone throws one away (keys 1, 2, 3). Then it plays like Hold’em.', 'If you do not choose within 15 seconds, the dealer throws away your weakest card for you.']],
    ['Clock, time bank and disconnects', ['You have the table’s time to act. When it runs out your time bank is used automatically; when that runs out you check if you can, otherwise fold.', 'Two timeouts in a row sit you out until you press I’m back.', 'If you lose connection, your hand gets a short clock and is checked or folded. Your seat and chips stay.']],
    ['Cancelled hands', ['If the dealer device leaves mid-hand, another player’s device takes over within a few seconds. The unfinished hand is cancelled and every stack goes back to where it started that hand.', 'The host, or a table vote, can also cancel a hand (for example after a mass disconnect).']],
    ['Tournaments (Sit & Go)', ['Everyone starts with the same chips. Blinds rise on a timer: ×1, ×1.5, ×2, ×3, ×4, ×6 and so on, applied at the start of the next hand.', 'Bust out and you get your finishing place. Last player standing wins. No rebuys.']],
    ['Cash games', ['Buy in between the table minimum and maximum. Top up between hands up to the maximum.', 'The ledger tracks every buy-in and stack so anyone can see who is up or down. Play chips only.']],
  ];
  function rulesText(body) {
    const q = h('input', { class: 'input', id: 'rules-search', placeholder: 'Search the rules', 'aria-label': 'Search the rules', type: 'search' });
    const list = h('div', { class: 'rules' });
    const draw = () => {
      list.textContent = '';
      const s = q.value.trim().toLowerCase();
      for (const [title, items] of RULES) {
        const hit = !s || title.toLowerCase().includes(s) || items.some((i) => i.toLowerCase().includes(s));
        if (!hit) continue;
        list.append(h('details', { open: !!s }, h('summary', null, title), h('ul', null, items.map((i) => h('li', null, i)))));
      }
      if (!list.children.length) list.append(h('p', { class: 'note' }, 'Nothing matches. Try "side pot" or "straddle".'));
    };
    q.addEventListener('input', draw);
    draw();
    body.append(q, list);
  }

  function disputes(body) {
    const T = ui.T, me = PK.client.mySeat();
    body.append(h('div', { class: 'callout' }, 'Most arguments at a home game are about who won, whether the deal was fair, or what happened while someone was away. Here is how to settle each one.'));
    body.append(group('Who won and why', h('p', { class: 'note', style: { margin: 0 } }, 'Open Last hand for a pot-by-pot breakdown with the best five cards and the exact reason (higher kicker, second pair, and so on). Every earlier hand is in Hand history with the full action log and a step-by-step replay.'), h('button', { class: 'btn small', onclick: () => { tabRules = 'hand'; panels.open('rules', true); } }, 'Explain the last hand')));
    body.append(group('Was the shuffle fair?', h('p', { class: 'note', style: { margin: 0 } }, 'Before every hand the dealer device publishes a fingerprint (SHA-256 commitment) of a secret. Every seated player’s device then adds its own random number. The deck comes from both, so the dealer cannot choose the cards and no player can either. After a hand, anyone can request an audit: the secret is revealed, your device rebuilds the deck and checks it against what you actually saw.'), h('button', { class: 'btn small', onclick: () => panels.open('history') }, 'Audit a hand')));
    const voteBtns = [['bomb', 'Bomb pot next hand'], ['double', 'Double board next hand'], ['pause', 'Pause the game'], ['resume', 'Resume'], ['void', 'Cancel this hand']];
    body.append(group('Let the table decide', h('p', { class: 'note', style: { margin: 0 } }, 'Seated players can call a vote. A simple majority of connected players passes it within 30 seconds. Press Y or N to vote.'),
      me >= 0 && T ? h('div', { class: 'row' }, voteBtns.map(([k, l]) => h('button', { class: 'btn small', disabled: !!T.vt, onclick: () => { PK.client.req('propose', k); panels.close(); } }, l))) : h('p', { class: 'note' }, 'Take a seat to call votes.')));
    body.append(group('What the host can do', h('p', { class: 'note', style: { margin: 0 } }, 'The host can pause, cancel a hand, change a stack, remove a player and edit the rules for the next hand. Every stack change is announced to the table with a reason and shows up in the ledger.')));
    body.append(group('What this app cannot prove', h('p', { class: 'note', style: { margin: 0 } }, 'There is no server: one player’s device deals. Everyone else’s cards are encrypted so only their owner can read them, but the dealing device has to know the deck. A determined person could dig other players’ cards out of their own browser while dealing. Your device only switches dealer when most players at the table already have, so nobody can take over the deal by faking one. For serious games, deal from a device nobody at the table is using, or play on a site with a real server.')));
  }

  // ---------- history ----------
  function buildHistory(body, foot) {
    const recs = [...ui.hist.values()].sort((a, b) => b.hn - a.hn);
    if (histDetail != null) return histView(body, foot, ui.hist.get(histDetail));
    if (!recs.length) { body.append(h('p', { class: 'note' }, 'Hands you see at this table appear here, kept on this device.')); return; }
    const list = h('div', { class: 'hist' });
    for (const r of recs) {
      const winners = (r.res || []).flatMap((x) => x[3]).filter((v, i, a) => a.indexOf(v) === i).map((s) => (r.names[s] || 'Seat ' + (s + 1)));
      const sum = r.void ? 'Cancelled' : winners.length ? winners.join(' & ') + ' won' + (r.res && r.res[0] ? ' · ' + r.res[0][5] : '') : 'In progress';
      list.append(h('button', { class: 'histrow', type: 'button', onclick: () => { histDetail = r.hn; replayStep = -1; panels.open('history', true); } },
        h('span', { class: 'no' }, '#' + r.hn),
        h('span', { class: 'sum' }, ((PK.VARIANTS[r.game] || {}).short || '') + ' · ' + sum),
        h('span', { class: 'cardrow' }, (r.my || []).map((c) => PK.miniCard(c)), r.audit ? h('span', { class: 'tag', style: { color: r.audit.ok ? 'var(--good)' : 'var(--fold)' } }, r.audit.ok ? 'Verified' : 'Failed') : null)));
    }
    body.append(list);
  }
  function eventText(r, e) {
    const [, k, s, a, x] = e;
    const nm = r.names[s] || 'Seat ' + (s + 1);
    const cs = (v) => PK.splitCards(v).map((c) => (c[0] === 'T' ? '10' : c[0]) + PK.SUIT_GLYPH[c[1]]).join(' ');
    switch (k) {
      case 'post': return nm + ' posts ' + ({ sb: 'small blind', bb: 'big blind', ante: 'ante', straddle: 'straddle', bomb: 'bomb pot' }[x] || x) + ' ' + fmt(a);
      case 'act': return x === 'fold' ? nm + ' folds' : x === 'check' ? nm + ' checks' : x === 'call' ? nm + ' calls ' + fmt(a) : x === 'bet' ? nm + ' bets ' + fmt(a) : x === 'raise' ? nm + ' raises to ' + fmt(a) : nm + ' all in ' + fmt(a);
      case 'board': return 'Board: ' + cs(x);
      case 'show': return nm + ' shows ' + cs(x);
      case 'win': return nm + ' wins ' + fmt(a);
      case 'refund': return 'Uncalled ' + fmt(a) + ' returned to ' + nm;
      case 'bounty': return nm + ' collects 7-2 bounty ' + fmt(a);
      case 'rit': return x === '2' ? 'Run it twice' : 'Run once';
      case 'void': return 'Hand cancelled';
      case 'discardStart': return 'Discard round';
      case 'collect': return null;
    }
    return null;
  }
  function histView(body, foot, r) {
    if (!r) { histDetail = null; return buildHistory(body, foot); }
    const V = PK.VARIANTS[r.game] || PK.VARIANTS.nlhe;
    body.append(h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { histDetail = null; panels.open('history', true); } }, 'All hands'), h('b', null, 'Hand #' + r.hn + ' · ' + V.name + (r.bl ? ' · ' + fmt(r.bl[0]) + '/' + fmt(r.bl[1]) : ''))));
    const lines = (r.log || []).map((e) => ({ e, t: eventText(r, e) })).filter((x) => x.t);
    const step = replayStep < 0 ? lines.length : replayStep;
    // board as of the replay step
    const boards = [];
    for (const { e } of lines.slice(0, step)) if (e[1] === 'board') { const bi = boards.length && (r.bd || []).length > 1 ? null : 0; void bi; }
    const shownBoards = (r.bd || []).map((b) => {
      let seen = 0;
      for (const { e } of lines.slice(0, step)) if (e[1] === 'board') { const cs = PK.splitCards(e[4]); if (cs.every((c) => b.includes(c))) seen = Math.max(seen, b.indexOf(cs[cs.length - 1]) + 1); }
      return replayStep < 0 ? b : b.slice(0, seen);
    });
    const top = h('div', { class: 'group' }, h('h3', null, 'Cards'),
      r.my ? h('div', { class: 'row' }, h('span', { class: 'note' }, 'You'), h('div', { class: 'cardrow' }, r.my.map((c) => PK.miniCard(c)))) : null,
      ...shownBoards.map((b, i) => h('div', { class: 'row' }, h('span', { class: 'note' }, shownBoards.length > 1 ? 'Board ' + (i + 1) : 'Board'), h('div', { class: 'cardrow' }, b.length ? b.map((c) => PK.miniCard(c)) : h('span', { class: 'note' }, 'none yet')))),
      r.rab ? h('div', { class: 'row' }, h('span', { class: 'note' }, 'Rabbit'), h('div', { class: 'cardrow' }, r.rab.map((c) => PK.miniCard(c)))) : null);
    body.append(top);
    const logBox = h('div', { class: 'group' }, h('h3', null, 'Action'));
    lines.forEach(({ t }, i) => logBox.append(h('div', { class: 'logline', style: { opacity: i < step ? 1 : 0.3 } }, t)));
    logBox.append(h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => { replayStep = 0; panels.open('history', true); } }, 'Replay from start'),
      h('button', { class: 'btn small', disabled: replayStep < 0 || replayStep <= 0, onclick: () => { replayStep = Math.max(0, replayStep - 1); panels.open('history', true); } }, 'Back'),
      h('button', { class: 'btn small', disabled: replayStep < 0, onclick: () => { replayStep = replayStep + 1 >= lines.length ? -1 : replayStep + 1; panels.open('history', true); } }, 'Next step'),
      replayStep >= 0 ? h('span', { class: 'note num' }, 'Step ' + step + ' of ' + lines.length) : null));
    body.append(logBox);
    if (r.res) body.append(group('Result', resultBlock(ui.T, r.res, r.hnm, r.sh, r.unc)));
    // audit
    const a = r.audit;
    const au = group('Shuffle audit', h('p', { class: 'note', style: { margin: 0 } }, 'Commitment published before the deal: ', h('code', { class: 'num', style: { wordBreak: 'break-all' } }, r.cm || 'not recorded'), '. Player entropy from ' + ((r.sd || []).length) + ' device(s).'));
    if (a) {
      au.append(h('div', { class: 'verdict ' + (a.ok ? 'ok' : 'bad'), html: icon(a.ok ? 'shield' : 'alert') }));
      const v = au.lastChild;
      v.append(h('div', null, h('b', null, a.ok ? 'Verified. ' : 'Audit failed. '), a.ok ? 'The secret matches the commitment published before anyone sent their random numbers, and every card you saw (yours, the board, and every shown hand) sits exactly where the shuffle puts it.' + (a.partial ? ' You joined mid-hand, so board order was only partly checked.' : '') : (a.problems || []).join(' ')));
      for (const w of a.warnings || []) au.append(h('div', { class: 'callout' }, w));
      if (a.dealt) au.append(h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Seat'), h('th', null, 'Dealt'))), h('tbody', null, Object.entries(a.dealt).map(([s, cs]) => h('tr', null, h('td', null, r.names[s] || 'Seat ' + (+s + 1)), h('td', null, h('div', { class: 'cardrow' }, cs.map((c) => PK.miniCard(c))))))))));
    } else {
      const waiting = ui.auditWait === r.hn;
      au.append(h('div', { class: 'row' }, h('button', { class: 'btn small primary', disabled: waiting || !r.cm, onclick: () => { ui.auditWait = r.hn; PK.client.req('audit', r.hn); PK.toast('Audit requested. The dealer device will reveal the secret for hand #' + r.hn + '.'); panels.open('history', true); } }, waiting ? 'Waiting for the dealer…' : 'Audit this hand'), h('span', { class: 'note' }, 'Reveals everyone’s cards for this finished hand.')));
    }
    body.append(au);
  }

  // ---------- ledger ----------
  function buildLedger(body) {
    const M = ui.M || client.M || {};
    const L = (M.L || []).slice().sort((a, b) => (b[3] - b[2]) - (a[3] - a[2]));
    if (!L.length) { body.append(h('p', { class: 'note' }, 'Buy-ins and results appear here once people sit down.')); return; }
    let tb = 0, tn = 0;
    const rows = L.map((r) => { tb += r[2]; tn += r[3]; const net = r[3] - r[2]; return h('tr', null, h('td', null, r[1], r[4] ? '' : h('span', { class: 'note' }, ' (left)')), h('td', { class: 'r' }, fmt(r[2])), h('td', { class: 'r' }, fmt(r[3])), h('td', { class: 'r ' + (net > 0 ? 'pos' : net < 0 ? 'neg' : '') }, (net > 0 ? '+' : '') + fmt(net))); });
    body.append(group('Ledger', h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', { class: 'r' }, 'Bought in'), h('th', { class: 'r' }, 'Stack / left with'), h('th', { class: 'r' }, 'Net'))), h('tbody', null, rows),
      h('tfoot', null, h('tr', null, h('td', null, h('b', null, 'Total')), h('td', { class: 'r' }, fmt(tb)), h('td', { class: 'r' }, fmt(tn)), h('td', { class: 'r' }, tn - tb === 0 ? 'Balanced' : fmt(tn - tb) + ' in play'))))),
    h('p', { class: 'note', style: { margin: 0 } }, 'Between hands the totals balance exactly. Mid-hand the difference is the chips in the pot.')));
    const X = M.X || [];
    const nameOf = (pid) => (L.find((r) => r[0] === pid) || [])[1] || 'Player';
    if (X.length) {
      const rows2 = X.map((x) => h('tr', null, h('td', null, nameOf(x[0])), h('td', { class: 'r' }, x[1]), h('td', { class: 'r' }, x[1] ? Math.round((100 * x[2]) / x[1]) + '%' : '-'), h('td', { class: 'r' }, x[1] ? Math.round((100 * x[3]) / x[1]) + '%' : '-'), h('td', { class: 'r' }, x[4]), h('td', { class: 'r' }, x[6] ? x[7] + '/' + x[6] : '-'), h('td', { class: 'r' }, fmt(x[5]))));
      body.append(group('Stats', h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', { class: 'r' }, 'Hands'), h('th', { class: 'r', title: 'Voluntarily put money in preflop' }, 'VPIP'), h('th', { class: 'r', title: 'Preflop raise' }, 'PFR'), h('th', { class: 'r' }, 'Pots won'), h('th', { class: 'r' }, 'Showdowns won'), h('th', { class: 'r' }, 'Biggest pot'))), h('tbody', null, rows2))),
        h('p', { class: 'note', style: { margin: 0 } }, 'VPIP: how often a player chooses to put chips in before the flop. PFR: how often they raise before the flop.')));
    }
  }

  // ---------- host tools ----------
  function buildHost(body, foot) {
    const H = client.host;
    if (!H) { body.append(h('p', { class: 'note' }, 'Only the device dealing the cards has host tools.')); return; }
    const T = ui.T;
    body.append(h('div', { class: 'callout' }, 'This device is dealing. Keep this tab open: if it closes mid-hand, another player takes over and that hand is cancelled with chips returned.'));
    const ctrl = h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => { H.setPaused(!H.paused); panels.open('host', true); } }, H.paused ? 'Resume game' : 'Pause game', ' ', h('kbd', null, 'P')),
      h('button', { class: 'btn small', disabled: !H.g.handLive(), onclick: () => { const e = H.voidHand('cancelled by the host'); if (e) PK.toast(e); panels.open('host', true); } }, 'Cancel this hand'),
      h('button', { class: 'btn small', onclick: () => { H.bombNext = true; H.say('The host called a bomb pot for the next hand.'); PK.toast('Next hand is a bomb pot.'); } }, 'Bomb pot next hand'),
      h('button', { class: 'btn small', onclick: () => { H.doubleNext = true; H.say('Double board next hand.'); PK.toast('Next hand has two boards.'); } }, 'Double board next hand'),
      h('button', { class: 'btn small', onclick: () => panels.open('setup', false, 'edit') }, 'Edit table rules'));
    if (H.cfg.mode === 'sng') ctrl.append(h('button', { class: 'btn small primary', disabled: H.sng.started, onclick: () => { H.startTournament(); panels.close(); } }, 'Start tournament'), h('button', { class: 'btn small', onclick: () => { H.resetTournament(); panels.open('host', true); } }, 'Reset tournament'));
    body.append(group('Game', ctrl));
    const rows = [];
    H.g.seats.forEach((s, i) => {
      if (!s) return;
      const stackIn = h('input', { class: 'input num', type: 'number', value: s.stack, min: 0, style: { width: '110px' }, 'aria-label': 'Stack for ' + s.name });
      const reason = h('input', { class: 'input', placeholder: 'Reason', maxlength: 60, style: { width: '140px' }, 'aria-label': 'Reason for change' });
      rows.push(h('tr', null,
        h('td', null, s.name, s.bot ? h('span', { class: 'note' }, ' · ' + ((PK.PERSONAS[s.persona] || {}).label || 'Bot')) : '', s.id === client.pid ? h('span', { class: 'note' }, ' (you)') : ''),
        h('td', null, h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, stackIn, reason, h('button', { class: 'btn small', onclick: () => { const e = H.setStack(i, stackIn.value, reason.value); PK.toast(e || 'Stack updated and announced.'); panels.open('host', true); } }, 'Set'))),
        h('td', { class: 'r' }, h('button', { class: 'btn small ghost', onclick: () => { s.sitOut = !s.sitOut; H.dirty = true; panels.open('host', true); } }, s.sitOut ? 'Deal in' : 'Sit out'), ' ',
          h('button', { class: 'btn small ghost', onclick: () => { H.removeSeat(i, s.bot ? null : s.name + ' was removed by the host.'); panels.open('host', true); } }, 'Remove'))));
    });
    body.append(group('Players', h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', null, 'Stack (between hands)'), h('th', { class: 'r' }, ''))), h('tbody', null, rows)))));
    const persona = h('select', { class: 'input', 'aria-label': 'Bot style', style: { width: 'auto' } }, Object.entries(PK.PERSONAS).map(([k, p]) => h('option', { value: k }, p.label + ': ' + p.note)));
    body.append(group('Bots', h('div', { class: 'row' }, persona, h('button', { class: 'btn small primary', disabled: !H.g.seats.some((x) => !x), onclick: () => { const e = H.addBot(persona.value); if (e) PK.toast(e); panels.open('host', true); } }, 'Add bot'))));
    body.append(group('Diagnostics', h('p', { class: 'note num', style: { margin: 0 } }, 'Table state ' + (H.lastSize || 0) + ' of 4,096 bytes per update · epoch ' + H.ep + ' · hand ' + H.g.handNo)));
    void T; void foot;
  }

  // ---------- shortcuts ----------
  function buildShortcuts(body) {
    const rows = [
      ['F', 'Fold (on your turn) · pre-select Check/Fold (otherwise)'], ['C or Space', 'Check or call · pre-select Call any'], ['R or B', 'Open raise sizes, press again to raise'], ['1 – 6', 'Raise presets: min, ⅓, ½, ⅔, pot, all-in'], ['↑ / ↓', 'Adjust raise by one big blind (Shift: five)'], ['Enter', 'Confirm raise'], ['A', 'All-in (press twice to confirm)'],
      ['Y / N', 'Vote, or answer run it twice'], ['1 – 3', 'Pineapple: discard that card'], ['S', 'Show your cards after a hand'], ['E', 'Rabbit hunt'], ['O', 'Sit out / I’m back'], ['J', 'Take a seat'],
      ['T or /', 'Chat'], ['L', 'Dealer log'], ['H', 'Hand history'], ['G', 'Rules & disputes'], [',', 'Settings'], ['V', 'Camera view'], ['M', 'Mute'], ['I', 'Read the table aloud (screen readers)'], ['P', 'Pause (host)'], ['Shift+H', 'Host tools'], ['Esc', 'Close'], ['?', 'This list'],
    ];
    body.append(h('div', { class: 'kbdgrid' }, rows.flatMap(([k, d]) => [h('kbd', null, k), h('span', null, d)])));
    body.append(h('p', { class: 'note' }, 'Drag the table to tilt the camera, scroll to zoom, double-click to reset.'));
  }

  const BUILD = { menu: buildMenu, invite: buildInvite, setup: buildSetup, settings: buildSettings, rules: buildRules, history: buildHistory, ledger: buildLedger, host: buildHost, shortcuts: buildShortcuts };
})(window.PK = window.PK || {});
