JSON.stringify({
  win: innerWidth + 'x' + innerHeight,
  scrollY: Math.round(window.pageYOffset),
  docScrollTop: Math.round(document.documentElement.scrollTop),
  bodyScrollTop: Math.round(document.body.scrollTop),
  scrollHeight: document.documentElement.scrollHeight,
  lastCardTop: Math.round(document.querySelectorAll('a.game')[9].getBoundingClientRect().top)
})
