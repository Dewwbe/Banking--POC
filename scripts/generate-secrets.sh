#!/usr/bin/env bash
# Prints fresh random values for every Strapi secret. Usage:
#   cp .env.example .env && ./scripts/generate-secrets.sh   # then paste the output over the CHANGE_ME lines
set -euo pipefail
r() { openssl rand -base64 32 | tr -d '\n'; }
echo "DATABASE_PASSWORD=$(openssl rand -hex 16)"
echo "APP_KEYS=$(r),$(r),$(r),$(r)"
echo "API_TOKEN_SALT=$(r)"
echo "ADMIN_JWT_SECRET=$(r)"
echo "TRANSFER_TOKEN_SALT=$(r)"
echo "JWT_SECRET=$(r)"
echo "ENCRYPTION_KEY=$(r)"
echo "REVALIDATE_SECRET=$(openssl rand -hex 24)"
echo "S3_ACCESS_SECRET=$(openssl rand -hex 16)"
