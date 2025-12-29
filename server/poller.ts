import { database } from "@shared/firebase";
import { ref, get, update } from "firebase/database";
import { storage } from "./storage";

function now() { return Date.now(); }

function evaluateSelection(saved: any, live: any) {
  const sel = String(saved.selection || '').toLowerCase();
  const home = Number(live?.homeScore ?? 0);
  const away = Number(live?.awayScore ?? 0);
  const total = home + away;

  const overMatch = sel.match(/over\s*(\d+(?:\.\d+)?)/i);
  if (overMatch) {
    const threshold = Number(overMatch[1]);
    return total > threshold ? 'WON' : (live?.status === 'live' || live?.status === 'upcoming') ? 'PENDING' : 'LOST';
  }
  const underMatch = sel.match(/under\s*(\d+(?:\.\d+)?)/i);
  if (underMatch) {
    const threshold = Number(underMatch[1]);
    return total < threshold ? 'WON' : (live?.status === 'live' || live?.status === 'upcoming') ? 'PENDING' : 'LOST';
  }

  if (sel.includes('both') && sel.includes('score')) {
    if (live?.status === 'upcoming') return 'PENDING';
    return (home > 0 && away > 0) ? 'WON' : (live?.status === 'live') ? 'PENDING' : 'LOST';
  }

  if (sel === '1' || sel.includes('home')) {
    if (live?.status === 'upcoming') return 'PENDING';
    return home > away ? 'WON' : (live?.status === 'live') ? 'PENDING' : 'LOST';
  }
  if (sel === '2' || sel.includes('away')) {
    if (live?.status === 'upcoming') return 'PENDING';
    return away > home ? 'WON' : (live?.status === 'live') ? 'PENDING' : 'LOST';
  }
  if (sel === 'x' || sel.includes('draw')) {
    if (live?.status === 'upcoming') return 'PENDING';
    return home === away ? 'WON' : 'LOST';
  }

  return 'PENDING';
}

function evaluateExactByAllOdds(m: any, live: any) {
  try {
    const allOdds = m.savedOddsSnapshot || m.savedOdds || (live && (live.allOdds || live.odds)) || {};
    if (!m.mappedMarketId || !m.mappedOutcomeKey || !allOdds) return null;

    for (const bookData of Object.values(allOdds)) {
      const book = bookData as any;
      for (const marketGroup of Object.values(book || {})) {
        for (const [mid, midObj] of Object.entries(marketGroup || {})) {
          if (String(mid) !== String(m.mappedMarketId)) continue;
          const sp = (midObj as any).sp || {};
          for (const [variantKey, variantObj] of Object.entries(sp || {})) {
            const outs = (variantObj as any).out || {};
            if (!Object.prototype.hasOwnProperty.call(outs, String(m.mappedOutcomeKey))) continue;

            const outcomeKey = String(m.mappedOutcomeKey);
            const home = Number(live?.homeScore ?? 0);
            const away = Number(live?.awayScore ?? 0);

            if (String(variantKey).includes('total=')) {
              const match = String(variantKey).match(/total=([\d\.]+)/);
              const threshold = match ? Number(match[1]) : null;
              if (threshold != null) {
                if (outcomeKey === '12') return (home + away) > threshold ? 'WON' : (live?.status === 'live' || live?.status === 'upcoming') ? 'PENDING' : 'LOST';
                if (outcomeKey === '13') return (home + away) < threshold ? 'WON' : (live?.status === 'live' || live?.status === 'upcoming') ? 'PENDING' : 'LOST';
              }
            }

            if (String(variantKey).includes('hcp=')) {
              const match = String(variantKey).match(/hcp=([\-\d\.]+)/);
              const handicap = match ? Number(match[1]) : 0;
              if (outcomeKey === '1714') {
                const adjusted = home + handicap;
                return adjusted > away ? 'WON' : (live?.status === 'live' || live?.status === 'upcoming') ? 'PENDING' : 'LOST';
              }
              if (outcomeKey === '1715') {
                const adjusted = away + handicap;
                return adjusted > home ? 'WON' : (live?.status === 'live' || live?.status === 'upcoming') ? 'PENDING' : 'LOST';
              }
            }

            if (String(mid) === '3') {
              if (outcomeKey === '1') return home > away ? 'WON' : (live?.status === 'live' || live?.status === 'upcoming') ? 'PENDING' : 'LOST';
              if (outcomeKey === '2') return away > home ? 'WON' : (live?.status === 'live' || live?.status === 'upcoming') ? 'PENDING' : 'LOST';
              if (outcomeKey === '3' || outcomeKey.toLowerCase() === 'x') return home === away ? 'WON' : (live?.status === 'live' || live?.status === 'upcoming') ? 'PENDING' : 'LOST';
            }

            const outObj = outs[outcomeKey];
            if (outObj && outObj.n && typeof outObj.n === 'string') {
              const label = outObj.n.toLowerCase();
              if (label.includes('both') && label.includes('score')) {
                if (live?.status === 'upcoming') return 'PENDING';
                return (home > 0 && away > 0) ? 'WON' : (live?.status === 'live') ? 'PENDING' : 'LOST';
              }
            }

            return null;
          }
        }
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

export async function pollOnce() {
  const betsRef = ref(database, 'bets');
  const snap = await get(betsRef);
  if (!snap || !snap.exists()) return;
  const bets = snap.val() as Record<string, any>;

  for (const [betId, betRaw] of Object.entries(bets)) {
    const bet = betRaw as any;
    try {
      if (!bet || bet.status !== 'PENDING') continue;

      let wroteAny = false;
      const perBetUpdates: Record<string, any> = {};

      const matches = bet.matches || [];
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i] as any;
        const existingStatus = m.resultStatus || m.status || 'PENDING';
        if (existingStatus && existingStatus !== 'PENDING') continue;

        const live = await storage.getMatch(String(m.matchId));
        if (!live) continue;

        const exact = evaluateExactByAllOdds(m, live);
        const result = exact || evaluateSelection(m, live);

        perBetUpdates[`matches/${i}/resultStatus`] = result;
        perBetUpdates[`matches/${i}/lastCheckedAt`] = now();
        perBetUpdates[`matches/${i}/liveInfo`] = {
          homeScore: live.homeScore,
          awayScore: live.awayScore,
          currentMinute: live.currentMinute,
          status: live.status,
        };
        if (result === 'WON' || result === 'LOST') perBetUpdates[`matches/${i}/settledAt`] = now();
        wroteAny = true;
      }

      if (wroteAny) {
        const betRef = ref(database, `bets/${betId}`);
        await update(betRef, perBetUpdates);

        const freshSnap = await get(betRef);
        const fresh = freshSnap.val() || bet;
        const anyLost = (fresh.matches || []).some((mm: any) => (mm.resultStatus || mm.status) === 'LOST');
        const allWon = (fresh.matches || []).length > 0 && (fresh.matches || []).every((mm: any) => (mm.resultStatus || mm.status) === 'WON');

        if (anyLost && fresh.status !== 'LOST') await update(betRef, { status: 'LOST' });
        else if (allWon && fresh.status !== 'WON') await update(betRef, { status: 'WON' });
      }
    } catch (err) {
      console.error('Poller error for bet', betId, err);
    }
  }
}

export default async function startPoller(intervalMs = 15_000) {
  console.log('Starting poller, interval:', intervalMs);
  while (true) {
    try {
      await pollOnce();
    } catch (err) {
      console.error('Poller run error:', err);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
