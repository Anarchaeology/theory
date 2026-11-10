// The section's front page: its footer gives the latest "updated" date among the pages listed. Each row of the list
// names its page's data file in data-file, so a new page only needs its row.
(() => {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const files = [...document.querySelectorAll('.pages a[data-file]')].map(a => a.dataset.file);
  Promise.all(files.map(f => fetch(f).then(r => (r.ok ? r.json() : null)).catch(() => null))).then(all => {
    // The dates are written year first, so the latest is the last in order.
    const dates = all.map(d => d && d.updated).filter(Boolean).sort();
    if (!dates.length) return;
    const d = dates[dates.length - 1];
    document.getElementById('updated').textContent = `Updated ${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}.`;
  });
})();
