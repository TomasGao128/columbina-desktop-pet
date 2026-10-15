/** A bounded celebration anchored to the actual card, with no input interception. */
function createRelationCelebration(card, { maximum = false } = {}) {
  const layer = document.createElement('div');
  layer.className = 'relation-stars relation-celebration';
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.maximum = String(maximum);
  const rect = card.getBoundingClientRect();
  layer.style.setProperty('--origin-x', `${rect.left + rect.width / 2}px`);
  layer.style.setProperty('--origin-y', `${rect.top + Math.min(94, rect.height * 0.3)}px`);
  layer.style.setProperty('--card-width', `${rect.width}px`);
  const append = (className) => {
    const element = document.createElement('i');
    element.className = className;
    layer.appendChild(element);
    return element;
  };
  append('relation-bloom');
  append('relation-halo');
  append('relation-halo relation-echo');
  append('relation-rays');
  const count = maximum ? 84 : 60;
  for (let index = 0; index < count; index++) {
    const star = append('relation-star');
    const angle = index * 2.399963;
    const distance = 80 + (index % 9) * 15;
    star.textContent = index % 4 === 0 ? '✦' : index % 4 === 1 ? '✧' : '·';
    star.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    star.style.setProperty('--dy', `${Math.sin(angle) * distance * 0.75}px`);
    star.style.setProperty('--delay', `${(index % 8) * 45}ms`);
    star.style.setProperty('--duration', `${2600 + (index % 5) * 180}ms`);
    star.style.setProperty('--tone', ['#ffdfa0', '#92ddff', '#c2a5ff'][index % 3]);
  }
  // Slowly falling accents remain visible around the card after the initial burst.
  for (let index = 0; index < 18; index++) {
    const dust = append('relation-dust');
    dust.style.left = `${rect.left + 10 + ((index * 0.618) % 1) * (rect.width - 20)}px`;
    dust.style.top = `${Math.max(8, rect.top - 12)}px`;
    dust.style.setProperty('--fall', `${Math.min(innerHeight - rect.top, rect.height + 50)}px`);
    dust.style.setProperty('--delay', `${index * 180}ms`);
    dust.style.setProperty('--tone', index % 2 ? '#b6a6ff' : '#ffe3a8');
  }
  document.body.appendChild(layer);
  return layer;
}

module.exports = { createRelationCelebration };
