export default {
  rest: {
    defaultLimit: 25,
    maxLimit: 100, // caps ?pagination[pageSize] — limits scraping / heavy queries on the public API
    withCount: true,
  },
};
