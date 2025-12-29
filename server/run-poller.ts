import startPoller from './poller';

(async function main(){
  const interval = Number(process.env.POLLER_INTERVAL_MS || '15000');
  try {
    await startPoller(interval);
  } catch (e) {
    console.error('Failed to start poller', e);
    process.exit(1);
  }
})();
