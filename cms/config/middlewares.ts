export default ({ env }) => {
  const s3Public = env('UPLOAD_PROVIDER', 'local') === 's3' ? [env('S3_PUBLIC_URL', '')] : [];
  const maxBytes = env.int('UPLOAD_MAX_FILE_SIZE_MB', 10) * 1024 * 1024;

  return [
    'strapi::logger',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'connect-src': ["'self'", 'https:'],
            'img-src': ["'self'", 'data:', 'blob:', ...s3Public],
            'media-src': ["'self'", 'data:', 'blob:', ...s3Public],
            upgradeInsecureRequests: null,
          },
        },
        frameguard: { action: 'deny' },
        hsts: { maxAge: 31536000, includeSubDomains: true },
      },
    },
    {
      // Workstream E — CORS: only the public website origin(s) may call the API from a browser.
      name: 'strapi::cors',
      config: {
        origin: env.array('CORS_ORIGINS', ['http://localhost:3000']),
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
        headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
        keepHeaderOnError: true,
      },
    },
    'strapi::poweredBy',
    'strapi::query',
    {
      name: 'strapi::body',
      config: {
        formLimit: '1mb',
        jsonLimit: '1mb',
        textLimit: '1mb',
        formidable: { maxFileSize: maxBytes },
      },
    },
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
  ];
};
