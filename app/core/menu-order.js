// Store labels rather than array indices so new menu entries remain available.
function validMenuOrder(value) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length <= 40 &&
    Object.entries(value).every(
      ([key, list]) =>
        key.length > 0 &&
        key.length <= 120 &&
        Array.isArray(list) &&
        list.length <= 150 &&
        list.every(
          (id) => typeof id === "string" && id.length > 0 && id.length <= 120,
        ) &&
        new Set(list).size === list.length,
    )
  );
}
function orderedMenu(items, saved = []) {
  const rank = new Map(saved.map((id, i) => [id, i]));
  return items
    .slice()
    .sort(
      (a, b) =>
        (rank.get(a.label) ?? saved.length) -
        (rank.get(b.label) ?? saved.length),
    );
}
function cloneMenuOrder(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, list]) => [key, [...list]]),
  );
}
module.exports = { validMenuOrder, orderedMenu, cloneMenuOrder };
