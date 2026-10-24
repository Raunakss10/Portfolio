import { fetchJSON, renderProjects } from './global.js';

const projects = await fetchJSON('./lib/projects.json');
const projectsContainer = document.querySelector('.projects');
renderProjects(projects, projectsContainer, 'h2');

// Count projects in the page title (updates automatically when the JSON changes)
const projectsTitle = document.querySelector('.projects-title');
if (projectsTitle) {
  const count = Array.isArray(projects) ? projects.length : 0;
  projectsTitle.textContent = `${count} Projects`;
}
