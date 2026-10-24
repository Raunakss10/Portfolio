console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

// ---------- Step 3: Automatic navigation menu ----------
const BASE_PATH =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/'            // local server
    : '/portfolio/'; // GitHub Pages repo name

let pages = [
  { url: '', title: 'Home' },
  { url: 'projects.html', title: 'Projects' },
  { url: 'resume.html', title: 'Resume' },
  { url: 'contact.html', title: 'Contact' },
  { url: 'https://github.com/Raunakss10', title: 'GitHub' },
];

// treat "/portfolio/" and "/portfolio/index.html" as the same page
const normalize = (path) => path.replace(/index\.html$/, '');

let nav = document.createElement('nav');
document.body.prepend(nav);

for (let p of pages) {
  let url = p.url;
  let title = p.title;

  url = !url.startsWith('http') ? BASE_PATH + url : url;

  let a = document.createElement('a');
  a.href = url;
  a.textContent = title;

  let isCurrent =
    a.host === location.host &&
    normalize(a.pathname) === normalize(location.pathname);
  a.classList.toggle('current', isCurrent);
  if (isCurrent) a.setAttribute('aria-current', 'page');

  if (a.host !== location.host) {
    a.target = '_blank';
  }

  nav.append(a);
}

// ---------- Step 4: Dark mode switch ----------
document.body.insertAdjacentHTML(
  'afterbegin',
  `
  <label class="color-scheme">
    Theme:
    <select>
      <option value="light dark">Automatic</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>`,
);

let select = document.querySelector('.color-scheme select');

// show which mode "Automatic" resolves to
const osDark = matchMedia('(prefers-color-scheme: dark)').matches;
select.options[0].textContent = `Automatic (${osDark ? 'Dark' : 'Light'})`;

function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
  select.value = colorScheme;
}

if ('colorScheme' in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

select.addEventListener('input', function (event) {
  console.log('color scheme changed to', event.target.value);
  setColorScheme(event.target.value);
  localStorage.colorScheme = event.target.value;
});

// ---------- Step 5: Better contact form ----------
let form = document.querySelector('form');

form?.addEventListener('submit', function (event) {
  event.preventDefault();
  let data = new FormData(form);
  let params = [];
  for (let [name, value] of data) {
    params.push(`${name}=${encodeURIComponent(value)}`);
  }
  location.href = form.action + '?' + params.join('&');
});

// ---------- Lab 4: Load JSON data ----------
export async function fetchJSON(url) {
  try {
    // Fetch the JSON file from the given URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
  }
}

// ---------- Lab 4: Render projects from data ----------
const VALID_HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  // Make sure we have somewhere to draw
  if (!(containerElement instanceof Element)) {
    console.error('renderProjects: containerElement is not a valid DOM element', containerElement);
    return;
  }

  // Fall back to h2 if someone passes something that isn't a heading tag
  if (!VALID_HEADINGS.includes(String(headingLevel).toLowerCase())) {
    console.warn(`renderProjects: "${headingLevel}" is not a heading tag, using h2`);
    headingLevel = 'h2';
  }

  // Clear old content so projects don't get added twice
  containerElement.innerHTML = '';

  // Placeholder if there's nothing to show (or the JSON failed to load)
  if (!Array.isArray(projects) || projects.length === 0) {
    containerElement.innerHTML = '<p class="empty">No projects to show yet. Check back soon!</p>';
    return;
  }

  for (const project of projects) {
    const article = document.createElement('article');

    const title = project.title ?? 'Untitled project';
    const titleHTML = project.url
      ? `<a href="${project.url}" target="_blank" rel="noopener">${title}</a>`
      : title;
    const imageHTML = project.image
      ? `<img src="${project.image}" alt="" loading="lazy">`
      : '';
    const yearHTML = project.year ? `<p class="year">${project.year}</p>` : '';

    article.innerHTML = `
      ${imageHTML}
      <${headingLevel}>${titleHTML}</${headingLevel}>
      ${yearHTML}
      <p>${project.description ?? ''}</p>
    `;

    containerElement.appendChild(article);
  }
}

// ---------- Lab 4: GitHub API ----------
export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}
