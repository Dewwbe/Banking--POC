// Workstream F — basic load/performance check of the public API and the Next.js site.
// Run: docker compose --profile loadtest run --rm k6
// Record p95 latency and error rate in the report; this is an indicative test, not a capacity test.
import http from 'k6/http';
import { check, sleep } from 'k6';

const CMS = __ENV.CMS_URL || 'http://localhost:1337';
const WEB = __ENV.WEB_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    api: { executor: 'constant-vus', vus: 20, duration: '1m', exec: 'api' },
    web: { executor: 'constant-vus', vus: 20, duration: '1m', exec: 'web' },
  },
  thresholds: {
    'http_req_duration{scenario:api}': ['p(95)<500'],
    'http_req_duration{scenario:web}': ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

export function api() {
  const r = http.get(`${CMS}/api/products?locale=en&populate=*`);
  check(r, { 'api 200': (x) => x.status === 200 });
  sleep(0.5);
}

export function web() {
  const r = http.get(`${WEB}/en/products`);
  check(r, { 'web 200': (x) => x.status === 200 });
  sleep(0.5);
}
