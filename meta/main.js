import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Scales live out here so the brush functions can use them (Step 5.4)
let xScale, yScale;
let commits = [];

// ---------- Step 1.1: Load the CSV ----------
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
  return data;
}

// ---------- Step 1.2: One object per commit ----------
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      const first = lines[0];
      const { author, date, time, timezone, datetime } = first;
      const ret = {
        id: commit,
        url: 'https://github.com/Raunakss10/Portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      // Hidden so it doesn't clutter console.log, but still usable later
      Object.defineProperty(ret, 'lines', {
        value: lines,
        configurable: false,
        writable: false,
        enumerable: false,
      });

      return ret;
    });
}

// ---------- Step 1.3: Summary stats ----------
function renderCommitInfo(data, commits) {
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  const addStat = (label, value) => {
    dl.append('dt').html(label);
    dl.append('dd').text(value);
  };

  // Aggregates over the whole dataset
  addStat('Total <abbr title="Lines of code">LOC</abbr>', data.length);
  addStat('Commits', commits.length);

  // Number of distinct values
  addStat('Files', d3.group(data, (d) => d.file).size);

  // Grouped aggregate: average file length
  const fileLengths = d3.rollups(data, (v) => d3.max(v, (d) => d.line), (d) => d.file);
  addStat('Avg file length', Math.round(d3.mean(fileLengths, (d) => d[1])));

  addStat('Max depth', d3.max(data, (d) => d.depth));

  // Min/max value: time of day with the most work
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => d.datetime.toLocaleString('en', { dayPeriod: 'short' }),
  );
  addStat('Most active', (d3.greatest(workByPeriod, (d) => d[1])?.[0] ?? '—').replace(/^(in the|at) /, ''));
}

// ---------- Step 3: Tooltip ----------
function renderTooltipContent(commit) {
  if (!commit || Object.keys(commit).length === 0) return;
  document.getElementById('commit-link').href = commit.url;
  document.getElementById('commit-link').textContent = commit.id.slice(0, 7);
  document.getElementById('commit-date').textContent = commit.datetime.toLocaleString('en', { dateStyle: 'full' });
  document.getElementById('commit-time').textContent = commit.datetime.toLocaleString('en', { timeStyle: 'short' });
  document.getElementById('commit-author').textContent = commit.author;
  document.getElementById('commit-lines').textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  document.getElementById('commit-tooltip').hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  // Keyboard focus has no mouse position, so use the dot's position instead
  let x = event.clientX;
  let y = event.clientY;
  if (x === undefined || (x === 0 && y === 0)) {
    const box = event.currentTarget.getBoundingClientRect();
    x = box.right;
    y = box.bottom;
  }
  // Offset from the cursor and keep it on screen
  const pad = 12;
  const w = tooltip.offsetWidth || 260;
  const h = tooltip.offsetHeight || 150;
  tooltip.style.left = `${Math.min(x + pad, window.innerWidth - w - pad)}px`;
  tooltip.style.top = `${Math.min(y + pad, window.innerHeight - h - pad)}px`;
}

// ---------- Step 2 + 4: Scatterplot ----------
function renderScatterPlot(data, commits) {
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

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Scatterplot of commits by date and time of day, dot size shows lines edited')
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3.scaleLinear().domain([0, 24]).range([usableArea.bottom, usableArea.top]);

  // Gridlines first so they sit behind everything, colored by time of day
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);
  gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));
  // Night = blue, day = orange (cosine of the hour, so midnight is coolest and noon warmest)
  gridlines
    .selectAll('.tick line')
    .attr('stroke', (d) => d3.interpolateRgb('#4a7bd0', '#f0a04b')((1 - Math.cos((d / 24) * 2 * Math.PI)) / 2));

  // Step 4: dot size by lines edited, sqrt so AREA matches the number
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([3, 28]);

  // Big dots first so small ones stay on top and hoverable
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  const dots = svg.append('g').attr('class', 'dots');
  dots
    .selectAll('circle')
    .data(sortedCommits)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('tabindex', 0)
    .attr('aria-label', (d) => `Commit ${d.id.slice(0, 7)}, ${d.totalLines} lines, ${d.datetime.toLocaleString('en')}`)
    .style('fill-opacity', 0.7)
    .on('mouseenter focus', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', (event) => updateTooltipPosition(event))
    .on('mouseleave blur', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  // Axes
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3.axisLeft(yScale).tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg.append('g').attr('class', 'axis').attr('transform', `translate(0, ${usableArea.bottom})`).call(xAxis);
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${usableArea.left}, 0)`).call(yAxis);

  createBrushSelector(svg);
}

// ---------- Step 5: Brushing ----------
function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));
  // Put dots (and anything after the overlay) above the brush overlay so tooltips still work
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('#chart circle').classed('selected', (d) => isCommitSelected(selection, d));
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection) {
  const selectedCommits = selection ? commits.filter((d) => isCommitSelected(selection, d)) : [];
  document.querySelector('#selection-count').textContent =
    `${selectedCommits.length || 'No'} commit${selectedCommits.length === 1 ? '' : 's'} selected`;
  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection ? commits.filter((d) => isCommitSelected(selection, d)) : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);
  const breakdown = d3.rollup(lines, (v) => v.length, (d) => d.type);

  container.innerHTML = '';
  for (const [language, count] of breakdown) {
    const formatted = d3.format('.1~%')(count / lines.length);
    container.innerHTML += `<dt>${language}</dt><dd>${count} lines <span>(${formatted})</span></dd>`;
  }
}

// ---------- Run ----------
const data = await loadData();
commits = processCommits(data);
renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
