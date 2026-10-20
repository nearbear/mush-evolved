// Dev-only design kit page (web/design-kit.html): fills each `[data-pieces]`
// list with thumbnails of the named files from Mush/www/img/design, with their
// natural size, so every assembled component shows what it's built from.
// Not part of the production build (only index.html is a build input).

const urls = import.meta.glob<string>("../../../Mush/www/img/design/*.{png,jpg,gif}", {
  eager: true,
  query: "?url",
  import: "default",
});
const byName = new Map(Object.entries(urls).map(([path, url]) => [path.split("/").pop()!, url]));

for (const list of document.querySelectorAll<HTMLElement>("[data-pieces]")) {
  for (const name of list.dataset.pieces!.split(/\s+/).filter(Boolean)) {
    const url = byName.get(name);
    const item = document.createElement("li");
    if (!url) {
      item.className = "missing";
      item.textContent = `${name} (missing)`;
      list.append(item);
      continue;
    }
    const img = new Image();
    img.src = url;
    img.alt = "";
    const caption = document.createElement("span");
    caption.textContent = name;
    img.addEventListener("load", () => {
      caption.textContent = `${name} ${img.naturalWidth}×${img.naturalHeight}`;
    });
    if (!name.endsWith(".png")) item.classList.add("not-png");
    item.append(img, caption);
    list.append(item);
  }
}

// Vite dev doesn't rewrite ../Mush paths written in the HTML, so the page names
// files by `data-img` (an <img>) or `data-bg` (a background) and they resolve here.
for (const img of document.querySelectorAll<HTMLImageElement>("img[data-img]")) {
  img.src = byName.get(img.dataset.img!) ?? "";
}
for (const el of document.querySelectorAll<HTMLElement>("[data-bg]")) {
  el.style.backgroundImage = `url("${byName.get(el.dataset.bg!)}")`;
}

// Checkerboard toggle, so transparency in the art is visible.
document.querySelector("#checker")?.addEventListener("change", (e) => {
  document.body.classList.toggle("checker", (e.target as HTMLInputElement).checked);
});
