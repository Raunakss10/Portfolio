import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

const REPO_URL = 'https://github.com/Raunakss10/Portfolio/commit/';

const width = 1000;
const height = 600;
const margin = { top: 10, right: 10, bottom: 30, left: 40 };
const usableArea = {
  top: margin.top,
  right: width - margin.right,
  bottom: height - margin.bottom,
  left: margin.left,
  width: width - margin.left - margin.right,
  height: height - margin.top - margin.bottom,
};

let xScale;
let yScale;
let rScale;
let timeScale;
let commits = [];
let filteredCommits = [];
let commitProgress = 100;
let commitMaxTime;
let brushSelection = null;

const typeColors = d3.scaleOrdinal(d3.schemeTableau10);
const typeLabel = (type) => String(type).toUpperCase();

async function loadData() {
  return d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      const { author, date, time, timezone, datetime } = lines[0];
      const ret = {
        id: commit,
        url: REPO_URL + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      Object.defineProperty(ret, 'lines', {
        value: lines,
        configurable: false,
        writable: false,
        enumerable: false,
      });

      return ret;
    })
    .sort((a, b) => a.datetime - b.datetime);
}

function renderCommitInfo(commitsGiven) {
  const container = d3.select('#stats');
  container.selectAll('*').remove();

  const lines = commitsGiven.flatMap((d) => d.lines);
  const dl = container.append('dl').attr('class', 'stats');

  const addStat = (label, value) => {
    dl.append('dt').html(label);
    dl.append('dd').text(value);
  };

  if (lines.length === 0) {
    addStat('Commits', 0);
    return;
  }

  addStat('Total <abbr title="Lines of code">LOC</abbr>', lines.length);
  addStat('Commits', commitsGiven.length);
  addStat('Files', d3.group(lines, (d) => d.file).size);

  const fileLengths = d3.rollups(lines, (v) => d3.max(v, (d) => d.line), (d) => d.file);
  addStat('Avg file length', Math.round(d3.mean(fileLengths, (d) => d[1])));
  addStat('Max depth', d3.max(lines, (d) => d.depth));

  const workByPeriod = d3.rollups(
    lines,
    (v) => v.length,
    (d) => d.datetime.toLocaleString('en', { dayPeriod: 'short' }),
  );
  const period = d3.greatest(workByPeriod, (d) => d[1])?.[0] ?? '-';
  addStat('Most active', period.replace(/^(in the|at) /, ''));
}

function renderTooltipContent(commit) {
  if (!commit || Object.keys(commit).length === 0) return;
  const link = document.getElementById('commit-link');
  link.href = commit.url;
  link.textContent = commit.id.slice(0, 7);
  document.getElementById('commit-date').textContent = commit.datetime.toLocaleString('en', { dateStyle: 'full' });
  document.getElementById('commit-time-tip').textContent = commit.datetime.toLocaleString('en', { timeStyle: 'short' });
  document.getElementById('commit-author').textContent = commit.author;
  document.getElementById('commit-lines').textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  document.getElementById('commit-tooltip').hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  let x = event.clientX;
  let y = event.clientY;
  if (x === undefined || (x === 0 && y === 0)) {
    const box = event.currentTarget.getBoundingClientRect();
    x = box.right;
    y = box.bottom;
  }
  const pad = 12;
  const w = tooltip.offsetWidth || 260;
  const h = tooltip.offsetHeight || 150;
  tooltip.style.left = `${Math.min(x + pad, window.innerWidth - w - pad)}px`;
  tooltip.style.top = `${Math.min(y + pad, window.innerHeight - h - pad)}px`;
}

function xDomainFor(commitsGiven) {
  const [min, max] = d3.extent(commitsGiven, (d) => d.datetime);
  if (!min) return d3.extent(commits, (d) => d.datetime);
  if (+min === +max) {
    return [d3.timeHour.offset(min, -12), d3.timeHour.offset(max, 12)];
  }
  return [min, max];
}

function renderScatterPlot(commitsGiven) {
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Scatterplot of commits by date and time of day, dot size shows lines edited')
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(xDomainFor(commitsGiven))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3.scaleLinear().domain([0, 24]).range([usableArea.bottom, usableArea.top]);

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([3, 28]);

  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);
  gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));
  gridlines
    .selectAll('.tick line')
    .attr('stroke', (d) => d3.interpolateRgb('#4a7bd0', '#f0a04b')((1 - Math.cos((d / 24) * 2 * Math.PI)) / 2));

  svg.append('g').attr('class', 'dots');

  svg
    .append('g')
    .attr('class', 'axis x-axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(d3.axisBottom(xScale));

  svg
    .append('g')
    .attr('class', 'axis y-axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'));

  updateScatterPlot(commitsGiven);
  createBrushSelector(svg);
}

