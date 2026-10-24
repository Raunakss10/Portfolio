import { fetchJSON, renderProjects, fetchGitHubData } from './global.js';

// Latest 3 projects
const projects = await fetchJSON('./lib/projects.json');
const latestProjects = Array.isArray(projects) ? projects.slice(0, 3) : [];
const projectsContainer = document.querySelector('.projects');
renderProjects(latestProjects, projectsContainer, 'h3');

// GitHub profile stats
const githubData = await fetchGitHubData('Raunakss10');
const profileStats = document.querySelector('#profile-stats');

if (profileStats) {
  if (githubData) {
    profileStats.innerHTML = `
      <h2>GitHub Profile Stats</h2>
      <dl>
        <dt>Public Repos</dt><dd>${githubData.public_repos}</dd>
        <dt>Public Gists</dt><dd>${githubData.public_gists}</dd>
        <dt>Followers</dt><dd>${githubData.followers}</dd>
        <dt>Following</dt><dd>${githubData.following}</dd>
      </dl>
    `;
  } else {
    profileStats.innerHTML = '<h2>GitHub Profile Stats</h2><p class="empty">Couldn’t load GitHub stats right now.</p>';
  }
}
