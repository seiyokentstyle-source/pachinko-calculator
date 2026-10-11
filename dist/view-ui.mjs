export function initViews(session) {
  const $ = id => document.getElementById(id);
  let current = 'ev';
  function show(view) {
    if (!['ev', 'before', 'after'].includes(view)) return;
    current = view;
    if (view !== 'ev') session.setContext(view);
    $('ev-view').hidden = view !== 'ev';
    $('session-view').hidden = view === 'ev';
    $('results').hidden = view !== 'ev';
    $('workspace').dataset.view = view;
    document.querySelectorAll('.mode-nav [data-view]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
  }
  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      show(button.dataset.view);
      const heading = $(current === 'ev' ? 'ev-title' : 'session-title');
      heading.setAttribute('tabindex', '-1');
      heading.focus({preventScroll: true});
      $('workspace').scrollIntoView?.({block: 'start'});
    });
  });
  show('ev');
  return {show, get current() {return current;}};
}
