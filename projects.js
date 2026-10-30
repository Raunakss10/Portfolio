import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from './global.js';

const projects = (await fetchJSON('./projects.json')) ?? [];
const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');
const searchInput = document.querySelector('.searchBar');
const filterStatus = document.querySelector('.filter-status');

// ---------- Shared state ----------
// Both filters live here, so the search and the pie always work together
// (this is the Step 5.4 bug fix).
let query = '';
let selectedYear = null; // store the YEAR, not the slice index, since indices shift when the pie re-renders

// Colors are keyed by year, so a year keeps its color even when other slices disappear
const colors = d3.scaleOrdinal(d3.schemeTableau10);

const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
const sliceGenerator = d3.pie().value((d) => d.value).sort(null);

// ---------- Filters ----------
function matchesQuery(project) {
  const values = Object.values(project).join('\n').toLowerCase();
  return values.includes(query.toLowerCase());
}

function matchesYear(project) {
  return selectedYear === null || project.year === selectedYear;
}

// ---------- Rendering ----------
function renderPieChart(projectsGiven) {
  // Group by year and count
  const rolledData = d3.rollups(projectsGiven, (v) => v.length, (d) => d.year);
  const data = rolledData
    .map(([year, count]) => ({ value: count, label: year }))
    .sort((a, b) => d3.descending(a.label, b.label));

  const arcData = sliceGenerator(data);
  const arcs = arcData.map((d) => arcGenerator(d));

  // Clear old paths + legend before drawing again
  const svg = d3.select('#projects-pie-plot');
  svg.selectAll('path').remove();
  const legend = d3.select('.legend');
  legend.selectAll('li').remove();

  if (data.length === 0) {
    legend.append('li').attr('class', 'legend-empty').text('No projects match');
    return;
  }

  arcs.forEach((arc, i) => {
    const d = data[i];
    svg
      .append('path')
      .attr('d', arc)
      .attr('style', `--color:${colors(d.label)}`)
      .attr('class', d.label === selectedYear ? 'selected' : null)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-pressed', d.label === selectedYear)
      .attr('aria-label', `${d.label}: ${d.value} project${d.value === 1 ? '' : 's'}`)
      .on('click', () => toggleYear(d.label))
      .on('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleYear(d.label);
        }
      });
  });

  data.forEach((d) => {
    legend
      .append('li')
      .attr('style', `--color:${colors(d.label)}`)
      .attr('class', d.label === selectedYear ? 'legend-item selected' : 'legend-item')
      .html(`<button type="button" aria-pressed="${d.label === selectedYear}"><span class="swatch"></span> ${d.label} <em>(${d.value})</em></button>`)
      .select('button')
      .on('click', () => toggleYear(d.label));
  });
}

function toggleYear(year) {
  selectedYear = selectedYear === year ? null : year;
  update();
}

function update() {
  // Pie shows everything matching the search, so you can still pick any year
  const searchFiltered = projects.filter(matchesQuery);

  // If the selected year no longer exists in the search results, clear it
  if (selectedYear !== null && !searchFiltered.some((p) => p.year === selectedYear)) {
    selectedYear = null;
  }

  // Project list uses BOTH filters
  const visible = searchFiltered.filter(matchesYear);

  renderPieChart(searchFiltered);
  renderProjects(visible, projectsContainer, 'h2');

  projectsTitle.textContent = `${projects.length} Projects`;
  const parts = [];
  if (query) parts.push(`matching “${query}”`);
  if (selectedYear) parts.push(`from ${selectedYear}`);
  filterStatus.textContent = parts.length
    ? `Showing ${visible.length} of ${projects.length} projects ${parts.join(' ')}`
    : '';
}

searchInput.addEventListener('input', (event) => {
  query = event.target.value;
  update();
});

// First render on page load
update();
