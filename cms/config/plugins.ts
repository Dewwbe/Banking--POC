export default ({ env }) => {
  const maxBytes = env.int('UPLOAD_MAX_FILE_SIZE_MB', 10) * 1024 * 1024;

  // Workstream E — upload restrictions (SEC-12..14). Strapi 5 supports allow/deny lists by MIME type
  // in the upload plugin's `security` option. Verify behaviour with the files in /samples/upload-tests.
  // Malware scanning is NOT built in: see docs/05-security-checklist.md for the ClamAV integration option.
  const uploadSecurity = {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
    deniedTypes: ['image/svg+xml', 'text/html', 'application/x-msdownload', 'application/javascript'],
  };

  const upload =
    env('UPLOAD_PROVIDER', 'local') === 's3'
      ? {
          config: {
            provider: 'aws-s3',
            providerOptions: {
              baseUrl: env('S3_PUBLIC_URL'),
              s3Options: {
                credentials: {
                  accessKeyId: env('S3_ACCESS_KEY_ID'),
                  secretAccessKey: env('S3_ACCESS_SECRET'),
                },
                region: env('S3_REGION'),
                endpoint: env('S3_ENDPOINT'),
                forcePathStyle: true,
                params: { Bucket: env('S3_BUCKET') },
              },
            },
            sizeLimit: maxBytes,
            security: uploadSecurity,
          },
        }
      : { config: { sizeLimit: maxBytes, security: uploadSecurity } };

  return {
    upload,
    'users-permissions': {
      config: {
        jwt: { expiresIn: '1h' },
        // The public website has no end-user accounts; registration is disabled in bootstrap as well.
        ratelimit: { interval: 60000, max: 10 },
      },
    },
    graphql: {
      enabled: env.bool('GRAPHQL_ENABLED', false),
      config: {
        endpoint: '/graphql',
        shadowCRUD: true,
        playgroundAlways: false,
        landingPage: env('NODE_ENV') !== 'production',
        depthLimit: 7,
        amountLimit: 100,
        apolloServer: { introspection: env('NODE_ENV') !== 'production' },
      },
    },
  };
};