function updateScatterPlot(commitsGiven) {
  const svg = d3.select('#chart').select('svg');

  xScale.domain(xDomainFor(commitsGiven)).nice();

  svg
    .select('g.x-axis')
    .transition()
    .duration(300)
    .call(d3.axisBottom(xScale));

  const sortedCommits = d3.sort(commitsGiven, (d) => -d.totalLines);

  svg
    .select('g.dots')
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('tabindex', 0)
    .attr('aria-label', (d) => `Commit ${d.id.slice(0, 7)}, ${d.totalLines} lines, ${d.datetime.toLocaleString('en')}`)
    .style('--r', (d) => rScale(d.totalLines))
    .on('mouseenter focus', (event, commit) => {
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', (event) => updateTooltipPosition(event))
    .on('mouseleave blur', () => updateTooltipVisibility(false));

  applyBrush();
}

function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function brushed(event) {
  brushSelection = event.selection;
  applyBrush();
}

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function applyBrush() {
  d3.selectAll('#chart circle').classed('selected', (d) => isCommitSelected(brushSelection, d));
  const selectedCommits = brushSelection
    ? filteredCommits.filter((d) => isCommitSelected(brushSelection, d))
    : [];
  renderSelectionCount(selectedCommits);
  renderLanguageBreakdown(selectedCommits);
}

function renderSelectionCount(selectedCommits) {
  const n = selectedCommits.length;
  document.querySelector('#selection-count').textContent = `${n || 'No'} commit${n === 1 ? '' : 's'} selected`;
}

function renderLanguageBreakdown(selectedCommits) {
  const container = document.getElementById('language-breakdown');
  container.innerHTML = '';
  if (selectedCommits.length === 0) return;

  const lines = selectedCommits.flatMap((d) => d.lines);
  const breakdown = d3.rollup(lines, (v) => v.length, (d) => d.type);

  for (const [language, count] of breakdown) {
    const formatted = d3.format('.1~%')(count / lines.length);
    container.innerHTML += `<dt>${typeLabel(language)}</dt><dd>${count} lines <span>(${formatted})</span></dd>`;
  }
}

function updateFileDisplay(commitsGiven) {
  const lines = commitsGiven.flatMap((d) => d.lines);
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select('#files')
    .selectAll('div.file')
    .data(files, (d) => d.name)
    .join((enter) =>
      enter
        .append('div')
        .attr('class', 'file')
        .call((div) => {
          const dt = div.append('dt');
          dt.append('code');
          dt.append('small');
          div.append('dd');
        }),
    );

  filesContainer.select('dt > code').text((d) => d.name);
  filesContainer.select('dt > small').text((d) => `${d.lines.length} lines`);

  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines, (d) => `${d.file}:${d.line}`)
    .join('div')
    .attr('class', 'loc')
    .attr('title', (d) => `${d.file}, line ${d.line}`)
    .attr('style', (d) => `--color: ${typeColors(d.type)}`);
}

function renderTypeLegend() {
  const types = typeColors.domain();
  d3.select('.type-legend')
    .selectAll('li')
    .data(types)
    .join('li')
    .attr('style', (d) => `--color: ${typeColors(d)}`)
    .html((d) => `<span class="swatch"></span>${typeLabel(d)}`);
}

function setMaxTime(time, { syncSlider = true } = {}) {
  commitMaxTime = time;
  commitProgress = timeScale(time);
  if (syncSlider) {
    document.getElementById('commit-progress').value = commitProgress;
  }
  document.getElementById('commit-time').textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  renderCommitInfo(filteredCommits);
  updateScatterPlot(filteredCommits);
  updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
  commitProgress = Number(document.getElementById('commit-progress').value);
  setMaxTime(timeScale.invert(commitProgress), { syncSlider: false });
}

function mainType(lines) {
  return typeLabel(d3.greatest(d3.rollups(lines, (v) => v.length, (d) => d.type), (d) => d[1])?.[0] ?? '');
}

function renderStories() {
  d3.select('#scatter-story')
    .selectAll('.step')
    .data(commits)
    .join('div')
    .attr('class', 'step')
    .html((d, i) => {
      const fileCount = d3.group(d.lines, (l) => l.file).size;
      const when = d.datetime.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' });
      const what = i === 0 ? 'my first commit' : `commit #${i + 1}`;
      return `<p class="step-date">${when}</p>
        <p>I made <a href="${d.url}" target="_blank" rel="noopener">${what}</a>.
        It still accounts for <strong>${d.totalLines} lines</strong> across ${fileCount} file${fileCount === 1 ? '' : 's'}, mostly ${mainType(d.lines)}.</p>`;
    });

  d3.select('#files-story')
    .selectAll('.step')
    .data(commits)
    .join('div')
    .attr('class', 'step')
    .html((d, i) => {
      const lines = commits.slice(0, i + 1).flatMap((c) => c.lines);
      const files = d3.rollups(lines, (v) => v.length, (l) => l.file).sort((a, b) => b[1] - a[1]);
      const [leader, leaderLines] = files[0];
      const when = d.datetime.toLocaleString('en', { dateStyle: 'medium' });
      return `<p class="step-date">${when}</p>
        <p>The site now has <strong>${lines.length} lines</strong> in ${files.length} file${files.length === 1 ? '' : 's'}.
        In the lead: <code>${leader}</code> with ${leaderLines} lines.</p>`;
    });
}

function setupScrolly(container) {
  const scroller = scrollama();
  scroller
    .setup({ container, step: `${container} .step`, offset: 0.5 })
    .onStepEnter((response) => {
      d3.selectAll(`${container} .step`).classed('is-active', false);
      response.element.classList.add('is-active');
      setMaxTime(response.element.__data__.datetime);
    });
  window.addEventListener('resize', () => scroller.resize());
}

const data = await loadData();
commits = processCommits(data);
filteredCommits = commits;

typeColors.domain(Array.from(new Set(data.map((d) => d.type))).sort());

timeScale = d3
  .scaleTime()
  .domain([d3.min(commits, (d) => d.datetime), d3.max(commits, (d) => d.datetime)])
  .range([0, 100]);

renderScatterPlot(commits);
renderTypeLegend();
renderStories();

document.getElementById('commit-progress').addEventListener('input', onTimeSliderChange);
onTimeSliderChange();

setupScrolly('#scrolly-1');
setupScrolly('#scrolly-2');
