/**
 * Builds compact pagination items with ellipses for UI rendering.
 * @returns {Array<{type: 'page', page: number}|{type: 'ellipsis'}>}
 */
function buildPaginationItems(currentPage, totalPages, siblingCount = 1) {
  const current = Math.max(1, Number(currentPage) || 1);
  const total = Math.max(1, Number(totalPages) || 1);
  const siblings = Math.max(0, Number(siblingCount) || 0);

  if (total <= 1) {
    return [{ type: 'page', page: 1 }];
  }

  const pages = new Set([1, total, current]);
  for (let offset = 1; offset <= siblings; offset += 1) {
    if (current - offset >= 1) {
      pages.add(current - offset);
    }
    if (current + offset <= total) {
      pages.add(current + offset);
    }
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const items = [];
  let previous = 0;

  sorted.forEach((page) => {
    if (previous && page - previous > 1) {
      items.push({ type: 'ellipsis' });
    }
    items.push({ type: 'page', page });
    previous = page;
  });

  return items;
}

module.exports = {
  buildPaginationItems
};
