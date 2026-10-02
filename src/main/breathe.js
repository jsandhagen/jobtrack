// Long loops on the main process (scoring every posting a careers check or a
// job search found) hold up every click in the app while they run. A loop
// that awaits breathe() each round gives the app a turn whenever it has been
// working for more than a few milliseconds, so the window never freezes.
function breather(budgetMs = 12) {
  let since = Date.now();
  return async function breathe() {
    if (Date.now() - since < budgetMs) return;
    await new Promise((resolve) => setImmediate(resolve));
    since = Date.now();
  };
}

module.exports = { breather };
