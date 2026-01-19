async function makeRequestToGitHubAPI(url, token) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  const result = await response.json();
  return result;
}

module.exports = {
  makeRequestToGitHubAPI
};
