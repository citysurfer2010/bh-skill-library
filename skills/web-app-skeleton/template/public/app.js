const $ = (id) => document.getElementById(id);

async function api(path, options) {
  const res = await fetch(`api/${path}`, options);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`);
  return res.status === 204 ? null : res.json();
}

function renderItem(item) {
  const li = document.createElement("li");
  li.textContent = item.title;
  return li;
}

async function loadItems() {
  const items = await api("items");
  $("items").replaceChildren(...items.map(renderItem));
  $("status").textContent = items.length ? "" : "Noch keine Eintraege.";
}

$("add").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: $("title").value }),
    });
    $("title").value = "";
    await loadItems();
  } catch (err) {
    $("status").textContent = err.message;
  }
});

try {
  const me = await api("me");
  $("user").textContent = me.name;
  $("add").hidden = me.role !== "admin";
  await loadItems();
} catch (err) {
  $("status").textContent = err.message;
}
